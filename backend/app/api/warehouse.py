"""
Data Warehouse API — Medallion architecture, Star Schema, SCD, ETL, OLAP.
"""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, create_engine, text
import pandas as pd
import numpy as np
from datetime import datetime, timezone

from app.database.session import get_db, AsyncSessionLocal
from app.models import User, Project, Dataset, WarehouseModel, WarehouseTable, WarehouseLineage, BackgroundJob
from app.schemas.schemas import WarehouseModelCreate, WarehouseModelOut
from app.auth.dependencies import get_current_user
from app.core.config import settings
from app.core.logging_config import logger

router = APIRouter(prefix="/warehouse", tags=["Data Warehouse"])


def _sync_engine():
    url = settings.DATABASE_URL.replace("sqlite+aiosqlite", "sqlite").replace("+aiosqlite", "")
    return create_engine(url, connect_args={"check_same_thread": False})


@router.post("/models", response_model=WarehouseModelOut, status_code=201)
@router.post("/models/{project_id}", response_model=WarehouseModelOut, status_code=201)
async def create_warehouse_model(
    payload: Dict[str, Any],
    project_id: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    target_project_id = project_id or payload.get("project_id")
    if not target_project_id:
        raise HTTPException(400, "project_id is required")

    proj = await db.execute(select(Project).where(Project.id == target_project_id))
    proj = proj.scalars().first()
    if not proj or (proj.owner_id != user.id and not user.is_admin):
        raise HTTPException(403, "Access denied")

    model = WarehouseModel(
        project_id=target_project_id,
        name=payload.get("name", "Untitled Model"),
        model_type=payload.get("model_type", "star"),
        grain=payload.get("grain", ""),
        description=payload.get("description", ""),
        fact_table_name=payload.get("fact_table_name", ""),
        dimension_tables_json=payload.get("dimension_tables", []),
    )
    db.add(model)
    await db.flush()
    await db.refresh(model)
    return model


@router.get("/models/project/{project_id}", response_model=List[WarehouseModelOut])
@router.get("/models/{project_id}", response_model=List[WarehouseModelOut])
async def list_warehouse_models(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    proj = await db.execute(select(Project).where(Project.id == project_id))
    proj = proj.scalars().first()
    if not proj or (proj.owner_id != user.id and not user.is_admin):
        raise HTTPException(403, "Access denied")
    result = await db.execute(select(WarehouseModel).where(WarehouseModel.project_id == project_id))
    return result.scalars().all()


@router.post("/etl", response_model=dict)
@router.post("/etl/{project_id}", response_model=dict)
async def run_etl(
    payload: Dict[str, Any],
    background_tasks: BackgroundTasks,
    project_id: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Execute an ETL job: Bronze → Silver (clean) → Gold (aggregate/mart)."""
    target_project_id = project_id or payload.get("project_id")
    if not target_project_id:
        raise HTTPException(400, "project_id is required")

    proj = await db.execute(select(Project).where(Project.id == target_project_id))
    proj = proj.scalars().first()
    if not proj or (proj.owner_id != user.id and not user.is_admin):
        raise HTTPException(403, "Access denied")

    source_dataset_id = payload.get("source_dataset_id")
    target_layer = payload.get("target_layer", "silver")
    operations = payload.get("operations", [])

    # Verify source dataset
    ds = await db.execute(select(Dataset).where(Dataset.id == source_dataset_id, Dataset.project_id == project_id))
    ds = ds.scalars().first()
    if not ds:
        raise HTTPException(404, "Source dataset not found")

    job = BackgroundJob(
        project_id=project_id,
        job_type="etl",
        status="pending",
        description=f"ETL: {ds.name} → {target_layer}",
        metadata_json={"source_dataset_id": source_dataset_id, "target_layer": target_layer, "operations": operations},
    )
    db.add(job)
    await db.flush()

    background_tasks.add_task(_run_etl_job, job.id, ds.table_name, ds.name, project_id, target_layer, operations)

    return {"job_id": job.id, "status": "pending", "message": f"ETL job started for dataset '{ds.name}'"}


@router.post("/olap/cube", response_model=dict)
async def olap_cube(
    payload: Dict[str, Any],
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Execute OLAP cube aggregation by table_name, dimensions, and measures."""
    table_name = payload.get("table_name")
    if not table_name:
        raise HTTPException(400, "table_name is required")

    # Verify user owns dataset or warehouse table with this table_name
    ds = await db.execute(
        select(Dataset).join(Project, Dataset.project_id == Project.id)
        .where(Dataset.table_name == table_name, Project.owner_id == user.id)
    )
    dataset = ds.scalars().first()
    if not dataset and not user.is_admin:
        wt = await db.execute(
            select(WarehouseTable).join(WarehouseModel, WarehouseTable.warehouse_model_id == WarehouseModel.id)
            .join(Project, WarehouseModel.project_id == Project.id)
            .where(WarehouseTable.table_name == table_name, Project.owner_id == user.id)
        )
        if not wt.scalars().first():
            raise HTTPException(403, f"Access denied to table '{table_name}'")

    dimensions = payload.get("dimensions", [])
    raw_measures = payload.get("measures", [])
    filters = payload.get("filters", {})
    operation = payload.get("operation", "rollup")

    engine = _sync_engine()
    try:
        df = pd.read_sql_table(table_name, engine)
    except Exception as e:
        raise HTTPException(500, f"Could not read table '{table_name}': {str(e)}")
    finally:
        engine.dispose()

    # Apply filters
    if isinstance(filters, dict):
        for col, val in filters.items():
            if col in df.columns:
                if isinstance(val, list):
                    df = df[df[col].isin(val)]
                else:
                    df = df[df[col] == val]

    valid_dims = [d for d in dimensions if d in df.columns]

    agg_dict = {}
    valid_meas_cols = []
    for m in raw_measures:
        if isinstance(m, dict):
            m_col = m.get("column")
            m_agg = m.get("agg", "sum").lower()
            if m_col and m_col in df.columns and pd.api.types.is_numeric_dtype(df[m_col]):
                agg_dict[m_col] = m_agg
                valid_meas_cols.append(m_col)
        elif isinstance(m, str) and m in df.columns and pd.api.types.is_numeric_dtype(df[m]):
            agg_dict[m] = "sum"
            valid_meas_cols.append(m)

    if not valid_meas_cols:
        num_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
        if num_cols:
            valid_meas_cols = num_cols[:2]
            agg_dict = {c: "sum" for c in valid_meas_cols}

    if valid_dims and valid_meas_cols:
        grouped = df.groupby(valid_dims)[valid_meas_cols].agg(agg_dict).reset_index()
        rows = grouped.replace({np.nan: None}).to_dict(orient="records")
        columns = valid_dims + valid_meas_cols
    elif valid_dims:
        grouped = df.groupby(valid_dims).size().reset_index(name="record_count")
        rows = grouped.replace({np.nan: None}).to_dict(orient="records")
        columns = valid_dims + ["record_count"]
    elif valid_meas_cols:
        agg_res = df[valid_meas_cols].agg(agg_dict).to_dict()
        rows = [{k: round(v, 4) if isinstance(v, float) else v for k, v in agg_res.items()}]
        columns = valid_meas_cols
    else:
        rows = [{"total_records": len(df)}]
        columns = ["total_records"]

    return {
        "table_name": table_name,
        "operation": operation,
        "dimensions": valid_dims,
        "measures": valid_meas_cols,
        "columns": columns,
        "rows": rows[:1000],
        "data": rows[:1000],
        "row_count": len(rows),
    }


@router.post("/olap/{project_id}", response_model=dict)
async def olap_query(
    project_id: str,
    payload: Dict[str, Any],
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Execute OLAP operations: roll-up, drill-down, slice, dice, pivot."""
    proj = await db.execute(select(Project).where(Project.id == project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")

    dataset_id = payload.get("dataset_id")
    operation = payload.get("operation", "rollup")  # rollup | drilldown | slice | dice | pivot
    dimensions = payload.get("dimensions", [])
    measures = payload.get("measures", [])
    filters = payload.get("filters", {})
    agg_func = payload.get("agg_func", "sum")

    ds = await db.execute(select(Dataset).where(Dataset.id == dataset_id, Dataset.project_id == project_id))
    ds = ds.scalars().first()
    if not ds:
        raise HTTPException(404, "Dataset not found")

    engine = _sync_engine()
    try:
        df = pd.read_sql_table(ds.table_name, engine)
    except Exception as e:
        raise HTTPException(500, f"Could not read dataset: {str(e)}")
    finally:
        engine.dispose()

    # Apply filters (slice/dice)
    for col, val in filters.items():
        if col in df.columns:
            if isinstance(val, list):
                df = df[df[col].isin(val)]
            else:
                df = df[df[col] == val]

    valid_dims = [d for d in dimensions if d in df.columns]
    valid_measures = [m for m in measures if m in df.columns and pd.api.types.is_numeric_dtype(df[m])]

    if not valid_measures:
        valid_measures = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])][:3]

    # Aggregation
    agg_fns = {"sum": "sum", "mean": "mean", "count": "count", "min": "min", "max": "max"}
    agg_fn = agg_fns.get(agg_func, "sum")

    if valid_dims:
        if operation == "pivot" and len(valid_dims) >= 2:
            pivot = df.pivot_table(index=valid_dims[0], columns=valid_dims[1], values=valid_measures[0], aggfunc=agg_fn, fill_value=0)
            result_data = pivot.reset_index().to_dict(orient="records")
            columns = [valid_dims[0]] + [str(c) for c in pivot.columns.tolist()]
        else:
            grouped = df.groupby(valid_dims)[valid_measures].agg(agg_fn).reset_index()
            result_data = grouped.replace({np.nan: None}).to_dict(orient="records")
            columns = valid_dims + valid_measures
    else:
        agg_result = df[valid_measures].agg(agg_fn).to_dict()
        result_data = [{k: round(v, 4) if isinstance(v, float) else v for k, v in agg_result.items()}]
        columns = valid_measures

    return {
        "operation": operation,
        "dimensions": valid_dims,
        "measures": valid_measures,
        "agg_func": agg_func,
        "row_count": len(result_data),
        "columns": columns,
        "data": result_data[:1000],
    }


@router.get("/lineage/{project_id}", response_model=list)
async def get_lineage(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    proj = await db.execute(select(Project).where(Project.id == project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")

    result = await db.execute(select(WarehouseLineage).where(WarehouseLineage.project_id == project_id).order_by(WarehouseLineage.executed_at.desc()))
    lineage = result.scalars().all()
    return [
        {
            "id": l.id,
            "source_table": l.source_table,
            "target_table": l.target_table,
            "operation_type": l.operation_type,
            "executed_at": l.executed_at.isoformat(),
        }
        for l in lineage
    ]


@router.post("/scd/{project_id}", response_model=dict)
async def apply_scd(
    project_id: str,
    payload: Dict[str, Any],
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Apply Slowly Changing Dimension handling (Type 1 or Type 2)."""
    proj = await db.execute(select(Project).where(Project.id == project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")

    dataset_id = payload.get("dataset_id")
    scd_type = int(payload.get("scd_type", 1))
    business_key = payload.get("business_key")
    attributes = payload.get("attributes", [])

    ds = await db.execute(select(Dataset).where(Dataset.id == dataset_id, Dataset.project_id == project_id))
    ds = ds.scalars().first()
    if not ds:
        raise HTTPException(404, "Dataset not found")

    engine = _sync_engine()
    df = pd.read_sql_table(ds.table_name, engine)
    engine.dispose()

    if business_key not in df.columns:
        raise HTTPException(400, f"Business key '{business_key}' not found in dataset")

    target_table = f"scd{scd_type}_{ds.table_name}"

    if scd_type == 1:
        # SCD Type 1: Overwrite — simply write the latest values
        engine = _sync_engine()
        df.to_sql(target_table, engine, if_exists="replace", index=False)
        engine.dispose()
        msg = f"SCD Type 1 applied: {len(df)} rows written to '{target_table}'"

    elif scd_type == 2:
        # SCD Type 2: Preserve history
        now = datetime.now(timezone.utc).isoformat()
        engine = _sync_engine()
        try:
            existing = pd.read_sql_table(target_table, engine)
        except Exception:
            existing = pd.DataFrame()
        engine.dispose()

        if existing.empty:
            df["valid_from"] = now
            df["valid_to"] = None
            df["is_current"] = True
            engine = _sync_engine()
            df.to_sql(target_table, engine, if_exists="replace", index=False)
            engine.dispose()
        else:
            # Close out changed records
            current = existing[existing["is_current"] == True]
            merged = current.merge(df, on=business_key, suffixes=("_old", "_new"))
            changed_keys = []
            for col in attributes:
                old_col = f"{col}_old" if f"{col}_old" in merged.columns else col
                new_col = f"{col}_new" if f"{col}_new" in merged.columns else col
                if old_col in merged.columns and new_col in merged.columns:
                    changed = merged[merged[old_col] != merged[new_col]][business_key]
                    changed_keys.extend(changed.tolist())
            changed_keys = list(set(changed_keys))

            existing.loc[existing[business_key].isin(changed_keys) & existing["is_current"], ["valid_to", "is_current"]] = [now, False]
            new_rows = df[df[business_key].isin(changed_keys)].copy()
            new_rows["valid_from"] = now
            new_rows["valid_to"] = None
            new_rows["is_current"] = True

            result = pd.concat([existing, new_rows], ignore_index=True)
            engine = _sync_engine()
            result.to_sql(target_table, engine, if_exists="replace", index=False)
            engine.dispose()

        msg = f"SCD Type 2 applied: history preserved in '{target_table}'"
    else:
        raise HTTPException(400, "scd_type must be 1 or 2")

    # Record lineage
    db.add(WarehouseLineage(
        project_id=project_id,
        source_table=ds.table_name,
        target_table=target_table,
        operation_type=f"scd_type_{scd_type}",
        transformation_meta_json={"business_key": business_key, "attributes": attributes},
    ))

    return {"message": msg, "target_table": target_table, "scd_type": scd_type}


async def _run_etl_job(job_id, source_table, dataset_name, project_id, target_layer, operations):
    async with AsyncSessionLocal() as db:
        try:
            job = await db.get(BackgroundJob, job_id)
            job.status = "running"
            job.started_at = datetime.now(timezone.utc)
            await db.commit()

            engine = _sync_engine()
            df = pd.read_sql_table(source_table, engine)
            engine.dispose()

            original_rows = len(df)

            for op in operations:
                op_type = op.get("type")
                if op_type == "drop_nulls":
                    cols = op.get("columns", [])
                    if cols:
                        df = df.dropna(subset=cols)
                    else:
                        df = df.dropna()
                elif op_type == "fill_nulls":
                    for col, val in op.get("fill_values", {}).items():
                        if col in df.columns:
                            df[col].fillna(val, inplace=True)
                elif op_type == "deduplicate":
                    df = df.drop_duplicates()
                elif op_type == "rename_columns":
                    df.rename(columns=op.get("mapping", {}), inplace=True)
                elif op_type == "filter":
                    col, op_sym, val = op.get("column"), op.get("operator", "=="), op.get("value")
                    if col and col in df.columns:
                        if op_sym == "==":
                            df = df[df[col] == val]
                        elif op_sym == "!=":
                            df = df[df[col] != val]
                        elif op_sym == ">":
                            df = df[df[col] > val]
                        elif op_sym == "<":
                            df = df[df[col] < val]
                elif op_type == "cast_type":
                    col, dtype = op.get("column"), op.get("dtype")
                    if col and col in df.columns and dtype:
                        try:
                            df[col] = df[col].astype(dtype)
                        except Exception:
                            pass
                elif op_type == "add_column":
                    col_name = op.get("name")
                    expression = op.get("expression", "")
                    if col_name and expression:
                        try:
                            df[col_name] = df.eval(expression)
                        except Exception:
                            pass

            # Write to target layer table
            import re
            safe = re.sub(r"[^a-zA-Z0-9_]", "_", dataset_name.lower())
            target_table = f"{target_layer}_{safe}"[:60]

            engine = _sync_engine()
            df.to_sql(target_table, engine, if_exists="replace", index=False)
            engine.dispose()

            # Create new dataset record for the transformed data
            new_ds = Dataset(
                project_id=project_id,
                name=f"{dataset_name} [{target_layer.upper()}]",
                table_name=target_table,
                storage_layer=target_layer,
                row_count=len(df),
                column_count=len(df.columns),
                schema_json={c: str(df[c].dtype) for c in df.columns},
            )
            db.add(new_ds)

            # Record lineage
            db.add(WarehouseLineage(
                project_id=project_id,
                source_table=source_table,
                target_table=target_table,
                operation_type="etl",
                transformation_meta_json={"operations": operations, "layer": target_layer},
            ))

            job.status = "completed"
            job.progress_pct = 100
            job.completed_at = datetime.now(timezone.utc)
            job.log_output = f"ETL completed: {original_rows} rows in → {len(df)} rows out → {target_table}"
            await db.commit()

        except Exception as e:
            logger.error(f"ETL job {job_id} failed: {e}", exc_info=True)
            try:
                job = await db.get(BackgroundJob, job_id)
                job.status = "failed"
                job.error_details = str(e)
                job.completed_at = datetime.now(timezone.utc)
                await db.commit()
            except Exception:
                pass

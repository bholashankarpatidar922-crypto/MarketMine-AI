"""
Transformation Pipelines API — reusable ETL pipeline CRUD and execution.
"""
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, create_engine
import pandas as pd
from datetime import datetime, timezone

from app.database.session import get_db, AsyncSessionLocal
from app.models import User, Project, Dataset, TransformationPipeline, PipelineRun
from app.schemas.schemas import PipelineCreate, PipelineOut, PipelineRunOut
from app.auth.dependencies import get_current_user
from app.core.config import settings
from app.core.logging_config import logger

router = APIRouter(prefix="/pipelines", tags=["Transformation Pipelines"])


def _sync_engine():
    url = settings.DATABASE_URL.replace("sqlite+aiosqlite", "sqlite").replace("+aiosqlite", "")
    return create_engine(url, connect_args={"check_same_thread": False})


@router.post("/{project_id}", response_model=PipelineOut, status_code=201)
async def create_pipeline(
    project_id: str,
    payload: PipelineCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    proj = await db.execute(select(Project).where(Project.id == project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")

    pipeline = TransformationPipeline(
        project_id=project_id,
        name=payload.name,
        description=payload.description,
        definition_json=payload.definition_json,
    )
    db.add(pipeline)
    return pipeline


@router.get("/{project_id}", response_model=List[PipelineOut])
async def list_pipelines(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    proj = await db.execute(select(Project).where(Project.id == project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")
    result = await db.execute(select(TransformationPipeline).where(TransformationPipeline.project_id == project_id))
    return result.scalars().all()


@router.post("/{project_id}/{pipeline_id}/run", response_model=dict)
async def run_pipeline(
    project_id: str,
    pipeline_id: str,
    payload: Dict[str, Any],
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    proj = await db.execute(select(Project).where(Project.id == project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")

    pipeline = await db.execute(select(TransformationPipeline).where(
        TransformationPipeline.id == pipeline_id, TransformationPipeline.project_id == project_id
    ))
    pipeline = pipeline.scalars().first()
    if not pipeline:
        raise HTTPException(404, "Pipeline not found")

    source_id = payload.get("source_dataset_id")
    ds = await db.execute(select(Dataset).where(Dataset.id == source_id, Dataset.project_id == project_id))
    ds = ds.scalars().first()
    if not ds:
        raise HTTPException(404, "Source dataset not found")

    run = PipelineRun(
        pipeline_id=pipeline_id,
        source_dataset_id=source_id,
        status="pending",
    )
    db.add(run)
    await db.flush()

    background_tasks.add_task(
        _execute_pipeline_run, run.id, ds.table_name, pipeline.definition_json, project_id, ds.name
    )

    return {"run_id": run.id, "status": "pending"}


@router.get("/{project_id}/{pipeline_id}/runs", response_model=List[PipelineRunOut])
async def list_runs(
    project_id: str,
    pipeline_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(PipelineRun).where(PipelineRun.pipeline_id == pipeline_id).order_by(PipelineRun.created_at.desc()))
    return result.scalars().all()


@router.post("/{project_id}/preview")
async def preview_transformation(
    project_id: str,
    payload: Dict[str, Any],
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Preview transformation result without saving."""
    proj = await db.execute(select(Project).where(Project.id == project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")

    dataset_id = payload.get("dataset_id")
    steps = payload.get("steps", [])

    ds = await db.execute(select(Dataset).where(Dataset.id == dataset_id, Dataset.project_id == project_id))
    ds = ds.scalars().first()
    if not ds:
        raise HTTPException(404, "Dataset not found")

    engine = _sync_engine()
    df = pd.read_sql_table(ds.table_name, engine)
    engine.dispose()
    original_rows = len(df)

    df, log = _apply_steps(df, steps)

    import numpy as np
    return {
        "original_rows": original_rows,
        "result_rows": len(df),
        "rows_affected": original_rows - len(df),
        "columns": list(df.columns),
        "preview": df.head(10).replace({float("nan"): None}).to_dict(orient="records"),
        "log": log,
    }


def _apply_steps(df: pd.DataFrame, steps: list):
    log = []
    for step in steps:
        op = step.get("type", step.get("operation", ""))
        before = len(df)
        try:
            if op == "drop_nulls":
                cols = step.get("columns", [])
                df = df.dropna(subset=cols) if cols else df.dropna()
            elif op == "fill_nulls":
                for col, val in step.get("fill_values", {}).items():
                    if col in df.columns:
                        df[col] = df[col].fillna(val)
            elif op == "deduplicate":
                subset = step.get("subset", None)
                df = df.drop_duplicates(subset=subset)
            elif op == "rename_columns":
                df = df.rename(columns=step.get("mapping", {}))
            elif op == "drop_columns":
                df = df.drop(columns=[c for c in step.get("columns", []) if c in df.columns], errors="ignore")
            elif op == "filter":
                col, op_sym, val = step.get("column"), step.get("operator", "=="), step.get("value")
                if col and col in df.columns:
                    if op_sym == "==": df = df[df[col] == val]
                    elif op_sym == "!=": df = df[df[col] != val]
                    elif op_sym == ">": df = df[df[col] > float(val)]
                    elif op_sym == "<": df = df[df[col] < float(val)]
                    elif op_sym == ">=": df = df[df[col] >= float(val)]
                    elif op_sym == "<=": df = df[df[col] <= float(val)]
                    elif op_sym == "contains": df = df[df[col].astype(str).str.contains(str(val), na=False)]
            elif op == "cast_type":
                col, dtype = step.get("column"), step.get("dtype")
                if col and col in df.columns:
                    if dtype == "datetime": df[col] = pd.to_datetime(df[col], errors="coerce")
                    else: df[col] = df[col].astype(dtype, errors="ignore")
            elif op == "add_column":
                col_name = step.get("name")
                expr = step.get("expression", "")
                if col_name and expr:
                    df[col_name] = df.eval(expr)
            elif op == "normalize_text":
                col = step.get("column")
                if col and col in df.columns:
                    df[col] = df[col].astype(str).str.lower().str.strip()
            elif op == "sort":
                by = step.get("by", [])
                asc = step.get("ascending", True)
                if by: df = df.sort_values(by=by, ascending=asc)
            log.append({"step": op, "status": "ok", "rows_before": before, "rows_after": len(df)})
        except Exception as e:
            log.append({"step": op, "status": "error", "error": str(e)})
    return df, log


async def _execute_pipeline_run(run_id: str, source_table: str, steps: list, project_id: str, dataset_name: str):
    async with AsyncSessionLocal() as db:
        try:
            run = await db.get(PipelineRun, run_id)
            run.status = "running"
            await db.commit()

            engine = _sync_engine()
            df = pd.read_sql_table(source_table, engine)
            engine.dispose()

            rows_in = len(df)
            df, log = _apply_steps(df, steps)
            rows_out = len(df)

            import re as _re
            target = f"clean_{_re.sub('[^a-z0-9_]', '_', dataset_name.lower())}"[:60]
            engine = _sync_engine()
            df.to_sql(target, engine, if_exists="replace", index=False)
            engine.dispose()

            # Create cleaned dataset
            new_ds = Dataset(
                project_id=project_id,
                name=f"{dataset_name} [Cleaned]",
                table_name=target,
                storage_layer="silver",
                row_count=rows_out,
                column_count=len(df.columns),
                schema_json={c: str(df[c].dtype) for c in df.columns},
            )
            db.add(new_ds)
            await db.flush()

            run.status = "completed"
            run.rows_in = rows_in
            run.rows_out = rows_out
            run.target_dataset_id = new_ds.id
            run.log_output = str(log)
            run.completed_at = datetime.now(timezone.utc)
            await db.commit()

        except Exception as e:
            logger.error(f"Pipeline run {run_id} failed: {e}", exc_info=True)
            try:
                run = await db.get(PipelineRun, run_id)
                run.status = "failed"
                run.error_message = str(e)
                run.completed_at = datetime.now(timezone.utc)
                await db.commit()
            except Exception:
                pass

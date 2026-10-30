"""
Dataset Explorer API — server-side pagination, filtering, profiling, and EDA.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, create_engine, text
from sqlalchemy.orm import Session
import pandas as pd
import numpy as np
import json

from app.database.session import get_db
from app.models import User, Project, Dataset, ProfilingRun
from app.schemas.schemas import DatasetOut, DatasetUpdate
from app.auth.dependencies import get_current_user
from app.core.config import settings
from app.services.profiling_service import compute_profile, compute_capabilities
from app.core.logging_config import logger

router = APIRouter(prefix="/datasets", tags=["Datasets"])


def _get_sync_engine():
    url = settings.DATABASE_URL.replace("sqlite+aiosqlite", "sqlite").replace("+aiosqlite", "")
    return create_engine(url, connect_args={"check_same_thread": False})


def _read_dataset_table(table_name: str, limit: int = 50, offset: int = 0,
                         sort_col: Optional[str] = None, sort_dir: str = "asc",
                         filter_col: Optional[str] = None, filter_val: Optional[str] = None) -> dict:
    engine = _get_sync_engine()
    with engine.connect() as conn:
        # Total count
        total = conn.execute(text(f'SELECT COUNT(*) FROM "{table_name}"')).scalar() or 0
        # Build query
        order = ""
        if sort_col:
            dir_ = "ASC" if sort_dir.lower() == "asc" else "DESC"
            order = f'ORDER BY "{sort_col}" {dir_}'
        where = ""
        params = {}
        if filter_col and filter_val:
            where = f'WHERE CAST("{filter_col}" AS TEXT) LIKE :val'
            params["val"] = f"%{filter_val}%"
        q = f'SELECT * FROM "{table_name}" {where} {order} LIMIT :lim OFFSET :off'
        params.update({"lim": limit, "off": offset})
        rows = conn.execute(text(q), params).mappings().all()
        records = [dict(r) for r in rows]
    engine.dispose()
    return {"rows": records, "total": total}


async def _check_project_dataset(dataset_id: str, user: User, db: AsyncSession):
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    ds = result.scalars().first()
    if not ds:
        raise HTTPException(404, "Dataset not found")
    proj = await db.execute(select(Project).where(Project.id == ds.project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")
    return ds


@router.get("/project/{project_id}", response_model=List[DatasetOut])
async def list_datasets(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    proj = await db.execute(select(Project).where(Project.id == project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")
    result = await db.execute(select(Dataset).where(Dataset.project_id == project_id).order_by(Dataset.updated_at.desc()))
    return result.scalars().all()


@router.get("/{dataset_id}", response_model=DatasetOut)
async def get_dataset(
    dataset_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _check_project_dataset(dataset_id, user, db)


@router.put("/{dataset_id}", response_model=DatasetOut)
async def update_dataset(
    dataset_id: str,
    payload: DatasetUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ds = await _check_project_dataset(dataset_id, user, db)
    for f, v in payload.model_dump(exclude_none=True).items():
        setattr(ds, f, v)
    return ds


@router.delete("/{dataset_id}", status_code=204)
async def delete_dataset(
    dataset_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ds = await _check_project_dataset(dataset_id, user, db)
    # Drop the actual data table
    try:
        engine = _get_sync_engine()
        with engine.connect() as conn:
            conn.execute(text(f'DROP TABLE IF EXISTS "{ds.table_name}"'))
            conn.commit()
        engine.dispose()
    except Exception as e:
        logger.warning(f"Could not drop table {ds.table_name}: {e}")
    await db.delete(ds)


@router.get("/{dataset_id}/rows")
async def get_rows(
    dataset_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    sort_col: Optional[str] = None,
    sort_dir: str = "asc",
    filter_col: Optional[str] = None,
    filter_val: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ds = await _check_project_dataset(dataset_id, user, db)
    offset = (page - 1) * page_size
    try:
        result = _read_dataset_table(ds.table_name, page_size, offset, sort_col, sort_dir, filter_col, filter_val)
    except Exception as e:
        raise HTTPException(500, f"Failed to read dataset: {str(e)}")
    total_pages = (result["total"] + page_size - 1) // page_size
    return {
        "rows": result["rows"],
        "total": result["total"],
        "total_count": result["total"],
        "columns": list(result["rows"][0].keys()) if result["rows"] else [],
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


@router.get("/{dataset_id}/profile")
@router.post("/{dataset_id}/profile")
async def get_profile(
    dataset_id: str,
    refresh: bool = False,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ds = await _check_project_dataset(dataset_id, user, db)

    # Return cached profile if available
    if not refresh:
        result = await db.execute(
            select(ProfilingRun).where(ProfilingRun.dataset_id == dataset_id).order_by(ProfilingRun.created_at.desc())
        )
        cached = result.scalars().first()
        if cached:
            s_data = cached.summary_metrics_json or {}
            cols_data = cached.column_stats_json or []
            if isinstance(cols_data, dict):
                cols_data = list(cols_data.values())
            return {
                "summary": s_data,
                "row_count": s_data.get("row_count", ds.row_count),
                "column_count": s_data.get("column_count", ds.column_count),
                "columns": cols_data,
                "quality_score": cached.quality_score,
                "warnings": cached.warnings_json,
                "capabilities": cached.capabilities_json,
            }

    # Compute fresh profile
    try:
        engine = _get_sync_engine()
        df = pd.read_sql_table(ds.table_name, engine)
        engine.dispose()
    except Exception as e:
        raise HTTPException(500, f"Could not read dataset table: {str(e)}")

    profile = compute_profile(df)
    capabilities = compute_capabilities(df)
    quality_score = ds.quality_score or 0.0

    # Save
    pr = ProfilingRun(
        dataset_id=dataset_id,
        summary_metrics_json=profile.get("summary", {}),
        column_stats_json=profile.get("columns", {}),
        quality_score=quality_score,
        warnings_json=profile.get("warnings", []),
        capabilities_json=capabilities,
    )
    db.add(pr)
    await db.commit()

    s_data = profile.get("summary", {})
    cols_data = profile.get("columns", [])
    if isinstance(cols_data, dict):
        cols_data = list(cols_data.values())

    return {
        "summary": s_data,
        "row_count": s_data.get("row_count", ds.row_count),
        "column_count": s_data.get("column_count", ds.column_count),
        "columns": cols_data,
        "quality_score": quality_score,
        "warnings": profile.get("warnings", []),
        "capabilities": capabilities,
    }


@router.get("/{dataset_id}/export")
async def export_dataset(
    dataset_id: str,
    format: str = "csv",
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from fastapi.responses import StreamingResponse
    import io

    ds = await _check_project_dataset(dataset_id, user, db)
    engine = _get_sync_engine()
    df = pd.read_sql_table(ds.table_name, engine)
    engine.dispose()

    if format == "csv":
        buffer = io.StringIO()
        df.to_csv(buffer, index=False)
        buffer.seek(0)
        return StreamingResponse(
            iter([buffer.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{ds.name}.csv"'},
        )
    raise HTTPException(400, "Only CSV export is supported")


@router.get("/{dataset_id}/capabilities")
async def get_capabilities(
    dataset_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Detect analytical capabilities and roles for dataset."""
    ds = await _check_project_dataset(dataset_id, user, db)
    engine = _get_sync_engine()
    df = pd.read_sql_table(ds.table_name, engine)
    engine.dispose()
    capabilities = compute_capabilities(df)
    return capabilities

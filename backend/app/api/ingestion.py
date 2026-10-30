"""
File Upload & Data Ingestion API — Phase 4.
Handles CSV, XLSX, XLS, JSON, Parquet uploads with full validation,
schema inference, persistent storage, and background import execution.
"""
import os
import hashlib
import uuid
import json
import asyncio
from datetime import datetime, timezone
from typing import Optional

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

import pandas as pd
import numpy as np

from app.database.session import get_db, AsyncSessionLocal
from app.models import User, Project, UploadedFile, Dataset, DatasetVersion, BackgroundJob, AuditLog
from app.schemas.schemas import DatasetOut, UploadedFileOut, JobOut
from app.auth.dependencies import get_current_user
from app.core.config import settings
from app.services.profiling_service import compute_profile, compute_capabilities
from app.core.logging_config import logger

router = APIRouter(prefix="/ingestion", tags=["Ingestion"])

ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls", ".json", ".parquet"}
MAX_BYTES = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024


def _safe_table_name(name: str, project_id: str) -> str:
    """Generate a safe SQL table name from dataset name + project prefix."""
    import re
    safe = re.sub(r"[^a-zA-Z0-9_]", "_", name.lower())
    prefix = project_id.replace("-", "")[:8]
    return f"ds_{prefix}_{safe}"[:60]


def _read_file(path: str, ext: str, nrows: Optional[int] = None) -> pd.DataFrame:
    """Read a supported file into a pandas DataFrame."""
    if ext == ".csv":
        return pd.read_csv(path, nrows=nrows, low_memory=False)
    elif ext in (".xlsx", ".xls"):
        return pd.read_excel(path, nrows=nrows)
    elif ext == ".json":
        df = pd.read_json(path)
        if nrows:
            df = df.head(nrows)
        return df
    elif ext == ".parquet":
        df = pd.read_parquet(path)
        if nrows:
            df = df.head(nrows)
        return df
    raise ValueError(f"Unsupported extension: {ext}")


@router.post("/upload", response_model=dict)
@router.post("/upload/{project_id}", response_model=dict)
async def upload_file(
    project_id: Optional[str] = None,
    file: UploadFile = File(...),
    project_id_form: Optional[str] = Form(None, alias="project_id"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Step 1: Upload file → store → return preview + inferred schema."""
    actual_project_id = project_id or project_id_form
    if not actual_project_id:
        raise HTTPException(400, "project_id is required")
    project_id = actual_project_id

    # Ownership check
    project = await db.execute(select(Project).where(Project.id == project_id))
    project = project.scalars().first()
    if not project or project.owner_id != user.id:
        raise HTTPException(403, "Access denied")

    # Extension check
    _, ext = os.path.splitext(file.filename or "")
    ext = ext.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")

    # Read content and size check
    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(413, f"File too large. Maximum: {settings.MAX_UPLOAD_SIZE_MB} MB")

    # Hash
    sha256 = hashlib.sha256(content).hexdigest()

    # Persistent storage
    os.makedirs(settings.upload_path, exist_ok=True)
    stored_name = f"{uuid.uuid4()}{ext}"
    stored_path = os.path.join(settings.upload_path, stored_name)
    async with aiofiles.open(stored_path, "wb") as f:
        await f.write(content)

    # Parse preview
    try:
        df = _read_file(stored_path, ext, nrows=100)
    except Exception as e:
        os.remove(stored_path)
        raise HTTPException(422, f"Could not parse file: {str(e)}")

    # Full row count (efficient)
    try:
        df_full = _read_file(stored_path, ext)
        full_rows = len(df_full)
        del df_full
    except Exception:
        full_rows = len(df)

    # Schema inference
    schema = {}
    for col in df.columns:
        dtype = str(df[col].dtype)
        schema[col] = dtype

    null_counts = df.isnull().sum().to_dict()
    null_counts = {k: int(v) for k, v in null_counts.items()}

    # Persist file record
    uploaded = UploadedFile(
        project_id=project_id,
        original_filename=file.filename or stored_name,
        stored_path=stored_path,
        file_size_bytes=len(content),
        mime_type=file.content_type or "application/octet-stream",
        file_hash_sha256=sha256,
        status="uploaded",
        row_count_estimate=full_rows,
        column_count=len(df.columns),
    )
    db.add(uploaded)
    await db.flush()

    db.add(AuditLog(
        project_id=project_id, user_id=user.id,
        action="file.upload", resource_type="uploaded_file",
        resource_id=uploaded.id,
        details_json={"filename": file.filename, "size_bytes": len(content)},
    ))

    # Build preview rows (convert NaN to None for JSON)
    preview_df = df.head(20).replace({np.nan: None})
    preview_rows = preview_df.to_dict(orient="records")

    return {
        "file_id": uploaded.id,
        "original_filename": uploaded.original_filename,
        "file_size_bytes": uploaded.file_size_bytes,
        "file_hash_sha256": sha256,
        "row_count": full_rows,
        "column_count": len(df.columns),
        "columns": list(df.columns),
        "schema": schema,
        "null_counts": null_counts,
        "preview_rows": preview_rows,
        "duplicate_count": int(df.duplicated().sum()),
    }


@router.post("/import/{project_id}", response_model=JobOut)
async def import_dataset(
    project_id: str,
    file_id: str = Form(...),
    dataset_name: str = Form(...),
    storage_layer: str = Form("bronze"),
    import_strategy: str = Form("replace"),  # replace | append
    background_tasks: BackgroundTasks = BackgroundTasks(),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Step 2: Commit import → write dataset to persistent DB table in background."""
    # Validate
    proj = await db.execute(select(Project).where(Project.id == project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")

    file_rec = await db.execute(select(UploadedFile).where(UploadedFile.id == file_id, UploadedFile.project_id == project_id))
    file_rec = file_rec.scalars().first()
    if not file_rec:
        raise HTTPException(404, "Uploaded file not found")

    table_name = _safe_table_name(dataset_name, project_id)

    # Create job record
    job = BackgroundJob(
        project_id=project_id,
        job_type="import",
        status="pending",
        description=f"Importing '{dataset_name}' from {file_rec.original_filename}",
        metadata_json={"file_id": file_id, "table_name": table_name, "strategy": import_strategy},
    )
    db.add(job)
    await db.flush()
    job_id = job.id

    # Create dataset record now so UI can reference it
    existing_ds = await db.execute(select(Dataset).where(Dataset.project_id == project_id, Dataset.table_name == table_name))
    existing_ds = existing_ds.scalars().first()

    if existing_ds and import_strategy == "replace":
        dataset_id = existing_ds.id
    elif existing_ds and import_strategy == "append":
        dataset_id = existing_ds.id
    else:
        dataset = Dataset(
            project_id=project_id,
            source_file_id=file_id,
            name=dataset_name,
            table_name=table_name,
            storage_layer=storage_layer,
        )
        db.add(dataset)
        await db.flush()
        dataset_id = dataset.id

    db.add(AuditLog(
        project_id=project_id, user_id=user.id,
        action="dataset.import_start", resource_type="dataset",
        resource_id=dataset_id,
        details_json={"strategy": import_strategy},
    ))

    # Launch background import
    background_tasks.add_task(
        _run_import_job, job_id, file_rec.stored_path, table_name,
        dataset_id, file_rec.id, import_strategy
    )

    return JobOut(
        id=job.id,
        project_id=project_id,
        job_type="import",
        status="pending",
        progress_pct=0,
        description=job.description,
        error_details="",
        started_at=None,
        completed_at=None,
        created_at=job.created_at,
    )


async def _run_import_job(
    job_id: str, stored_path: str, table_name: str,
    dataset_id: str, file_id: str, strategy: str
):
    """Background task: parse file and write to persistent dataset table."""
    from sqlalchemy import text as sa_text
    from app.database.session import engine

    async with AsyncSessionLocal() as db:
        try:
            # Update job status
            job = await db.get(BackgroundJob, job_id)
            job.status = "running"
            job.started_at = datetime.now(timezone.utc)
            job.progress_pct = 10
            await db.commit()

            # Parse file
            _, ext = os.path.splitext(stored_path)
            ext = ext.lower()
            df = _read_file(stored_path, ext)

            # Clean column names
            df.columns = [c.strip().replace(" ", "_").replace("-", "_").lower() for c in df.columns]

            job.progress_pct = 40
            await db.commit()

            # Write to database table using pandas (SQLite-compatible)
            from sqlalchemy import create_engine as sync_create_engine
            _sync_url = settings.DATABASE_URL.replace("sqlite+aiosqlite", "sqlite").replace("+aiosqlite", "")
            sync_engine = sync_create_engine(_sync_url, connect_args={"check_same_thread": False})

            if_exists = "replace" if strategy == "replace" else "append"
            df.to_sql(table_name, sync_engine, if_exists=if_exists, index=False, chunksize=5000)
            sync_engine.dispose()

            row_count = len(df)
            col_count = len(df.columns)
            schema_json = {c: str(df[c].dtype) for c in df.columns}

            # Compute profile
            profile = compute_profile(df)
            capabilities = compute_capabilities(df)
            quality_score = _compute_quality(df)

            job.progress_pct = 80
            await db.commit()

            # Update dataset record
            dataset = await db.get(Dataset, dataset_id)
            if dataset:
                dataset.row_count = row_count
                dataset.column_count = col_count
                dataset.schema_json = schema_json
                dataset.quality_score = quality_score
                dataset.current_version = (dataset.current_version or 0) + 1

                # Save version snapshot
                version = DatasetVersion(
                    dataset_id=dataset_id,
                    version_number=dataset.current_version,
                    storage_path=stored_path,
                    row_count=row_count,
                    column_count=col_count,
                    schema_json=schema_json,
                    operation_description=f"Initial import via {strategy} strategy",
                )
                db.add(version)

                # Save profiling run
                from app.models import ProfilingRun
                pr = ProfilingRun(
                    dataset_id=dataset_id,
                    summary_metrics_json=profile.get("summary", {}),
                    column_stats_json=profile.get("columns", {}),
                    quality_score=quality_score,
                    warnings_json=profile.get("warnings", []),
                    capabilities_json=capabilities,
                )
                db.add(pr)

            # Update uploaded file status
            file_rec = await db.get(UploadedFile, file_id)
            if file_rec:
                file_rec.status = "imported"
                file_rec.row_count_estimate = row_count
                file_rec.column_count = col_count

            # Complete job
            job.status = "completed"
            job.progress_pct = 100
            job.completed_at = datetime.now(timezone.utc)
            job.log_output = f"Imported {row_count} rows, {col_count} columns into table '{table_name}'"

            await db.commit()
            logger.info(f"Import job {job_id} completed: {row_count} rows into {table_name}")

        except Exception as e:
            logger.error(f"Import job {job_id} failed: {e}", exc_info=True)
            try:
                job = await db.get(BackgroundJob, job_id)
                job.status = "failed"
                job.error_details = str(e)
                job.completed_at = datetime.now(timezone.utc)
                await db.commit()
            except Exception:
                pass


def _compute_quality(df: pd.DataFrame) -> float:
    if df.empty:
        return 0.0
    total_cells = df.shape[0] * df.shape[1]
    null_cells = df.isnull().sum().sum()
    completeness = 1 - (null_cells / total_cells) if total_cells > 0 else 0
    dup_rate = df.duplicated().sum() / len(df) if len(df) > 0 else 0
    uniqueness = 1 - dup_rate
    return round((completeness * 0.7 + uniqueness * 0.3) * 100, 1)


@router.get("/files/{project_id}", response_model=list)
async def list_uploaded_files(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    proj = await db.execute(select(Project).where(Project.id == project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")
    result = await db.execute(
        select(UploadedFile).where(UploadedFile.project_id == project_id).order_by(UploadedFile.created_at.desc())
    )
    files = result.scalars().all()
    return [
        {
            "id": f.id,
            "original_filename": f.original_filename,
            "file_size_bytes": f.file_size_bytes,
            "mime_type": f.mime_type,
            "status": f.status,
            "row_count_estimate": f.row_count_estimate,
            "column_count": f.column_count,
            "created_at": f.created_at.isoformat(),
        }
        for f in files
    ]


@router.get("/preview/{file_id}")
async def preview_file(
    file_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch schema and sample rows for an uploaded file."""
    file_rec = await db.get(UploadedFile, file_id)
    if not file_rec:
        raise HTTPException(404, "Uploaded file not found")
    _, ext = os.path.splitext(file_rec.stored_path)
    try:
        df = _read_file(file_rec.stored_path, ext.lower(), nrows=100)
        columns_info = [{"name": str(col), "inferred_type": str(df[col].dtype)} for col in df.columns]
        preview_df = df.head(10).replace({np.nan: None})
        return {
            "file_id": file_rec.id,
            "row_count_estimate": file_rec.row_count_estimate,
            "columns": columns_info,
            "sample_rows": preview_df.to_dict(orient="records"),
        }
    except Exception as e:
        raise HTTPException(500, f"Error generating preview: {str(e)}")


@router.post("/import/{file_id}")
async def import_file_by_id(
    file_id: str,
    payload: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Direct import endpoint for JSON payloads from frontend."""
    file_rec = await db.get(UploadedFile, file_id)
    if not file_rec:
        raise HTTPException(404, "Uploaded file not found")

    dataset_name = payload.get("dataset_name", file_rec.original_filename.split(".")[0])
    dest_table = payload.get("destination_table") or _safe_table_name(dataset_name, file_rec.project_id)
    strategy = payload.get("strategy", "replace")

    # Read and sanitize
    _, ext = os.path.splitext(file_rec.stored_path)
    df = _read_file(file_rec.stored_path, ext.lower())
    df.columns = [c.strip().replace(" ", "_").replace("-", "_").lower() for c in df.columns]

    from sqlalchemy import create_engine as sync_create_engine
    _sync_url = settings.DATABASE_URL.replace("sqlite+aiosqlite", "sqlite").replace("+aiosqlite", "")
    sync_engine = sync_create_engine(_sync_url, connect_args={"check_same_thread": False})
    if_exists = "replace" if strategy == "replace" else "append"
    df.to_sql(dest_table, sync_engine, if_exists=if_exists, index=False, chunksize=5000)
    sync_engine.dispose()

    row_count = len(df)
    col_count = len(df.columns)
    schema_json = {col: str(df[col].dtype) for col in df.columns}
    quality_score = _compute_quality(df)

    # Check if dataset exists or create
    existing_ds = await db.execute(select(Dataset).where(Dataset.project_id == file_rec.project_id, Dataset.table_name == dest_table))
    existing_ds = existing_ds.scalars().first()

    if existing_ds:
        dataset = existing_ds
        dataset.row_count = row_count
        dataset.column_count = col_count
        dataset.schema_json = schema_json
        dataset.quality_score = quality_score
    else:
        dataset = Dataset(
            project_id=file_rec.project_id,
            source_file_id=file_id,
            name=dataset_name,
            table_name=dest_table,
            storage_layer="raw",
            row_count=row_count,
            column_count=col_count,
            schema_json=schema_json,
            quality_score=quality_score,
            current_version=1,
        )
        db.add(dataset)

    await db.commit()
    return {
        "dataset_id": dataset.id,
        "table_name": dest_table,
        "row_count": row_count,
        "job_id": str(uuid.uuid4()),
    }


@router.post("/sample")
async def load_sample_dataset(
    payload: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Load built-in e-commerce sample dataset directly into user's project."""
    project_id = payload.get("project_id")
    if not project_id:
        raise HTTPException(400, "project_id is required")

    proj = await db.get(Project, project_id)
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")

    # Locate sample file
    workspace_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    sample_path = os.path.join(workspace_root, "data", "sample", "ecommerce_sample.csv")
    if not os.path.exists(sample_path):
        raise HTTPException(404, f"Sample data not found at {sample_path}")

    df = pd.read_csv(sample_path)
    df.columns = [c.strip().replace(" ", "_").replace("-", "_").lower() for c in df.columns]

    table_name = _safe_table_name("ecommerce_sample", project_id)

    from sqlalchemy import create_engine as sync_create_engine
    _sync_url = settings.DATABASE_URL.replace("sqlite+aiosqlite", "sqlite").replace("+aiosqlite", "")
    sync_engine = sync_create_engine(_sync_url, connect_args={"check_same_thread": False})
    df.to_sql(table_name, sync_engine, if_exists="replace", index=False, chunksize=5000)
    sync_engine.dispose()

    row_count = len(df)
    col_count = len(df.columns)
    schema_json = {col: str(df[col].dtype) for col in df.columns}
    quality_score = _compute_quality(df)

    # Upsert dataset
    existing_ds = await db.execute(select(Dataset).where(Dataset.project_id == project_id, Dataset.table_name == table_name))
    existing_ds = existing_ds.scalars().first()

    if existing_ds:
        dataset = existing_ds
        dataset.row_count = row_count
        dataset.column_count = col_count
        dataset.schema_json = schema_json
        dataset.quality_score = quality_score
    else:
        dataset = Dataset(
            project_id=project_id,
            name="[SAMPLE] E-Commerce Intelligence",
            description="Synthetic multi-domain e-commerce transaction dataset with 1,200+ rows.",
            table_name=table_name,
            storage_layer="raw",
            row_count=row_count,
            column_count=col_count,
            schema_json=schema_json,
            quality_score=quality_score,
            current_version=1,
        )
        db.add(dataset)

    await db.commit()
    return {
        "dataset_id": dataset.id,
        "name": dataset.name,
        "table_name": table_name,
        "row_count": row_count,
        "column_count": col_count,
    }


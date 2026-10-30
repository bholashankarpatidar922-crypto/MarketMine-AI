"""
Reports, Jobs, Health, SQL Lab, and RAG API endpoints.
"""
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, create_engine, text
import pandas as pd
import numpy as np
import io
import json
import re

from app.database.session import get_db
from app.models import (User, Project, Report, BackgroundJob, Dataset,
                         SavedQuery, RAGDocument, AuditLog)
from app.schemas.schemas import ReportOut, JobOut, SavedQueryCreate, SavedQueryOut
from app.auth.dependencies import get_current_user
from app.core.config import settings

router = APIRouter(tags=["Reports & Utilities"])


def _sync_engine():
    url = settings.DATABASE_URL.replace("sqlite+aiosqlite", "sqlite").replace("+aiosqlite", "")
    return create_engine(url, connect_args={"check_same_thread": False})


# ------------------------------------------------------------------
# Health Check
# ------------------------------------------------------------------
@router.get("/health", tags=["Health"])
async def health_check(db: AsyncSession = Depends(get_db)):
    """Returns application, database, and AI provider health status."""
    db_ok = False
    try:
        await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass

    ai_configured = bool(settings.GEMINI_API_KEY)

    from datetime import datetime, timezone
    return {
        "status": "ok" if db_ok else "degraded",
        "database": "ok" if db_ok else "error",
        "ai_provider": "configured" if ai_configured else "not_configured",
        "ai_provider_name": settings.LLM_PROVIDER,
        "version": "1.0.0",
        "app_name": settings.APP_NAME,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ------------------------------------------------------------------
# Reports
# ------------------------------------------------------------------
@router.get("/reports/project/{project_id}", response_model=List[ReportOut])
@router.get("/reports/{project_id}", response_model=List[ReportOut])
async def list_reports(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    proj = await db.execute(select(Project).where(Project.id == project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")
    result = await db.execute(select(Report).where(Report.project_id == project_id).order_by(Report.created_at.desc()))
    return result.scalars().all()


@router.get("/reports/{project_id}/{report_id}", response_model=ReportOut)
async def get_report_by_proj(
    project_id: str,
    report_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    proj = await db.execute(select(Project).where(Project.id == project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")
    rpt = await db.get(Report, report_id)
    if not rpt or rpt.project_id != project_id:
        raise HTTPException(404, "Report not found")
    return rpt


@router.get("/reports/item/{report_id}", response_model=ReportOut)
async def get_report_by_id(
    report_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rpt = await db.get(Report, report_id)
    if not rpt:
        raise HTTPException(404, "Report not found")
    proj = await db.get(Project, rpt.project_id)
    if not proj or (proj.owner_id != user.id and not user.is_admin):
        raise HTTPException(403, "Access denied")
    return rpt


@router.get("/reports/{project_id}/{report_id}/export")
async def export_report(
    project_id: str,
    report_id: str,
    format: str = "md",
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    proj = await db.execute(select(Project).where(Project.id == project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")
    rpt = await db.get(Report, report_id)
    if not rpt or rpt.project_id != project_id:
        raise HTTPException(404, "Report not found")
    content = rpt.content or ""
    filename = f"{rpt.title.replace(' ', '_')}.{format}"
    return StreamingResponse(
        iter([content]),
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/reports/{report_id}", status_code=204)
@router.delete("/reports/{project_id}/{report_id}", status_code=204)
async def delete_report(
    report_id: str,
    project_id: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rpt = await db.get(Report, report_id)
    if rpt:
        proj = await db.get(Project, rpt.project_id)
        if proj and proj.owner_id != user.id and not user.is_admin:
            raise HTTPException(403, "Access denied")
        await db.delete(rpt)


# ------------------------------------------------------------------
# Background Jobs
# ------------------------------------------------------------------
@router.get("/jobs/{project_id}", response_model=List[JobOut])
async def list_jobs(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    proj = await db.execute(select(Project).where(Project.id == project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")
    result = await db.execute(
        select(BackgroundJob).where(BackgroundJob.project_id == project_id).order_by(BackgroundJob.created_at.desc()).limit(50)
    )
    return result.scalars().all()


@router.get("/jobs/{project_id}/{job_id}", response_model=JobOut)
async def get_job(
    project_id: str,
    job_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    proj = await db.execute(select(Project).where(Project.id == project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")
    job = await db.get(BackgroundJob, job_id)
    if not job or job.project_id != project_id:
        raise HTTPException(404, "Job not found")
    return job


# ------------------------------------------------------------------
# Saved SQL Queries
# ------------------------------------------------------------------
@router.post("/sql/queries", response_model=SavedQueryOut, status_code=201)
@router.post("/queries/{project_id}", response_model=SavedQueryOut, status_code=201)
async def save_query(
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
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")

    q = SavedQuery(
        project_id=target_project_id,
        name=payload.get("name", "Untitled Query"),
        description=payload.get("description", ""),
        sql_text=payload.get("sql_text", ""),
        natural_language=payload.get("natural_language", ""),
    )
    db.add(q)
    return q


@router.get("/sql/queries/project/{project_id}", response_model=List[SavedQueryOut])
@router.get("/queries/{project_id}", response_model=List[SavedQueryOut])
async def list_queries(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    proj = await db.execute(select(Project).where(Project.id == project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")
    result = await db.execute(select(SavedQuery).where(SavedQuery.project_id == project_id).order_by(SavedQuery.created_at.desc()))
    return result.scalars().all()


# ------------------------------------------------------------------
# SQL Lab — Direct Query Execution (read-only with validation)
# ------------------------------------------------------------------
@router.post("/sql/execute")
@router.post("/sql-lab/{project_id}")
async def execute_sql(
    payload: Dict[str, Any],
    project_id: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Execute a read-only SQL query against project datasets."""
    target_project_id = project_id or payload.get("project_id")
    if not target_project_id:
        raise HTTPException(400, "project_id is required")

    proj = await db.execute(select(Project).where(Project.id == target_project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")

    sql = payload.get("sql", "").strip()
    if not sql:
        raise HTTPException(400, "SQL query is required")

    # Get all project table names for validation
    ds_result = await db.execute(select(Dataset).where(Dataset.project_id == target_project_id))
    allowed_tables = {ds.table_name for ds in ds_result.scalars().all()}

    # Security validation
    sql_upper = sql.upper()
    forbidden = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE", "EXEC", "PRAGMA", "ATTACH"]
    for kw in forbidden:
        if re.search(r'\b' + kw + r'\b', sql_upper):
            raise HTTPException(400, f"Forbidden SQL keyword: {kw}")

    if not sql_upper.lstrip().startswith(("SELECT", "WITH")):
        raise HTTPException(400, "Only SELECT queries are allowed")

    # Validate table references
    table_refs = re.findall(r'\bFROM\s+["\'`]?([A-Za-z0-9_]+)["\'`]?', sql, re.IGNORECASE)
    table_refs += re.findall(r'\bJOIN\s+["\'`]?([A-Za-z0-9_]+)["\'`]?', sql, re.IGNORECASE)
    for ref in table_refs:
        if ref.lower() not in {t.lower() for t in allowed_tables}:
            raise HTTPException(400, f"Unauthorized table: '{ref}'")

    # Add LIMIT if not present, safely handling semicolons
    clean_sql = sql.rstrip("; \t\n")
    if "LIMIT" not in clean_sql.upper():
        clean_sql = clean_sql + " LIMIT 500"

    engine = _sync_engine()
    try:
        result_df = pd.read_sql_query(clean_sql, engine)
    except Exception as e:
        raise HTTPException(500, f"Query failed: {str(e)}")
    finally:
        engine.dispose()

    # Audit log
    db.add(AuditLog(
        project_id=target_project_id, user_id=user.id,
        action="sql.execute", resource_type="sql_lab",
        details_json={"sql": sql[:500]},
    ))

    rows = result_df.head(500).replace({np.nan: None}).to_dict(orient="records")
    return {
        "columns": list(result_df.columns),
        "row_count": len(result_df),
        "rows": rows,
        "data": rows,
    }


# ------------------------------------------------------------------
# RAG Knowledge Assistant
# ------------------------------------------------------------------
@router.post("/rag/{project_id}/ingest")
async def ingest_document(
    project_id: str,
    payload: Dict[str, Any],
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Ingest a text document into the project's RAG knowledge base."""
    proj = await db.execute(select(Project).where(Project.id == project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")

    title = payload.get("title", "Untitled Document")
    content = payload.get("content", "")
    doc_type = payload.get("doc_type", "documentation")

    if not content:
        raise HTTPException(400, "Document content is required")

    # Chunk the document
    chunks = _chunk_text(content, chunk_size=500, overlap=50)

    doc = RAGDocument(
        project_id=project_id,
        title=title,
        content=content,
        doc_type=doc_type,
        chunks_json=[{"index": i, "text": c} for i, c in enumerate(chunks)],
    )
    db.add(doc)
    await db.commit()

    return {"status": "ingested", "document_id": doc.id, "chunk_count": len(chunks), "title": title}


@router.post("/rag/{project_id}/query")
async def rag_query(
    project_id: str,
    payload: Dict[str, Any],
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query the RAG knowledge base for context-aware answers."""
    from app.api.ai import llm_client

    proj = await db.execute(select(Project).where(Project.id == project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")

    question = payload.get("question", "")
    if not question:
        raise HTTPException(400, "Question is required")

    # Retrieve relevant documents (simple keyword matching for embedded vector store)
    result = await db.execute(select(RAGDocument).where(RAGDocument.project_id == project_id))
    docs = result.scalars().all()

    relevant = []
    q_words = set(question.lower().split())
    for doc in docs:
        for chunk_data in (doc.chunks_json or []):
            chunk_text = chunk_data.get("text", "")
            chunk_words = set(chunk_text.lower().split())
            overlap = len(q_words & chunk_words)
            if overlap > 0:
                relevant.append({"text": chunk_text, "source": doc.title, "score": overlap})

    relevant.sort(key=lambda x: x["score"], reverse=True)
    top_context = relevant[:5]

    context = "\n\n".join([f"[Source: {r['source']}]\n{r['text']}" for r in top_context])
    citations = list({r["source"] for r in top_context})

    answer = llm_client.call(
        "You are a knowledge assistant. Answer using ONLY the provided context. Cite your sources.",
        question,
        context if context else "No relevant documents found in knowledge base."
    )

    return {
        "answer": answer,
        "citations": citations,
        "context_chunks": len(top_context),
        "total_documents": len(docs),
    }


@router.get("/rag/{project_id}/documents")
async def list_rag_documents(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    proj = await db.execute(select(Project).where(Project.id == project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")
    result = await db.execute(select(RAGDocument).where(RAGDocument.project_id == project_id))
    docs = result.scalars().all()
    return [
        {"id": d.id, "title": d.title, "doc_type": d.doc_type, "chunk_count": len(d.chunks_json or []), "created_at": d.created_at.isoformat()}
        for d in docs
    ]


# ------------------------------------------------------------------
# Audit Log
# ------------------------------------------------------------------
@router.get("/audit/{project_id}", tags=["Audit"])
async def get_audit_log(
    project_id: str,
    page: int = Query(1, ge=1),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    proj = await db.execute(select(Project).where(Project.id == project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")
    result = await db.execute(
        select(AuditLog).where(AuditLog.project_id == project_id)
        .order_by(AuditLog.created_at.desc())
        .offset((page - 1) * 50).limit(50)
    )
    logs = result.scalars().all()
    return [
        {"id": l.id, "action": l.action, "resource_type": l.resource_type, "resource_id": l.resource_id, "created_at": l.created_at.isoformat()}
        for l in logs
    ]


def _chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list:
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i:i + chunk_size])
        chunks.append(chunk)
        i += chunk_size - overlap
    return chunks

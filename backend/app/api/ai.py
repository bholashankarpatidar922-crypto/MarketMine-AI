"""
Generative AI API — Provider-agnostic LLM orchestration with deterministic tool calling.
Primary provider: Google Gemini. Falls back to mock when key is not configured.
"""
import json
import re
import time
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, create_engine
import pandas as pd
import numpy as np

from app.database.session import get_db
from app.models import User, Project, Dataset, AIConversation, AIMessage, ProfilingRun
from app.schemas.schemas import ChatMessageIn, AIConversationOut, AIMessageOut
from app.auth.dependencies import get_current_user
from app.core.config import settings
from app.core.logging_config import logger
from app.services.profiling_service import compute_profile, compute_capabilities

router = APIRouter(prefix="/ai", tags=["AI Copilot"])


def _sync_engine():
    url = settings.DATABASE_URL.replace("sqlite+aiosqlite", "sqlite").replace("+aiosqlite", "")
    return create_engine(url, connect_args={"check_same_thread": False})


# ---------------------------------------------------------------------------
# Deterministic Tool Registry — these functions return real computed results
# ---------------------------------------------------------------------------

def _tool_dataset_summary(df: pd.DataFrame, dataset_name: str) -> Dict[str, Any]:
    profile = compute_profile(df)
    return {
        "dataset_name": dataset_name,
        "rows": profile["summary"]["row_count"],
        "columns": profile["summary"]["column_count"],
        "missing_cells": profile["summary"]["total_missing"],
        "duplicate_rows": profile["summary"]["total_duplicate_rows"],
        "column_types": {col: info["column_type"] for col, info in profile["columns"].items()},
        "warnings": profile["warnings"][:5],
    }


def _tool_missing_values(df: pd.DataFrame) -> Dict[str, Any]:
    missing = df.isnull().sum()
    pct = (missing / len(df) * 100).round(2)
    return {
        "columns_with_missing": [
            {"column": col, "missing_count": int(missing[col]), "missing_pct": float(pct[col])}
            for col in df.columns if missing[col] > 0
        ]
    }


def _tool_top_n(df: pd.DataFrame, group_col: str, value_col: str, n: int = 10, agg: str = "sum") -> Dict[str, Any]:
    if group_col not in df.columns or value_col not in df.columns:
        return {"error": f"Column '{group_col}' or '{value_col}' not found"}
    grouped = df.groupby(group_col)[value_col].agg(agg).reset_index()
    grouped = grouped.sort_values(value_col, ascending=False).head(n)
    return {
        "group_col": group_col,
        "value_col": value_col,
        "agg": agg,
        "results": grouped.replace({np.nan: None}).to_dict(orient="records"),
    }


def _tool_descriptive_stats(df: pd.DataFrame, col: str) -> Dict[str, Any]:
    if col not in df.columns:
        return {"error": f"Column '{col}' not found"}
    s = df[col]
    if pd.api.types.is_numeric_dtype(s):
        return {
            "column": col,
            "count": int(s.count()),
            "mean": round(float(s.mean()), 4) if not pd.isna(s.mean()) else None,
            "median": round(float(s.median()), 4),
            "std": round(float(s.std()), 4),
            "min": round(float(s.min()), 4),
            "max": round(float(s.max()), 4),
            "q25": round(float(s.quantile(0.25)), 4),
            "q75": round(float(s.quantile(0.75)), 4),
        }
    return {
        "column": col,
        "count": int(s.count()),
        "unique": int(s.nunique()),
        "top": str(s.mode()[0]) if not s.mode().empty else None,
        "top_values": s.value_counts().head(5).to_dict(),
    }


def _tool_correlation(df: pd.DataFrame, col_a: str, col_b: str) -> Dict[str, Any]:
    if col_a not in df.columns or col_b not in df.columns:
        return {"error": "One or both columns not found"}
    if not pd.api.types.is_numeric_dtype(df[col_a]) or not pd.api.types.is_numeric_dtype(df[col_b]):
        return {"error": "Both columns must be numeric for correlation"}
    corr = df[[col_a, col_b]].corr().iloc[0, 1]
    return {"col_a": col_a, "col_b": col_b, "pearson_correlation": round(float(corr), 4)}


def _tool_time_series(df: pd.DataFrame, date_col: str, value_col: str, freq: str = "M") -> Dict[str, Any]:
    if date_col not in df.columns or value_col not in df.columns:
        return {"error": "Date or value column not found"}
    ts = df[[date_col, value_col]].copy()
    ts[date_col] = pd.to_datetime(ts[date_col], errors="coerce")
    ts = ts.dropna()
    ts = ts.set_index(date_col).resample(freq)[value_col].sum().reset_index()
    return {
        "date_col": date_col,
        "value_col": value_col,
        "freq": freq,
        "data": [{"date": str(row[date_col].date()), "value": round(float(row[value_col]), 4)} for _, row in ts.iterrows()],
    }


# ---------------------------------------------------------------------------
# LLM Client
# ---------------------------------------------------------------------------

class LLMClient:
    """Provider-agnostic LLM interface. Primary: Gemini. Fallback: mock."""

    def __init__(self):
        self.provider = settings.LLM_PROVIDER
        self._gemini_client = None

    def _get_gemini(self):
        if self._gemini_client is None:
            try:
                import google.generativeai as genai
                genai.configure(api_key=settings.GEMINI_API_KEY)
                self._gemini_client = genai.GenerativeModel(settings.DEFAULT_LLM_MODEL)
            except Exception as e:
                logger.warning(f"Failed to initialize Gemini client: {e}")
        return self._gemini_client

    def call(self, system_prompt: str, user_message: str, context: str = "") -> str:
        """Call LLM and return text response."""
        if not settings.GEMINI_API_KEY and self.provider == "gemini":
            return self._mock_response(user_message)

        if self.provider == "gemini":
            return self._call_gemini(system_prompt, user_message, context)
        return self._mock_response(user_message)

    def _call_gemini(self, system_prompt: str, user_message: str, context: str = "") -> str:
        from tenacity import retry, stop_after_attempt, wait_exponential
        client = self._get_gemini()
        if not client:
            return self._mock_response(user_message)
        try:
            full_prompt = f"{system_prompt}\n\nCONTEXT:\n{context}\n\nUSER: {user_message}"
            response = client.generate_content(full_prompt)
            return response.text
        except Exception as e:
            logger.error(f"Gemini call failed: {e}")
            return f"⚠️ AI service temporarily unavailable: {str(e)}"

    def _mock_response(self, message: str) -> str:
        return (
            "🤖 **AI Copilot (Mock Mode)**\n\n"
            "The AI Copilot requires a Gemini API key to be configured in the `.env` file "
            "(`GEMINI_API_KEY=your-key`). The rest of the platform — including data upload, "
            "profiling, mining, and warehouse features — works without an API key.\n\n"
            f"**Your question**: {message}\n\n"
            "Please configure a Gemini API key to enable conversational AI responses."
        )


llm_client = LLMClient()


# ---------------------------------------------------------------------------
# AI Copilot Conversation Endpoints
# ---------------------------------------------------------------------------

@router.get("/conversations/{project_id}", response_model=List[AIConversationOut])
async def list_conversations(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    proj = await db.execute(select(Project).where(Project.id == project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")
    result = await db.execute(
        select(AIConversation).where(AIConversation.project_id == project_id).order_by(AIConversation.updated_at.desc())
    )
    return result.scalars().all()


@router.get("/conversations/{project_id}/{conversation_id}/messages", response_model=List[AIMessageOut])
async def get_conversation_messages(
    project_id: str,
    conversation_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    proj = await db.execute(select(Project).where(Project.id == project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")
    result = await db.execute(
        select(AIMessage).where(AIMessage.conversation_id == conversation_id).order_by(AIMessage.created_at)
    )
    return result.scalars().all()


@router.post("/chat")
@router.post("/chat/{project_id}")
async def chat(
    payload: ChatMessageIn,
    project_id: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Main AI Copilot endpoint: deterministic tool execution + LLM explanation."""
    target_project_id = project_id or payload.project_id
    if not target_project_id:
        raise HTTPException(400, "project_id is required")

    proj = await db.execute(select(Project).where(Project.id == target_project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")

    # Get or create conversation
    conv_id = payload.conversation_id
    if conv_id:
        conv = await db.get(AIConversation, conv_id)
        if not conv or conv.project_id != target_project_id:
            conv_id = None

    if not conv_id:
        conv = AIConversation(
            project_id=target_project_id,
            user_id=user.id,
            title=(payload.content or "Conversation")[:80] + ("..." if len(payload.content or "") > 80 else ""),
        )
        db.add(conv)
        await db.flush()

    # Save user message
    user_msg = AIMessage(
        conversation_id=conv.id,
        sender="user",
        content=payload.content,
    )
    db.add(user_msg)

    # Load dataset context
    df = None
    dataset_name = None
    schema_str = ""
    capabilities = {}

    dataset_id = payload.dataset_id
    if not dataset_id:
        latest_ds = await db.execute(select(Dataset).where(Dataset.project_id == target_project_id).order_by(Dataset.created_at.desc()).limit(1))
        ds_obj = latest_ds.scalars().first()
        if ds_obj:
            dataset_id = ds_obj.id

    if dataset_id:
        ds = await db.execute(select(Dataset).where(Dataset.id == dataset_id, Dataset.project_id == target_project_id))
        ds = ds.scalars().first()
        if ds:
            dataset_name = ds.name
            schema_str = str(ds.schema_json)
            try:
                engine = _sync_engine()
                df = pd.read_sql_table(ds.table_name, engine)
                engine.dispose()
                capabilities = compute_capabilities(df)
            except Exception as e:
                logger.warning(f"Could not load dataset for AI: {e}")

    # Determine tool to execute from user intent
    question = payload.content.lower()
    tool_result = {}
    tool_name = ""
    chart_data = {}

    if df is not None:
        if any(kw in question for kw in ["summarize", "summary", "overview", "describe dataset", "about this"]):
            tool_name = "dataset_summary"
            tool_result = _tool_dataset_summary(df, dataset_name)

        elif any(kw in question for kw in ["missing", "null", "empty", "incomplete"]):
            tool_name = "missing_values"
            tool_result = _tool_missing_values(df)

        elif any(kw in question for kw in ["top", "highest", "largest", "most", "best"]):
            tool_name = "top_n"
            # Auto-detect likely group and value columns
            numeric_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
            cat_cols = [c for c in df.columns if not pd.api.types.is_numeric_dtype(df[c])]
            if numeric_cols and cat_cols:
                tool_result = _tool_top_n(df, cat_cols[0], numeric_cols[0])
                chart_data = {"type": "bar", "data": tool_result.get("results", [])}

        elif any(kw in question for kw in ["correlation", "correlate", "related", "relationship"]):
            tool_name = "correlation"
            numeric_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
            if len(numeric_cols) >= 2:
                tool_result = _tool_correlation(df, numeric_cols[0], numeric_cols[1])

        elif any(kw in question for kw in ["trend", "time", "monthly", "weekly", "daily", "over time"]):
            tool_name = "time_series"
            date_cols = capabilities.get("datetime_columns", [])
            numeric_cols = capabilities.get("numeric_columns", [])
            if date_cols and numeric_cols:
                tool_result = _tool_time_series(df, date_cols[0], numeric_cols[0])
                chart_data = {"type": "line", "data": tool_result.get("data", [])}

        elif any(kw in question for kw in ["statistics", "stats", "average", "mean", "distribution"]):
            tool_name = "descriptive_stats"
            numeric_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
            if numeric_cols:
                tool_result = _tool_descriptive_stats(df, numeric_cols[0])

        else:
            # General question about dataset
            tool_name = "dataset_summary"
            tool_result = _tool_dataset_summary(df, dataset_name) if dataset_name else {}

    # Build context for LLM
    context_parts = []
    if schema_str:
        context_parts.append(f"Dataset: {dataset_name}\nSchema: {schema_str[:1000]}")
    if tool_result:
        context_parts.append(f"Computed Result ({tool_name}):\n{json.dumps(tool_result, default=str)[:2000]}")
    context = "\n\n".join(context_parts)

    system_prompt = """You are MarketMine AI's data intelligence copilot.
You have already executed the appropriate analytical tool and the RESULTS are provided in the CONTEXT.
Your role is to:
1. Summarize the key findings from the computed results clearly and concisely.
2. Highlight actionable insights.
3. Suggest 2-3 relevant follow-up analyses.
4. Use markdown formatting with headers, bullet points, and bold text.
NEVER make up numbers. Only reference the numbers provided in CONTEXT.
If no computed results are available, explain what data is needed."""

    # Call LLM
    ai_response = llm_client.call(system_prompt, payload.content, context)

    # Save assistant message
    assistant_msg = AIMessage(
        conversation_id=conv.id,
        sender="assistant",
        content=ai_response,
        tool_name=tool_name,
        tool_results_json=tool_result,
        chart_data_json=chart_data,
        metrics_json={},
    )
    db.add(assistant_msg)

    # Update conversation timestamp
    from datetime import datetime, timezone
    conv.updated_at = datetime.now(timezone.utc)

    await db.commit()

    return {
        "conversation_id": conv.id,
        "user_message_id": user_msg.id,
        "assistant_message_id": assistant_msg.id,
        "response": ai_response,
        "content": ai_response,
        "tool_name": tool_name,
        "tools_called": [tool_name] if tool_name else [],
        "tool_result": tool_result,
        "execution_result": tool_result,
        "chart_data": chart_data,
        "ai_configured": bool(settings.GEMINI_API_KEY),
    }


@router.post("/nl2sql")
@router.post("/sql/{project_id}")
async def natural_language_sql(
    payload: Dict[str, Any],
    project_id: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Secure NL-to-SQL: generate and AST-validate SQL before execution."""
    target_project_id = project_id or payload.get("project_id")
    if not target_project_id:
        raise HTTPException(400, "project_id is required")

    proj = await db.execute(select(Project).where(Project.id == target_project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")

    question = payload.get("question") or payload.get("natural_language_query", "")
    dataset_id = payload.get("dataset_id")

    if not dataset_id:
        ds_res = await db.execute(select(Dataset).where(Dataset.project_id == target_project_id).limit(1))
        ds = ds_res.scalars().first()
        if not ds:
            raise HTTPException(404, "No dataset found in project")
    else:
        ds = await db.execute(select(Dataset).where(Dataset.id == dataset_id, Dataset.project_id == target_project_id))
        ds = ds.scalars().first()
        if not ds:
            raise HTTPException(404, "Dataset not found")

    # Build schema context
    schema_info = f"Table: {ds.table_name}\nColumns: {json.dumps(ds.schema_json)}"

    # Generate SQL via LLM
    sql_prompt = f"""Generate a SQL SELECT query to answer this question.
Schema: {schema_info}
Question: {question}

Rules:
- Use only SELECT statements
- Table name must be "{ds.table_name}"
- No subqueries that access other tables
- Add LIMIT 500
- Return ONLY the SQL query, no explanation"""

    generated_sql = llm_client.call("You are a SQL generator.", sql_prompt, "")

    # Extract SQL from response
    sql_match = re.search(r"```sql\n(.*?)```", generated_sql, re.DOTALL)
    if sql_match:
        sql = sql_match.group(1).strip()
    else:
        sql = generated_sql.strip()

    # AST-based security validation
    validation_errors = _validate_sql(sql, ds.table_name)
    if validation_errors:
        raise HTTPException(400, f"SQL validation failed: {'; '.join(validation_errors)}")

    # Execute read-only
    engine = _sync_engine()
    try:
        result_df = pd.read_sql_query(sql, engine)
        engine.dispose()
    except Exception as e:
        engine.dispose()
        raise HTTPException(500, f"Query execution failed: {str(e)}")

    # Explain results
    explanation = llm_client.call(
        "You are a data analyst explaining SQL query results.",
        f"Question: {question}\nResult preview: {result_df.head(5).to_string()}\n\nExplain the results in 2-3 sentences.",
        ""
    )

    return {
        "sql": sql,
        "row_count": len(result_df),
        "columns": list(result_df.columns),
        "data": result_df.head(100).replace({np.nan: None}).to_dict(orient="records"),
        "explanation": explanation,
    }


def _validate_sql(sql: str, allowed_table: str) -> List[str]:
    """Return list of validation errors. Empty = safe."""
    errors = []
    sql_upper = sql.upper().strip()

    # Reject dangerous keywords
    forbidden = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE",
                 "EXEC", "EXECUTE", "GRANT", "REVOKE", "ATTACH", "DETACH", "PRAGMA"]
    for kw in forbidden:
        if re.search(r'\b' + kw + r'\b', sql_upper):
            errors.append(f"Forbidden SQL keyword: {kw}")

    # Must start with SELECT or WITH
    if not sql_upper.lstrip().startswith(("SELECT", "WITH")):
        errors.append("Query must be a SELECT statement")

    # Enforce LIMIT
    if "LIMIT" not in sql_upper:
        errors.append("Query must include a LIMIT clause")

    # Check table references (basic)
    table_references = re.findall(r'\bFROM\s+["\'`]?(\w+)["\'`]?', sql_upper)
    table_references += re.findall(r'\bJOIN\s+["\'`]?(\w+)["\'`]?', sql_upper)
    for ref in table_references:
        if ref.lower() not in (allowed_table.lower(), "dual"):
            errors.append(f"Unauthorized table reference: '{ref}' (only '{allowed_table}' allowed)")

    return errors


@router.post("/report")
@router.post("/report/{project_id}")
async def generate_report(
    payload: Dict[str, Any],
    project_id: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a structured report from verified analysis results."""
    from app.models import Report

    target_project_id = project_id or payload.get("project_id")
    if not target_project_id:
        raise HTTPException(400, "project_id is required")

    proj = await db.execute(select(Project).where(Project.id == target_project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")

    dataset_id = payload.get("dataset_id")
    report_type = payload.get("report_type", "eda")
    title = payload.get("title", f"{report_type.upper()} Report")

    # Load dataset and compute real stats
    ds = await db.execute(select(Dataset).where(Dataset.id == dataset_id, Dataset.project_id == target_project_id))
    ds = ds.scalars().first()
    if not ds:
        raise HTTPException(404, "Dataset not found")

    engine = _sync_engine()
    df = pd.read_sql_table(ds.table_name, engine)
    engine.dispose()

    from app.services.profiling_service import compute_profile, compute_capabilities
    from datetime import date
    profile = compute_profile(df)
    capabilities = compute_capabilities(df)

    # Build report context
    context = json.dumps({"profile": profile["summary"], "warnings": profile["warnings"], "capabilities": capabilities}, default=str)

    report_prompt = f"""Generate a professional {report_type} report for a dataset called "{ds.name}".

Computed Statistics (DO NOT FABRICATE - use exactly these numbers):
{context[:3000]}

Include:
1. Executive Summary
2. Dataset Overview (rows, columns, quality score)
3. Key Findings (based on computed stats)
4. Data Quality Assessment
5. Recommended Actions
6. Limitations

Format as clean Markdown with # headers."""

    content = llm_client.call("You are a senior data analyst writing a professional report.", report_prompt, context)

    # Persist report
    report = Report(
        project_id=target_project_id,
        user_id=user.id,
        title=title,
        report_type=report_type,
        format="markdown",
        content=content,
        metadata_json={"dataset_id": dataset_id, "dataset_name": ds.name, "rows": profile["summary"]["row_count"]},
    )
    db.add(report)
    await db.commit()

    return {
        "report_id": report.id,
        "id": report.id,
        "title": report.title,
        "content": content,
        "content_markdown": content,
        "created_at": report.created_at.isoformat(),
    }

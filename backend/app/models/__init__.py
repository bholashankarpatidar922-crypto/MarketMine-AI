"""
MarketMine AI — All SQLAlchemy ORM Models
Centralised so that Base.metadata is fully populated on import.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey,
    Integer, String, Text, JSON, Enum as SAEnum, BigInteger, Index
)
from sqlalchemy.orm import relationship

from app.database.session import Base


def _now():
    return datetime.now(timezone.utc)


def _uuid():
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------
class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False, default="")
    role = Column(String(50), nullable=False, default="analyst")  # admin | analyst | viewer
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=_now, nullable=False)
    updated_at = Column(DateTime, default=_now, onupdate=_now, nullable=False)

    projects = relationship("Project", back_populates="owner", cascade="all, delete-orphan")
    ai_conversations = relationship("AIConversation", back_populates="user")
    reports = relationship("Report", back_populates="user")
    audit_logs = relationship("AuditLog", back_populates="user")


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------
class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=_uuid)
    owner_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    domain = Column(String(100), default="general")  # e-commerce, healthcare, finance, etc.
    created_at = Column(DateTime, default=_now, nullable=False)
    updated_at = Column(DateTime, default=_now, onupdate=_now, nullable=False)

    owner = relationship("User", back_populates="projects")
    uploaded_files = relationship("UploadedFile", back_populates="project", cascade="all, delete-orphan")
    datasets = relationship("Dataset", back_populates="project", cascade="all, delete-orphan")
    pipelines = relationship("TransformationPipeline", back_populates="project", cascade="all, delete-orphan")
    warehouse_models = relationship("WarehouseModel", back_populates="project", cascade="all, delete-orphan")
    experiments = relationship("Experiment", back_populates="project", cascade="all, delete-orphan")
    ai_conversations = relationship("AIConversation", back_populates="project", cascade="all, delete-orphan")
    reports = relationship("Report", back_populates="project", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="project")
    background_jobs = relationship("BackgroundJob", back_populates="project", cascade="all, delete-orphan")
    rag_documents = relationship("RAGDocument", back_populates="project", cascade="all, delete-orphan")
    saved_queries = relationship("SavedQuery", back_populates="project", cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# File Uploads & Datasets
# ---------------------------------------------------------------------------
class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    id = Column(String(36), primary_key=True, default=_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    original_filename = Column(String(500), nullable=False)
    stored_path = Column(String(1000), nullable=False)
    file_size_bytes = Column(BigInteger, default=0)
    mime_type = Column(String(200), default="")
    file_hash_sha256 = Column(String(64), default="")
    status = Column(String(50), default="uploaded")  # uploaded | imported | failed
    row_count_estimate = Column(Integer, default=0)
    column_count = Column(Integer, default=0)
    error_summary = Column(Text, default="")
    created_at = Column(DateTime, default=_now, nullable=False)

    project = relationship("Project", back_populates="uploaded_files")
    datasets = relationship("Dataset", back_populates="source_file")


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(String(36), primary_key=True, default=_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    source_file_id = Column(String(36), ForeignKey("uploaded_files.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    table_name = Column(String(255), nullable=False)  # actual DB table name holding data
    storage_layer = Column(String(50), default="bronze")  # bronze | silver | gold
    source_type = Column(String(50), default="file")  # file | warehouse | derived
    row_count = Column(Integer, default=0)
    column_count = Column(Integer, default=0)
    schema_json = Column(JSON, default=dict)  # {col: dtype, ...}
    quality_score = Column(Float, default=0.0)
    current_version = Column(Integer, default=1)
    created_at = Column(DateTime, default=_now, nullable=False)
    updated_at = Column(DateTime, default=_now, onupdate=_now, nullable=False)

    project = relationship("Project", back_populates="datasets")
    source_file = relationship("UploadedFile", back_populates="datasets")
    versions = relationship("DatasetVersion", back_populates="dataset", cascade="all, delete-orphan")
    profiling_runs = relationship("ProfilingRun", back_populates="dataset", cascade="all, delete-orphan")
    experiments = relationship("Experiment", back_populates="dataset")

    __table_args__ = (
        Index("ix_datasets_project_name", "project_id", "name"),
    )


class DatasetVersion(Base):
    __tablename__ = "dataset_versions"

    id = Column(String(36), primary_key=True, default=_uuid)
    dataset_id = Column(String(36), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    parent_version_id = Column(String(36), nullable=True)
    storage_path = Column(String(1000), nullable=False)
    row_count = Column(Integer, default=0)
    column_count = Column(Integer, default=0)
    schema_json = Column(JSON, default=dict)
    operation_description = Column(Text, default="")
    created_at = Column(DateTime, default=_now, nullable=False)

    dataset = relationship("Dataset", back_populates="versions")


# ---------------------------------------------------------------------------
# Data Profiling
# ---------------------------------------------------------------------------
class ProfilingRun(Base):
    __tablename__ = "profiling_runs"

    id = Column(String(36), primary_key=True, default=_uuid)
    dataset_id = Column(String(36), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True)
    summary_metrics_json = Column(JSON, default=dict)
    column_stats_json = Column(JSON, default=dict)
    quality_score = Column(Float, default=0.0)
    warnings_json = Column(JSON, default=list)
    capabilities_json = Column(JSON, default=dict)  # detected analytical capabilities
    created_at = Column(DateTime, default=_now, nullable=False)

    dataset = relationship("Dataset", back_populates="profiling_runs")


# ---------------------------------------------------------------------------
# Transformation Pipelines
# ---------------------------------------------------------------------------
class TransformationPipeline(Base):
    __tablename__ = "transformation_pipelines"

    id = Column(String(36), primary_key=True, default=_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    definition_json = Column(JSON, default=list)  # ordered list of step configs
    created_at = Column(DateTime, default=_now, nullable=False)
    updated_at = Column(DateTime, default=_now, onupdate=_now, nullable=False)

    project = relationship("Project", back_populates="pipelines")
    runs = relationship("PipelineRun", back_populates="pipeline", cascade="all, delete-orphan")


class PipelineRun(Base):
    __tablename__ = "pipeline_runs"

    id = Column(String(36), primary_key=True, default=_uuid)
    pipeline_id = Column(String(36), ForeignKey("transformation_pipelines.id", ondelete="CASCADE"), nullable=False, index=True)
    source_dataset_id = Column(String(36), ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True)
    target_dataset_id = Column(String(36), ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(50), default="pending")  # pending | running | completed | failed
    rows_in = Column(Integer, default=0)
    rows_out = Column(Integer, default=0)
    execution_time_ms = Column(Integer, default=0)
    error_message = Column(Text, default="")
    log_output = Column(Text, default="")
    created_at = Column(DateTime, default=_now, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    pipeline = relationship("TransformationPipeline", back_populates="runs")


# ---------------------------------------------------------------------------
# Data Warehouse
# ---------------------------------------------------------------------------
class WarehouseModel(Base):
    __tablename__ = "warehouse_models"

    id = Column(String(36), primary_key=True, default=_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    model_type = Column(String(50), default="star")  # star | snowflake | flat_mart
    grain = Column(Text, default="")
    description = Column(Text, default="")
    fact_table_name = Column(String(255), default="")
    dimension_tables_json = Column(JSON, default=list)
    created_at = Column(DateTime, default=_now, nullable=False)
    updated_at = Column(DateTime, default=_now, onupdate=_now, nullable=False)

    project = relationship("Project", back_populates="warehouse_models")
    tables = relationship("WarehouseTable", back_populates="model", cascade="all, delete-orphan")


class WarehouseTable(Base):
    __tablename__ = "warehouse_tables"

    id = Column(String(36), primary_key=True, default=_uuid)
    model_id = Column(String(36), ForeignKey("warehouse_models.id", ondelete="CASCADE"), nullable=False, index=True)
    table_name = Column(String(255), nullable=False)
    table_type = Column(String(50), default="fact")  # fact | dimension | staging | mart
    scd_type = Column(Integer, default=0)  # 0 | 1 | 2
    columns_metadata_json = Column(JSON, default=list)
    description = Column(Text, default="")
    row_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=_now, nullable=False)

    model = relationship("WarehouseModel", back_populates="tables")


class WarehouseLineage(Base):
    __tablename__ = "warehouse_lineage"

    id = Column(String(36), primary_key=True, default=_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    source_table = Column(String(255), nullable=False)
    target_table = Column(String(255), nullable=False)
    operation_type = Column(String(100), default="etl")
    transformation_meta_json = Column(JSON, default=dict)
    executed_at = Column(DateTime, default=_now, nullable=False)


# ---------------------------------------------------------------------------
# Data Mining Experiments & ML Models
# ---------------------------------------------------------------------------
class Experiment(Base):
    __tablename__ = "experiments"

    id = Column(String(36), primary_key=True, default=_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    dataset_id = Column(String(36), ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False)
    task_type = Column(String(100), nullable=False)  # association_rules | clustering | classification | regression | anomaly | forecasting
    algorithm = Column(String(100), default="")
    parameters_json = Column(JSON, default=dict)
    features_json = Column(JSON, default=list)
    target_column = Column(String(255), default="")
    status = Column(String(50), default="pending")
    created_at = Column(DateTime, default=_now, nullable=False)
    updated_at = Column(DateTime, default=_now, onupdate=_now, nullable=False)

    project = relationship("Project", back_populates="experiments")
    dataset = relationship("Dataset", back_populates="experiments")
    runs = relationship("ModelRun", back_populates="experiment", cascade="all, delete-orphan")


class ModelRun(Base):
    __tablename__ = "model_runs"

    id = Column(String(36), primary_key=True, default=_uuid)
    experiment_id = Column(String(36), ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False, index=True)
    algorithm = Column(String(100), nullable=False)
    parameters_json = Column(JSON, default=dict)
    metrics_json = Column(JSON, default=dict)
    results_json = Column(JSON, default=dict)  # computed results (rules, clusters, predictions, etc.)
    artifact_path = Column(String(1000), default="")
    duration_ms = Column(Integer, default=0)
    status = Column(String(50), default="pending")
    error_message = Column(Text, default="")
    created_at = Column(DateTime, default=_now, nullable=False)

    experiment = relationship("Experiment", back_populates="runs")


# ---------------------------------------------------------------------------
# AI Conversations
# ---------------------------------------------------------------------------
class AIConversation(Base):
    __tablename__ = "ai_conversations"

    id = Column(String(36), primary_key=True, default=_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(500), default="New Conversation")
    context_meta_json = Column(JSON, default=dict)  # active dataset, etc.
    created_at = Column(DateTime, default=_now, nullable=False)
    updated_at = Column(DateTime, default=_now, onupdate=_now, nullable=False)

    project = relationship("Project", back_populates="ai_conversations")
    user = relationship("User", back_populates="ai_conversations")
    messages = relationship("AIMessage", back_populates="conversation", cascade="all, delete-orphan", order_by="AIMessage.created_at")


class AIMessage(Base):
    __tablename__ = "ai_messages"

    id = Column(String(36), primary_key=True, default=_uuid)
    conversation_id = Column(String(36), ForeignKey("ai_conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    sender = Column(String(50), nullable=False)  # user | assistant | tool
    content = Column(Text, nullable=False)
    tool_name = Column(String(100), default="")
    tool_calls_json = Column(JSON, default=list)
    tool_results_json = Column(JSON, default=dict)
    metrics_json = Column(JSON, default=dict)
    chart_data_json = Column(JSON, default=dict)
    created_at = Column(DateTime, default=_now, nullable=False)

    conversation = relationship("AIConversation", back_populates="messages")


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------
class Report(Base):
    __tablename__ = "reports"

    id = Column(String(36), primary_key=True, default=_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(500), nullable=False)
    report_type = Column(String(100), default="custom")
    format = Column(String(50), default="markdown")
    content = Column(Text, default="")
    metadata_json = Column(JSON, default=dict)
    created_at = Column(DateTime, default=_now, nullable=False)

    project = relationship("Project", back_populates="reports")
    user = relationship("User", back_populates="reports")


# ---------------------------------------------------------------------------
# Saved Queries
# ---------------------------------------------------------------------------
class SavedQuery(Base):
    __tablename__ = "saved_queries"

    id = Column(String(36), primary_key=True, default=_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    sql_text = Column(Text, nullable=False)
    natural_language = Column(Text, default="")
    result_preview_json = Column(JSON, default=dict)
    created_at = Column(DateTime, default=_now, nullable=False)

    project = relationship("Project", back_populates="saved_queries")


# ---------------------------------------------------------------------------
# Background Jobs
# ---------------------------------------------------------------------------
class BackgroundJob(Base):
    __tablename__ = "background_jobs"

    id = Column(String(36), primary_key=True, default=_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True)
    job_type = Column(String(100), nullable=False)  # import | etl | mining | ml | report
    status = Column(String(50), default="pending")  # pending | running | completed | failed | cancelled
    progress_pct = Column(Integer, default=0)
    description = Column(Text, default="")
    log_output = Column(Text, default="")
    error_details = Column(Text, default="")
    metadata_json = Column(JSON, default=dict)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_now, nullable=False)

    project = relationship("Project", back_populates="background_jobs")


# ---------------------------------------------------------------------------
# RAG Documents
# ---------------------------------------------------------------------------
class RAGDocument(Base):
    __tablename__ = "rag_documents"

    id = Column(String(36), primary_key=True, default=_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(500), nullable=False)
    content = Column(Text, nullable=False)
    doc_type = Column(String(100), default="documentation")
    chunks_json = Column(JSON, default=list)  # [{text, embedding_path, index}]
    created_at = Column(DateTime, default=_now, nullable=False)
    updated_at = Column(DateTime, default=_now, onupdate=_now, nullable=False)

    project = relationship("Project", back_populates="rag_documents")


# ---------------------------------------------------------------------------
# Audit Logs
# ---------------------------------------------------------------------------
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(200), nullable=False)
    resource_type = Column(String(100), default="")
    resource_id = Column(String(36), default="")
    ip_address = Column(String(50), default="")
    details_json = Column(JSON, default=dict)
    created_at = Column(DateTime, default=_now, nullable=False)

    project = relationship("Project", back_populates="audit_logs")
    user = relationship("User", back_populates="audit_logs")

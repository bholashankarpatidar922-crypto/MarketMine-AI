"""Pydantic schemas for Projects, Datasets, and related entities."""
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict, model_validator


# ---------- Projects ----------
class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str = ""
    domain: str = "general"


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    domain: Optional[str] = None


class ProjectOut(BaseModel):
    id: str
    name: str
    description: str
    domain: str
    owner_id: str
    created_at: datetime
    updated_at: datetime
    dataset_count: int = 0
    report_count: int = 0

    model_config = {"from_attributes": True}


# ---------- Datasets ----------
class DatasetOut(BaseModel):
    id: str
    project_id: str
    name: str
    description: str
    table_name: str
    storage_layer: str
    row_count: int
    column_count: int
    schema_json: Dict[str, Any]
    quality_score: float
    current_version: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, protected_namespaces=())


class DatasetUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None


# ---------- Pagination ----------
class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    page_size: int
    total_pages: int


# ---------- Uploaded Files ----------
class UploadedFileOut(BaseModel):
    id: str
    project_id: str
    original_filename: str
    file_size_bytes: int
    mime_type: str
    status: str
    row_count_estimate: int
    column_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------- Jobs ----------
class JobOut(BaseModel):
    id: str
    project_id: Optional[str]
    job_type: str
    status: str
    progress_pct: int
    description: str
    error_details: str
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------- Experiments ----------
class ExperimentCreate(BaseModel):
    name: str
    task_type: str
    algorithm: str
    parameters_json: Dict[str, Any] = {}
    features_json: List[str] = []
    target_column: str = ""
    dataset_id: str


class ExperimentOut(BaseModel):
    id: str
    project_id: str
    dataset_id: Optional[str]
    name: str
    task_type: str
    algorithm: str
    parameters_json: Dict[str, Any]
    features_json: List[str]
    target_column: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ModelRunOut(BaseModel):
    id: str
    experiment_id: str
    algorithm: str
    parameters_json: Dict[str, Any]
    metrics_json: Dict[str, Any]
    results_json: Dict[str, Any]
    duration_ms: int
    status: str
    error_message: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------- Reports ----------
class ReportCreate(BaseModel):
    title: str
    report_type: str = "custom"
    dataset_id: Optional[str] = None
    experiment_id: Optional[str] = None
    format: str = "markdown"


class ReportOut(BaseModel):
    id: str
    project_id: str
    title: str
    report_type: str
    format: str
    content: str
    content_markdown: Optional[str] = None
    metadata_json: Dict[str, Any] = {}
    created_at: datetime

    @model_validator(mode="after")
    def populate_content_markdown(self):
        if not self.content_markdown and self.content:
            self.content_markdown = self.content
        return self

    model_config = {"from_attributes": True}


# ---------- AI Chat ----------
class ChatMessageIn(BaseModel):
    content: Optional[str] = None
    message: Optional[str] = None
    project_id: Optional[str] = None
    dataset_id: Optional[str] = None
    conversation_id: Optional[str] = None

    @model_validator(mode="after")
    def resolve_content(self):
        if not self.content and self.message:
            self.content = self.message
        if not self.content:
            self.content = ""
        return self


class AIConversationOut(BaseModel):
    id: str
    project_id: str
    title: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AIMessageOut(BaseModel):
    id: str
    conversation_id: str
    sender: str
    content: str
    tool_name: str
    tool_results_json: Dict[str, Any]
    metrics_json: Dict[str, Any]
    chart_data_json: Dict[str, Any]
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------- Saved Queries ----------
class SavedQueryCreate(BaseModel):
    name: str
    description: str = ""
    sql_text: str
    natural_language: str = ""


class SavedQueryOut(BaseModel):
    id: str
    project_id: str
    name: str
    description: str
    sql_text: str
    natural_language: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------- Warehouse ----------
class WarehouseModelCreate(BaseModel):
    name: str
    model_type: str = "star"
    grain: str = ""
    description: str = ""
    fact_table_name: str = ""
    dimension_tables: List[str] = []

    model_config = ConfigDict(protected_namespaces=())


class WarehouseModelOut(BaseModel):
    id: str
    project_id: str
    name: str
    model_type: str
    grain: str
    description: str
    fact_table_name: str
    dimension_tables_json: List[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, protected_namespaces=())


# ---------- Pipeline ----------
class PipelineCreate(BaseModel):
    name: str
    description: str = ""
    definition_json: List[Dict[str, Any]]


class PipelineOut(BaseModel):
    id: str
    project_id: str
    name: str
    description: str
    definition_json: List[Dict[str, Any]]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PipelineRunOut(BaseModel):
    id: str
    pipeline_id: str
    source_dataset_id: Optional[str]
    target_dataset_id: Optional[str]
    status: str
    rows_in: int
    rows_out: int
    execution_time_ms: int
    error_message: str
    created_at: datetime
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}

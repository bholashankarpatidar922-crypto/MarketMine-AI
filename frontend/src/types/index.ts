export interface User {
  id: string;
  email: string;
  username: string;
  full_name?: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  domain: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  dataset_count?: number;
  report_count?: number;
}

export interface UploadedFile {
  id: string;
  project_id: string;
  original_filename: string;
  file_size_bytes: number;
  mime_type: string;
  status: string;
  row_count_estimate: number;
  column_count: number;
  created_at: string;
}

export interface Dataset {
  id: string;
  project_id: string;
  name: string;
  description: string;
  table_name: string;
  storage_layer: 'raw' | 'cleaned' | 'warehouse' | 'mart';
  row_count: number;
  column_count: number;
  schema_json: Record<string, string>;
  quality_score: number;
  current_version: number;
  created_at: string;
  updated_at: string;
}

export interface DatasetRowsResponse {
  rows: Record<string, any>[];
  total_count: number;
  columns: string[];
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ColumnProfile {
  name: string;
  type: string;
  null_count: number;
  null_percent: number;
  unique_count: number;
  min?: any;
  max?: any;
  mean?: number;
  median?: number;
  std?: number;
  top_values?: Record<string, number>;
  outlier_count?: number;
}

export interface ProfilingResult {
  dataset_id: string;
  row_count: number;
  column_count: number;
  quality_score: number;
  columns: ColumnProfile[];
  missing_cells: number;
  duplicate_rows: number;
  generated_at: string;
}

export interface CapabilitiesResult {
  can_association_rules: boolean;
  can_clustering: boolean;
  can_forecast: boolean;
  can_classification: boolean;
  can_regression: boolean;
  can_star_schema: boolean;
  candidate_ids: string[];
  candidate_dates: string[];
  candidate_measures: string[];
  candidate_dimensions: string[];
  notes: string[];
}

export interface TransformationStep {
  step_type: 'drop_duplicates' | 'fill_missing' | 'filter' | 'rename' | 'cast' | 'calculate' | 'drop_columns';
  parameters: Record<string, any>;
}

export interface Pipeline {
  id: string;
  project_id: string;
  name: string;
  source_dataset_id: string;
  target_dataset_name: string;
  steps: TransformationStep[];
  status: string;
  created_at: string;
}

export interface WarehouseModel {
  id: string;
  project_id: string;
  name: string;
  model_type: 'star' | 'snowflake';
  grain: string;
  description: string;
  fact_table_name: string;
  dimension_tables_json: string[];
  created_at: string;
}

export interface MiningExperiment {
  id: string;
  project_id: string;
  name: string;
  algorithm: string;
  task_type: string;
  target_column?: string;
  features_json: string[];
  parameters_json: Record<string, any>;
  metrics_json: Record<string, any>;
  created_at: string;
}

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tools_called_json?: any[];
  execution_result_json?: any;
  created_at: string;
}

export interface Report {
  id: string;
  project_id: string;
  title: string;
  report_type: string;
  content_markdown: string;
  parameters_json?: Record<string, any>;
  created_at: string;
}

export interface SavedQuery {
  id: string;
  project_id: string;
  name: string;
  description: string;
  sql_text: string;
  natural_language?: string;
  created_at: string;
}

export interface BackgroundJob {
  id: string;
  job_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress_percent: number;
  message: string;
  error?: string;
  started_at?: string;
  finished_at?: string;
}

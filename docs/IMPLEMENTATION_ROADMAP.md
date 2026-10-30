# MarketMine AI — Phased Implementation Roadmap

This roadmap governs the incremental implementation, verification, and delivery of MarketMine AI. Each phase maintains a fully runnable application with strict verification gates.

---

## Interactive Phase Control Protocol

To facilitate seamless collaboration, the following commands are supported:
- **`NEXT`**: Proceed to the next phase after review of the current phase deliverables.
- **`FIX`**: Focus specifically on resolving any issues or refinements in the current phase without expanding scope.
- **`STATUS`**: Display a comprehensive status report detailing completed modules, active tests, and pending items.
- **`TEST`**: Execute the test suite for all completed modules and display actual pass/fail results.
- **`RUN`**: Launch the backend API and frontend dev server and report health status.

---

## Phase Breakdown & Execution Matrix

### Phase 1 — Workspace Inspection & Architecture Planning *(Current Phase)*
- **Objective**: Inspect environment, establish system blueprint, database schemas, API specs, and project roadmap.
- **Deliverables**:
  - `docs/PROJECT_PLAN.md`
  - `docs/ARCHITECTURE.md`
  - `docs/IMPLEMENTATION_ROADMAP.md`
  - Repository directory structure initialization.
- **Gate / Verification**: Complete architecture and roadmap documentation approved by user.

---

### Phase 2 — System Foundation & Skeleton Setup
- **Objective**: Establish the core backend and frontend runtime environments with health checks and basic navigation.
- **Tasks**:
  - Set up FastAPI app structure (`backend/app/main.py`, config, core utilities).
  - Configure SQLAlchemy database connection (SQLite out-of-the-box + MySQL compatibility).
  - Initialize database tables and migrations setup.
  - Set up React + TypeScript + Vite frontend with Tailwind CSS and theme tokens.
  - Implement base layout (Sidebar, Header, Breadcrumbs, Status indicators).
  - Verify `/api/v1/health` and frontend communication.
- **Gate / Verification**: Frontend loads, communicates with backend `/api/v1/health`, returns 200 OK with database connection verified.

---

### Phase 3 — Authentication & Multi-Project Workspace Management
- **Objective**: Implement secure user registration, login, token management, and project isolation.
- **Tasks**:
  - Password hashing with `bcrypt`, JWT token issuance and verification middleware.
  - User endpoints: Register, Login, Current User (`/api/v1/auth/*`).
  - Project management endpoints: Create, List, Get, Update, Delete with ownership isolation (`/api/v1/projects/*`).
  - Frontend Auth views: Login, Register, Workspace/Project Selector, Project Settings.
- **Gate / Verification**: User can register, log in, create a project, and ownership is enforced on backend queries.

---

### Phase 4 — File Upload & Data Ingestion Center
- **Objective**: Persistent file upload, validation, parsing, schema detection, and dataset ingestion.
- **Tasks**:
  - File upload engine supporting CSV, XLSX, JSON, Parquet.
  - File integrity verification (SHA-256 hash, MIME check, size caps).
  - Data preview and automatic schema inference (column types, null counts, distinct counts).
  - Destination table configuration (new table, append, replace).
  - Persistent dataset storage in relational database/storage layer.
  - Dataset Explorer: server-side pagination, sorting, search, column metadata browser.
- **Gate / Verification**: User can upload real CSV/Excel files, preview detected schema, import into persistent storage, and explore rows.

---

### Phase 5 — Data Cleaning & Visual Transformation Pipeline Engine
- **Objective**: Visual data preparation interface with reversible transformations and reusable pipelines.
- **Tasks**:
  - Cleaning operations: Missing value imputation/dropping, duplicate removal, type casting, date parsing, column renaming/dropping, text normalization.
  - Transformation engine: Joins, Unions, GroupBy Aggregations, Derived formula columns.
  - Pipeline definition persistence (`transformation_pipelines`) and execution history (`pipeline_runs`).
  - Preview before execution showing rows affected and summary metrics.
- **Gate / Verification**: User can define a multi-step cleaning pipeline, preview changes, execute it, and produce a new clean dataset version.

---

### Phase 6 — Data Warehousing & OLAP Engine
- **Objective**: Genuine medallion data warehousing, dimensional modeling, SCD handling, and OLAP analytics.
- **Tasks**:
  - Medallion architecture realization (Bronze/Staging -> Silver/Cleaned -> Gold/Curated).
  - Star Schema Designer: Fact table definition with measures, Dimension tables with dimension keys.
  - Slowly Changing Dimensions: SCD Type 1 (in-place update) & SCD Type 2 (history tracking with surrogate keys, valid_from, valid_to, is_current).
  - Data Mart generator (Sales, Customer, Product marts).
  - OLAP Query Processor: Roll-up, Drill-down, Slice, Dice, Pivot cross-tabulations.
  - Visual Data Lineage graph generator.
- **Gate / Verification**: Fact and dimension tables created, SCD Type 2 preserves history, OLAP slicing and pivoting return computed aggregates.

---

### Phase 7 — Data Mining Lab & Statistical Profiling
- **Objective**: Implement real data mining algorithms with parameter tuning and interactive visualizations.
- **Tasks**:
  - Statistical Profiler: Histograms, distributions, quantiles, correlation matrix, heatmaps.
  - Association Rule Mining: Apriori algorithm via MLxtend, support/confidence/lift tuning, network graph data.
  - Clustering Engine: K-Means, DBSCAN, Hierarchical clustering, Elbow method, Silhouette score.
  - Anomaly Detection: Isolation Forest, IQR, Z-Score methods.
  - Experiment tracking: Save algorithm hyperparameters, execution metrics, and results.
- **Gate / Verification**: Apriori discovers real association rules; K-Means computes clusters and silhouette scores over real datasets.

---

### Phase 8 — Machine Learning & Time-Series Forecasting
- **Objective**: Supervised machine learning workflows and time-series forecasting.
- **Tasks**:
  - Classification models: Decision Tree, Random Forest, Logistic Regression with confusion matrix, ROC-AUC, Precision, Recall, F1.
  - Regression models: Linear Regression, Random Forest Regressor with R², MAE, RMSE.
  - Time-Series Forecasting: Chronological validation split, ARIMA and Exponential Smoothing, confidence intervals.
  - Model persistence and prediction generation over new input data.
- **Gate / Verification**: Model training succeeds, metrics computed on holdout test set, and forecasting generates future predictions with bounds.

---

### Phase 9 — Generative AI Core & Orchestration Engine
- **Objective**: Secure, provider-agnostic LLM orchestration layer with approved tool calling.
- **Tasks**:
  - Provider abstraction (OpenAI, Anthropic, Gemini, Local Ollama) configured via environment variables.
  - Safe fallback mechanisms when external API keys are not supplied.
  - Structured output parsers and schema validation.
  - Tool calling registry: Maps LLM requests to deterministic backend analytical functions.
  - Context window manager and token usage tracking.
- **Gate / Verification**: LLM client correctly parses user intent and dispatches deterministic tool calls without hallucinating computations.

---

### Phase 10 — AI Copilot — Chat With Your Data
- **Objective**: Conversational data intelligence interface.
- **Tasks**:
  - Interactive chat UI with conversation history persistence.
  - Intent detection: Dataset summarization, KPI queries, comparisons, anomaly queries.
  - Execution of backend analytical tools and synthesis of results.
  - Rich responses: Markdown explanations, KPI metrics, embedded tables, and suggested follow-ups.
- **Gate / Verification**: User asks natural language questions about uploaded datasets; Copilot returns accurate, backend-verified metrics.

---

### Phase 11 — AI Data Analyst & Root Cause Investigation
- **Objective**: Autonomous multi-step analysis workflows and evidence-based root cause investigation.
- **Tasks**:
  - AI Data Analyst: Automatic dataset inspection, workflow proposals (cleaning steps, suggested charts, candidate mining algorithms).
  - Root Cause Investigation Engine: Establish baseline vs target periods, compute variance, decompose by dimensions (product, region, channel), categorize findings into facts vs hypotheses.
  - Executive report generator: Generates structured analytical summaries.
- **Gate / Verification**: User triggers an investigation on a metric drop; system computes dimensional variance and outputs an evidence-backed diagnostic report.

---

### Phase 12 — RAG Knowledge Assistant & Secure NL-to-SQL
- **Objective**: Domain documentation retrieval and safe natural language to SQL translation.
- **Tasks**:
  - RAG Pipeline: Ingest data dictionaries, business documentation; chunk, vectorize, and retrieve with exact source citations.
  - Secure NL-to-SQL: Generate SQL from natural language with strict AST validation (disallowing DDL/DML, enforcing project table boundaries, read-only transactions, row limits).
  - Query result presentation and explanation.
- **Gate / Verification**: Dangerous SQL operations (`DROP`, `DELETE`, `UPDATE`) are rejected; valid analytical `SELECT` queries execute safely and return rows.

---

### Phase 13 — Interactive Dashboard & Advanced Analytical Workflows
- **Objective**: Unified, polished executive dashboard with real-time KPI cards, custom dashboard builder, and chart exports.
- **Tasks**:
  - Executive project overview with live dataset counters, warehouse metrics, recent jobs, and AI activity feeds.
  - Customizable dashboard widgets (KPI tiles, charts, query tables).
  - Export capabilities: Markdown, CSV, and printable/PDF reports.
- **Gate / Verification**: Dashboard renders dynamic metrics fetched from the backend with zero hardcoded mock values.

---

### Phase 14 — Automated Testing & Verification Suite
- **Objective**: Comprehensive unit, integration, and end-to-end testing across all modules.
- **Tasks**:
  - Backend tests with `pytest`: Auth, Ingestion, Warehouse, Mining, ML, SQL validation, AI tools.
  - Realistic edge cases: Malformed files, missing values, unauthorized access, SQL injection payloads.
  - Automated E2E verification script: Project creation -> Upload -> Warehouse ETL -> Mining -> AI Copilot query -> Report generation.
- **Gate / Verification**: All tests execute and pass; test results logged in `docs/IMPLEMENTATION_STATUS.md`.

---

### Phase 15 — Documentation, Deployment & Production Readiness
- **Objective**: Complete documentation, Docker configuration, and deployment guides.
- **Tasks**:
  - Comprehensive documentation in `docs/` (`API.md`, `DATABASE.md`, `DEPLOYMENT.md`, `SECURITY.md`).
  - Production Docker Compose and Dockerfile configurations with volume persistence.
  - User setup guide and sample datasets.
  - Final project verification and release packaging.
- **Gate / Verification**: Clean deployment startup via standard scripts; zero exposed secrets; data survives restart.

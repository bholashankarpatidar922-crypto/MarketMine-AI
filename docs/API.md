# MarketMine AI — API Documentation

Base URL: `/api/v1`

---

## 1. Authentication (`/api/v1/auth`)
- `POST /register`: Register a new user (`email`, `password`, `full_name`).
- `POST /login`: Authenticate and receive a JWT bearer token.
- `GET /me`: Get authenticated user profile.

## 2. Projects (`/api/v1/projects`)
- `GET /`: List all projects owned by the authenticated user.
- `POST /`: Create a new workspace project.
- `GET /{project_id}`: Retrieve project details.
- `PUT /{project_id}`: Update project metadata.
- `DELETE /{project_id}`: Delete project and associated resources.

## 3. Ingestion (`/api/v1/ingestion`)
- `POST /upload`: Upload CSV/XLSX/JSON file with type detection and row preview.
- `POST /confirm`: Confirm and persist imported dataset into SQLite/MySQL.
- `POST /sample`: Seed sample e-commerce transaction dataset (1,000+ rows).

## 4. Datasets & Explorer (`/api/v1/datasets`)
- `GET /project/{project_id}`: List datasets in project.
- `GET /{dataset_id}/rows`: Paginated row viewer with sorting and column filtering.
- `POST /{dataset_id}/profile`: Compute comprehensive statistics and quality scorecard.
- `GET /{dataset_id}/capabilities`: Auto-detect supported analytical modules.

## 5. Data Warehouse & OLAP (`/api/v1/warehouse`)
- `POST /models/{project_id}`: Create Star Schema / dimensional model.
- `GET /models/{project_id}`: List warehouse models.
- `POST /etl/{project_id}`: Launch async ETL pipeline (Bronze $\to$ Silver $\to$ Gold).
- `POST /olap/cube`: Execute multidimensional aggregation (dimensions, measures, filters).
- `GET /lineage/{project_id}`: Retrieve data transformation lineage.
- `POST /scd/{project_id}`: Apply Slowly Changing Dimensions (Type 1 or Type 2).

## 6. Data Mining Lab (`/api/v1/mining`)
- `POST /association-rules`: Apriori/FP-Growth algorithm (`min_support`, `min_confidence`).
- `POST /clustering`: K-Means clustering with Silhouette score.
- `POST /classification`: Random Forest / Logistic Regression classification.
- `POST /regression`: Linear / Random Forest regression.
- `POST /forecast`: Time-series forecasting with Exponential Smoothing.
- `POST /anomaly-detection`: Isolation Forest / IQR outlier detection.

## 7. Generative AI & Copilot (`/api/v1/ai`)
- `POST /chat`: AI Copilot conversational assistant with automated tool calling.
- `POST /nl2sql`: Natural language to safe, AST-validated SQL.
- `POST /report`: Multi-section executive summary and analytical report generation.

## 8. SQL Lab & Utilities (`/api/v1`)
- `POST /sql/execute`: Read-only, AST-validated SQL query execution.
- `GET /sql/queries/project/{project_id}`: List saved queries.
- `POST /sql/queries`: Save a SQL query.
- `POST /rag/{project_id}/ingest`: Ingest documents into RAG knowledge base.
- `POST /rag/{project_id}/query`: Query knowledge base with semantic retrieval.
- `GET /health`: System and dependency health check.

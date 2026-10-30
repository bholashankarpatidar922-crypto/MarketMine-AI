# MarketMine AI
### AI-Powered Data Mining, Data Warehousing & Generative AI Platform

MarketMine AI is an enterprise-grade intelligent workspace where users can upload their own datasets and perform the complete journey from raw data to actionable business insights with zero statistical hallucinations.

---

## Key Capabilities

1. **Data Ingestion & Persistent Storage**:
   - Multi-format ingestion: CSV, Excel (.xlsx/.xls), JSON, Parquet.
   - Immediate automatic profiling, schema inference, and metadata indexing.
   - Project-isolated persistent storage with hash-based deduplication.

2. **Dataset Explorer & Profiling**:
   - Server-side paginated tables, multi-column search, and sorting.
   - Descriptive statistics, quality scoring, missing value detection, and distribution analysis.
   - Dynamic capability auto-detection (Clustering, Forecasting, Transaction Mining, Regression).

3. **Data Cleaning & Pipeline Engine**:
   - Visual data preparation: Missing value imputation, drop duplicates, outlier removal (IQR & Z-score), text normalization, and type casting.
   - Reusable pipeline execution with full transformation audit history.

4. **Data Warehousing & Medallion Architecture**:
   - Bronze (Raw) $\to$ Silver (Cleaned) $\to$ Gold (Curated) data mart layers.
   - Star Schema designer and dimensional models (Facts & Dimensions).
   - Slowly Changing Dimensions (SCD Type 1 & Type 2) tracking.
   - Automated ETL pipelines with job status persistence.

5. **OLAP Engine**:
   - Multidimensional analytical aggregation: Roll-up, Drill-down, Slice, Dice, and Pivot tables.

6. **Data Mining & Machine Learning Lab**:
   - **Association Rule Mining**: Apriori & FP-Growth algorithms with configurable Support, Confidence, and Lift.
   - **Clustering**: K-Means clustering with Silhouette score evaluation.
   - **Classification & Regression**: Random Forest, Logistic/Linear Regression with accuracy & error metrics.
   - **Time-Series Forecasting**: Exponential Smoothing with future date projection.

7. **Generative AI Copilot & Analyst**:
   - Conversational AI Copilot connected to deterministic mathematical tools (`dataset_summary`, `missing_values`, `top_n`, etc.).
   - Factual responses with zero fabricated statistics.
   - Automated multi-step analytical report generation with exportable Markdown & CSV formats.

8. **Secure NL-to-SQL & SQL Lab**:
   - Natural Language to SQL converter.
   - AST & Regex security validation: Restricts queries to safe, read-only `SELECT`/`WITH` statements.
   - Enforces query row limits and project access boundaries.

9. **RAG Knowledge Assistant**:
   - Project documentation ingestion, automatic chunking, and semantic context retrieval.

---

## Technology Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, Axios.
- **Backend**: Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2.0 (Dual SQLite/MySQL support).
- **Data Engineering & Mining**: Pandas, NumPy, Scikit-learn, MLxtend, SciPy, Statsmodels.
- **Testing**: Pytest, HTTPX AsyncClient.
- **Deployment**: Docker, Docker Compose, Nginx.

---

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+ & npm
- (Optional) Docker & Docker Compose

### 1. Backend Setup
```powershell
cd backend
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```
- API Documentation (Swagger): [http://localhost:8000/docs](http://localhost:8000/docs)
- Health Check: [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)

### 2. Frontend Setup
```powershell
cd frontend
npm install
npm run dev
```
- Web Application: [http://localhost:5173](http://localhost:5173)

### 3. Docker Deployment (Single Command)
```bash
docker-compose up --build
```
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000`

---

## Default Login Credentials
- **Email**: `admin@marketmine.ai`
- **Password**: `admin123`

---

## Running Automated Tests
```powershell
cd backend
python -m pytest tests/ -v
```
All 3 end-to-end integration test suites run automatically against an isolated database instance.

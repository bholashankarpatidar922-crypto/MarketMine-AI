# MarketMine AI — Testing & Verification Guide

## Test Architecture

Automated integration tests are implemented in `backend/tests/test_api.py` using `pytest`, `pytest-asyncio`, and `httpx.AsyncClient`.

### Test Coverage

1. **System Health (`test_health_endpoint`)**:
   - Validates `/api/v1/health` response code 200, status `'healthy'`, database connectivity, and timestamp.

2. **Authentication & Project Isolation (`test_auth_and_project_flow`)**:
   - Seeded admin login (`admin@marketmine.ai` / `admin123`).
   - JWT token generation & verification.
   - User profile `/me` retrieval.
   - Project creation and isolated listing.

3. **End-to-End Analytics Workflow (`test_sample_ingestion_and_mining`)**:
   - E-commerce sample dataset generation & ingestion (1,000+ rows).
   - Paginated row retrieval & schema verification.
   - Profile generation (quality score $>80$, missing value metrics).
   - Capability detection (`can_clustering`, `can_forecast`).
   - Apriori algorithm execution (Support $>0.005$, Confidence $>0.05$).
   - K-Means clustering (3 clusters, Silhouette score computation).
   - Random Forest classification (accuracy metrics).
   - Exponential Smoothing time-series forecasting (7-day horizon).
   - OLAP Multidimensional Cube aggregation (dimensions + measures).
   - SQL Lab AST validation (`SELECT` passes, malicious `DROP TABLE` blocked).
   - AI Report generation (persisted markdown).
   - AI Copilot chat with tool routing (`dataset_summary`).
   - RAG document ingestion & chunking.

---

## How to Run Tests

```powershell
cd d:\projects\DM&GAI_project\backend
python -m pytest tests/ -v
```

Expected result: `3 passed in ~11s`.

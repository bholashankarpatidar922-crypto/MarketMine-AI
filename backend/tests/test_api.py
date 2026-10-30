"""
Comprehensive automated tests for MarketMine AI API.
Tests Authentication, Projects, Ingestion, Profiling, Data Mining,
Data Warehousing & OLAP, SQL AST Security, and AI Reports.
"""
import pytest
import os
import sys
import asyncio

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from httpx import AsyncClient, ASGITransport
from main import app
from app.database.session import init_db


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.fixture(scope="session", autouse=True)
async def setup_test_db():
    await init_db()
    yield


@pytest.mark.anyio
async def test_health_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("healthy", "ok")
    assert "timestamp" in data


@pytest.mark.anyio
async def test_auth_and_project_flow():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Login with seeded admin
        login_resp = await ac.post("/api/v1/auth/login", json={
            "email": "admin@marketmine.ai",
            "password": "admin123"
        })
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Check /me
        me_resp = await ac.get("/api/v1/auth/me", headers=headers)
        assert me_resp.status_code == 200
        assert me_resp.json()["email"] == "admin@marketmine.ai"

        # 3. Create a project
        proj_resp = await ac.post("/api/v1/projects/", json={
            "name": "Automated Test Project",
            "description": "Test environment workspace",
            "domain": "ecommerce"
        }, headers=headers)
        assert proj_resp.status_code == 201
        project_id = proj_resp.json()["id"]

        # 4. List projects
        list_resp = await ac.get("/api/v1/projects/", headers=headers)
        assert list_resp.status_code == 200
        assert any(p["id"] == project_id for p in list_resp.json())


@pytest.mark.anyio
async def test_sample_ingestion_and_mining():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Login
        login_resp = await ac.post("/api/v1/auth/login", json={
            "email": "admin@marketmine.ai",
            "password": "admin123"
        })
        headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

        # Create project
        proj_resp = await ac.post("/api/v1/projects/", json={
            "name": "Mining Test Project",
            "domain": "ecommerce"
        }, headers=headers)
        project_id = proj_resp.json()["id"]

        # Ingest built-in sample data
        sample_resp = await ac.post("/api/v1/ingestion/sample", json={
            "project_id": project_id
        }, headers=headers)
        assert sample_resp.status_code == 200
        dataset_id = sample_resp.json()["dataset_id"]
        table_name = sample_resp.json()["table_name"]
        assert sample_resp.json()["row_count"] > 1000

        # Explore rows
        rows_resp = await ac.get(f"/api/v1/datasets/{dataset_id}/rows?page=1&page_size=10", headers=headers)
        assert rows_resp.status_code == 200
        assert len(rows_resp.json()["rows"]) == 10
        assert rows_resp.json()["total_count"] > 1000

        # Test Profiling
        profile_resp = await ac.post(f"/api/v1/datasets/{dataset_id}/profile", headers=headers)
        assert profile_resp.status_code == 200
        p_data = profile_resp.json()
        assert p_data["column_count"] > 5
        assert p_data["quality_score"] > 80

        # Test Capabilities
        cap_resp = await ac.get(f"/api/v1/datasets/{dataset_id}/capabilities", headers=headers)
        assert cap_resp.status_code == 200
        assert cap_resp.json()["can_clustering"] is True
        assert cap_resp.json()["can_forecast"] is True

        # Test Apriori / Association Rules
        ar_resp = await ac.post("/api/v1/mining/association-rules", json={
            "dataset_id": dataset_id,
            "transaction_col": "order_id",
            "item_col": "product_name",
            "min_support": 0.005,
            "min_confidence": 0.05
        }, headers=headers)
        assert ar_resp.status_code == 200
        assert "rules" in ar_resp.json()

        # Test Clustering (K-Means)
        cluster_resp = await ac.post("/api/v1/mining/clustering", json={
            "dataset_id": dataset_id,
            "features": ["revenue", "quantity", "profit"],
            "n_clusters": 3
        }, headers=headers)
        assert cluster_resp.status_code == 200
        assert "cluster_centers" in cluster_resp.json()
        assert "silhouette_score" in cluster_resp.json()["metrics"]

        # Test Classification (Random Forest)
        class_resp = await ac.post("/api/v1/mining/classification", json={
            "dataset_id": dataset_id,
            "target_col": "customer_segment",
            "feature_cols": ["revenue", "quantity", "profit"],
            "algorithm": "random_forest"
        }, headers=headers)
        assert class_resp.status_code == 200
        assert "accuracy" in class_resp.json()["metrics"]

        # Test Forecasting
        fc_resp = await ac.post("/api/v1/mining/forecast", json={
            "dataset_id": dataset_id,
            "date_col": "order_date",
            "target_col": "revenue",
            "horizon": 7
        }, headers=headers)
        assert fc_resp.status_code == 200
        assert len(fc_resp.json()["forecast_values"]) == 7

        # Test OLAP Cube Aggregation
        olap_resp = await ac.post("/api/v1/warehouse/olap/cube", json={
            "table_name": table_name,
            "dimensions": ["category", "region"],
            "measures": [{"column": "revenue", "agg": "sum"}]
        }, headers=headers)
        assert olap_resp.status_code == 200
        assert len(olap_resp.json()["rows"]) > 0

        # Test SQL Lab AST validation
        # Valid query
        sql_valid = await ac.post("/api/v1/sql/execute", json={
            "project_id": project_id,
            "sql": f'SELECT category, COUNT(*) as cnt FROM "{table_name}" GROUP BY category;'
        }, headers=headers)
        assert sql_valid.status_code == 200
        assert len(sql_valid.json()["rows"]) > 0

        # Malicious DROP query should be blocked
        sql_drop = await ac.post("/api/v1/sql/execute", json={
            "project_id": project_id,
            "sql": f'DROP TABLE "{table_name}";'
        }, headers=headers)
        assert sql_drop.status_code == 400

        # Report generation
        rep_resp = await ac.post("/api/v1/ai/report", json={
            "project_id": project_id,
            "dataset_id": dataset_id,
            "report_type": "executive_summary"
        }, headers=headers)
        assert rep_resp.status_code == 200
        assert "content_markdown" in rep_resp.json()

        # AI Copilot chat test
        chat_resp = await ac.post("/api/v1/ai/chat", json={
            "project_id": project_id,
            "dataset_id": dataset_id,
            "message": "Summarize this dataset and list column statistics"
        }, headers=headers)
        assert chat_resp.status_code == 200
        assert "response" in chat_resp.json()
        assert len(chat_resp.json()["tools_called"]) > 0

        # RAG ingestion test
        rag_resp = await ac.post(f"/api/v1/rag/{project_id}/ingest", json={
            "title": "Business Context Guide",
            "content": "MarketMine AI provides predictive intelligence for e-commerce and retail."
        }, headers=headers)
        assert rag_resp.status_code == 200
        assert rag_resp.json()["status"] == "ingested"

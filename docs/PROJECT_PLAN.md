# MarketMine AI — Comprehensive Project Plan

## 1. Executive Summary & Product Vision

**MarketMine AI** is an enterprise-grade, intelligent, end-to-end data platform that bridges the gap between raw, heterogeneous business datasets and actionable strategic insights. Built with a unified architecture, MarketMine AI integrates:
- High-integrity **Data Ingestion & Storage** (CSV, XLSX, XLS, JSON, Parquet, Archives)
- Automated **Data Profiling & Quality Assessment**
- Interactive **Data Cleaning & Pipeline Transformation**
- Genuine **Data Warehousing** (Medallion architecture: Bronze/Silver/Gold, Star & Snowflake schemas, SCD Type 1 & 2, Incremental ETL/ELT, and OLAP analytics)
- Advanced **Data Mining & Machine Learning** (Association rules, clustering, classification, regression, anomaly detection, and time-series forecasting)
- **Generative AI & Natural Language Intelligence** (AI Copilot, deterministic tool calling, AST-validated NL-to-SQL, AI Data Analyst, Root Cause Investigation, and RAG knowledge assistant)
- **Automated Reporting & Dynamic Visualizations** (Executive summaries, audit logs, interactive charts, and exportable reports)

MarketMine AI is designed from the ground up to support generic tabular datasets across industries—including **E-commerce, Retail, Healthcare Research, Finance, Marketing, Supply Chain, Human Resources, Manufacturing, Education, and Operations**—dynamically detecting dataset capabilities rather than relying on brittle, hardcoded schemas.

---

## 2. Technology Decisions & Architecture Rationale

| Component | Selected Technology | Technical Rationale |
| :--- | :--- | :--- |
| **Backend Framework** | **FastAPI (Python 3.13)** | High performance, native asynchronous support, automatic OpenAPI/Swagger documentation, robust Pydantic v2 validation. |
| **Application & Metadata DB** | **SQLAlchemy 2.0 + SQLite (Default) & MySQL (Configurable)** | Dual-dialect architecture: Zero-setup, persistent SQLite for immediate out-of-the-box local operation; seamless migration to MySQL for enterprise multi-user production via environment variable `DATABASE_URL`. |
| **Data Processing Engine** | **Pandas 2.3 + NumPy 2.5 + PyArrow 21** | Industry-standard vectorized processing for tabular data manipulation, feature engineering, and memory-efficient chunking. |
| **Data Mining & Machine Learning** | **Scikit-learn 1.9, MLxtend 0.25, SciPy 1.16, Statsmodels 0.15** | Production-proven algorithms for Apriori association mining, K-Means/DBSCAN clustering, Random Forest/Logistic Regression classification, Isolation Forest anomaly detection, and ARIMA/Exponential Smoothing forecasting. |
| **Generative AI Orchestration** | **Provider-Agnostic LLM Layer (OpenAI, Anthropic, Gemini, Local/Ollama)** | Decoupled client abstraction with structured outputs, deterministic tool execution, AST-validated SQL generation, and context truncation controls. Safe fallback when API keys are absent. |
| **Vector Engine (RAG)** | **NumPy/SciPy Cosine Similarity & Vector Storage Engine (Extensible to FAISS/Chroma)** | Zero-friction, cross-platform embedded vector search requiring no complex external native build tools, fully persisted to disk with project-level isolation. |
| **Background Processing** | **FastAPI BackgroundTasks & Internal Async Job Queue Engine** | Durable background execution of file imports, warehouse ETL transformations, and model training with persistent status tracking, progress bars, logs, and cancellation. |
| **Frontend Framework** | **React 18/19 + TypeScript + Vite** | Modern, type-safe, ultra-responsive component-driven UI with instant HMR and optimized production bundles. |
| **Styling & Design System** | **Tailwind CSS + Lucide Icons + Glassmorphism Tokens** | Bespoke modern dark/light luxury design system, responsive grid layouts, micro-animations, accessible color contrast, and zero generic MVP aesthetics. |
| **Data Visualizations** | **Plotly.js + Recharts** | High-performance interactive chart rendering (heatmaps, scatter plots, correlation matrices, bar charts, line trends, box plots, OLAP slices). |

---

## 3. Core Principles & Non-Negotiable Standards

1. **Deterministic Analytics**: Generative AI never fabricates metrics. Numerical responses, KPI cards, and chart data are computed strictly by backend analytical engines. The LLM acts as an orchestrator, synthesizer, and explainer.
2. **Data Integrity & Immutability**: Raw uploaded files are stored immutably in persistent storage. Cleaning and transformation steps produce reproducible pipeline versions; raw sources are never silently modified.
3. **AST-Validated NL-to-SQL**: Natural language to SQL queries are parsed and checked against a strict read-only AST validator. Only `SELECT` statements referencing authorized project tables are permitted; `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, and multi-statement attacks are rejected before execution.
4. **Dynamic Capability Detection**: Analytical modules check dataset shape and column types dynamically (e.g., transaction-item structure for Apriori; date + numeric metric for forecasting; customer ID + behavioral metrics for RFM clustering). Missing prerequisites prompt helpful guidance.
5. **Multi-Tenant Project Isolation**: Users and projects are strictly isolated. All queries, dataset operations, warehouse schemas, and AI contexts enforce ownership boundaries.
6. **Persistence Over Ephemerality**: Every dataset, project, pipeline run, model artifact, and AI conversation is persisted to database storage, surviving full system restarts.

---

## 4. Phased Implementation Roadmap Overview

The project is executed across 15 structured phases:

- **Phase 1: Workspace Inspection & Architecture Planning** *(Current)*
- **Phase 2: System Foundation & Skeleton Setup**
- **Phase 3: Authentication & Multi-Project Workspace Management**
- **Phase 4: File Upload & Data Ingestion Center**
- **Phase 5: Data Cleaning & Visual Transformation Pipeline Engine**
- **Phase 6: Data Warehousing & OLAP Engine**
- **Phase 7: Data Mining Lab & Statistical Profiling**
- **Phase 8: Machine Learning & Time-Series Forecasting**
- **Phase 9: Generative AI Core & Orchestration Engine**
- **Phase 10: AI Copilot — Chat With Your Data**
- **Phase 11: AI Data Analyst & Root Cause Investigation**
- **Phase 12: RAG Knowledge Assistant & Secure NL-to-SQL**
- **Phase 13: Interactive Dashboard & Advanced Analytical Workflows**
- **Phase 14: Automated Testing & Verification Suite**
- **Phase 15: Documentation, Deployment & Production Readiness**

---

## 5. Acceptance Criteria & Definition of Done

A phase or feature is marked **Done** only when:
- Backend implementation is complete with typed Pydantic models and SQLAlchemy schemas.
- Endpoints return verified data from disk/database (no hardcoded stubs).
- Frontend components render responsive, accessible interfaces connected to the live API.
- Automated tests pass and are recorded in `docs/IMPLEMENTATION_STATUS.md`.
- No sensitive keys or unvalidated user inputs are exposed.
- User workflows survive server restarts.

"""
MarketMine AI — FastAPI Application Entry Point
"""
import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Ensure backend app is importable
sys.path.insert(0, os.path.dirname(__file__))

from app.core.config import settings
from app.core.logging_config import setup_logging
from app.database.session import init_db
from app.api.v1 import router as api_v1_router

setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle."""
    # Startup
    await init_db()
    yield
    # Shutdown — nothing to close for SQLite


def create_application() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        description="AI-Powered Data Mining, Data Warehousing & Generative AI Platform",
        version="1.0.0",
        openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
        docs_url=f"{settings.API_V1_PREFIX}/docs",
        redoc_url=f"{settings.API_V1_PREFIX}/redoc",
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # API routes
    app.include_router(api_v1_router, prefix=settings.API_V1_PREFIX)

    # Serve uploaded files (non-sensitive static assets)
    os.makedirs(settings.STORAGE_DIR, exist_ok=True)

    return app


app = create_application()

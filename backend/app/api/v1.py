"""API v1 Router — aggregates all module routers."""
from fastapi import APIRouter

from app.api.auth import router as auth_router
from app.api.projects import router as projects_router
from app.api.ingestion import router as ingestion_router
from app.api.datasets import router as datasets_router
from app.api.mining import router as mining_router
from app.api.warehouse import router as warehouse_router
from app.api.ai import router as ai_router
from app.api.pipelines import router as pipelines_router
from app.api.misc import router as misc_router

router = APIRouter()

router.include_router(auth_router)
router.include_router(projects_router)
router.include_router(ingestion_router)
router.include_router(datasets_router)
router.include_router(mining_router)
router.include_router(warehouse_router)
router.include_router(ai_router)
router.include_router(pipelines_router)
router.include_router(misc_router)

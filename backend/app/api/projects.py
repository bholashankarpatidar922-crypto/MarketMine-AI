"""Projects API — CRUD with ownership enforcement."""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database.session import get_db
from app.models import User, Project, Dataset, Report, AuditLog
from app.schemas.schemas import ProjectCreate, ProjectUpdate, ProjectOut
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/projects", tags=["Projects"])


def _check_ownership(project: Project, user: User):
    if project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")


async def _get_project(project_id: str, user: User, db: AsyncSession) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    _check_ownership(project, user)
    return project


@router.post("/", response_model=ProjectOut, status_code=201)
async def create_project(
    payload: ProjectCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = Project(owner_id=user.id, **payload.model_dump())
    db.add(project)
    await db.flush()
    db.add(AuditLog(project_id=project.id, user_id=user.id, action="project.create", resource_type="project", resource_id=project.id))
    return await _enrich(project, db)


@router.get("/", response_model=List[ProjectOut])
async def list_projects(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project).where(Project.owner_id == user.id).order_by(Project.updated_at.desc()))
    projects = result.scalars().all()
    return [await _enrich(p, db) for p in projects]


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_project(project_id, user, db)
    return await _enrich(project, db)


@router.put("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: str,
    payload: ProjectUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_project(project_id, user, db)
    for field, val in payload.model_dump(exclude_none=True).items():
        setattr(project, field, val)
    db.add(AuditLog(project_id=project.id, user_id=user.id, action="project.update", resource_type="project", resource_id=project.id))
    return await _enrich(project, db)


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_project(project_id, user, db)
    db.add(AuditLog(user_id=user.id, action="project.delete", resource_type="project", resource_id=project.id))
    await db.delete(project)


async def _enrich(project: Project, db: AsyncSession) -> ProjectOut:
    ds_count = await db.execute(select(func.count()).where(Dataset.project_id == project.id))
    rp_count = await db.execute(select(func.count()).where(Report.project_id == project.id))
    return ProjectOut(
        id=project.id,
        name=project.name,
        description=project.description,
        domain=project.domain,
        owner_id=project.owner_id,
        created_at=project.created_at,
        updated_at=project.updated_at,
        dataset_count=ds_count.scalar() or 0,
        report_count=rp_count.scalar() or 0,
    )

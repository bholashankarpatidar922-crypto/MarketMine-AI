"""Authentication API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database.session import get_db
from app.models import User, AuditLog
from app.schemas.auth import UserRegister, UserLogin, TokenResponse, UserOut
from app.core.security import hash_password, verify_password, create_access_token
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=dict, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegister, db: AsyncSession = Depends(get_db)):
    """Register a new user account."""
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role="analyst",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    # Audit
    db.add(AuditLog(user_id=user.id, action="user.register", resource_type="user", resource_id=user.id))
    token = create_access_token(user.id)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "username": user.email.split("@")[0],
            "full_name": user.full_name,
            "role": user.role,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat() if hasattr(user.created_at, "isoformat") else str(user.created_at),
        }
    }


@router.post("/login", response_model=dict)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)):
    """Authenticate user and return JWT access token."""
    login_id = (payload.email or payload.username or "").strip()
    result = await db.execute(
        select(User).where(
            (User.email == login_id) | (User.email == f"{login_id}@marketmine.ai"),
            User.is_active == True
        )
    )
    user = result.scalars().first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    db.add(AuditLog(user_id=user.id, action="user.login", resource_type="user", resource_id=user.id))
    token = create_access_token(user.id)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "username": user.email.split("@")[0],
            "full_name": user.full_name,
            "role": user.role,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat() if hasattr(user.created_at, "isoformat") else str(user.created_at),
        }
    }


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return current authenticated user profile."""
    return UserOut(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
        is_active=current_user.is_active,
        created_at=current_user.created_at.isoformat(),
    )

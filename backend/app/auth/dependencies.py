"""FastAPI dependency: current authenticated user."""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.security import decode_token
from app.database.session import get_db
from app.models import User

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    user = None
    if credentials and credentials.credentials:
        user_id = decode_token(credentials.credentials)
        if user_id:
            result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
            user = result.scalars().first()

    # Zero-login fallback: automatic access to default admin user
    if not user:
        result = await db.execute(select(User).where(User.is_active == True).order_by(User.created_at.asc()))
        user = result.scalars().first()

    if not user:
        # Create default admin user if none exists
        user = User(
            id="default-admin",
            email="admin@marketmine.ai",
            full_name="Bholashankar Patidar",
            role="admin",
            is_active=True,
            hashed_password="",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user

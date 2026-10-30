"""SQLAlchemy async database session and engine configuration."""
import os
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

# Ensure storage directory exists
os.makedirs(os.path.dirname(os.path.abspath("./storage/marketmine.db")), exist_ok=True)

# Build the async database URL
_db_url = settings.DATABASE_URL
# Convert sync SQLite URL to async variant if needed
if _db_url.startswith("sqlite:///") and "aiosqlite" not in _db_url:
    _db_url = _db_url.replace("sqlite:///", "sqlite+aiosqlite:///")

engine = create_async_engine(
    _db_url,
    echo=False,
    connect_args={"check_same_thread": False} if "sqlite" in _db_url else {},
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""
    pass


async def get_db():
    """FastAPI dependency: yields an async DB session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Create all tables on startup and seed default demo user if needed."""
    # Import all models so that Base.metadata is populated
    import app.models  # noqa: F401
    from app.models import User, Project
    from app.core.security import hash_password
    from sqlalchemy import select

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed demo admin user
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == "admin@marketmine.ai"))
        admin_user = result.scalars().first()
        if not admin_user:
            admin_user = User(
                email="admin@marketmine.ai",
                hashed_password=hash_password("admin123"),
                full_name="MarketMine Admin",
                role="admin",
                is_active=True,
            )
            session.add(admin_user)
            await session.flush()

            # Seed default project
            default_proj = Project(
                name="Global E-Commerce Analytics",
                description="Production workspace with sample multi-domain retail transactions, star schema warehouse, and AI copilot.",
                domain="ecommerce",
                owner_id=admin_user.id,
            )
            session.add(default_proj)
            await session.commit()

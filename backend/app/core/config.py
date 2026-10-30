"""Application configuration using Pydantic Settings."""
from typing import List, Optional, Any, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    APP_NAME: str = "MarketMine AI"
    ENV: str = "development"
    SECRET_KEY: str = "marketmine-super-secret-key-change-in-production-please"
    API_V1_PREFIX: str = "/api/v1"
    ALLOWED_ORIGINS: Union[List[str], str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ]

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Any) -> List[str]:
        if isinstance(v, str):
            if v.startswith("["):
                import json
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [i.strip() for i in v.split(",") if i.strip()]
        return v

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./storage/marketmine.db"

    # File Storage
    STORAGE_DIR: str = "./storage"
    UPLOAD_DIR: str = "./storage/uploads"
    ARTIFACT_DIR: str = "./storage/artifacts"
    MAX_UPLOAD_SIZE_MB: int = 50

    # JWT
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    ALGORITHM: str = "HS256"

    # Generative AI — Google Gemini is the primary provider
    LLM_PROVIDER: str = "gemini"  # mock | gemini | openai | anthropic | local
    GEMINI_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    LOCAL_LLM_URL: str = "http://localhost:11434/api/generate"
    DEFAULT_LLM_MODEL: str = "gemini-1.5-flash"
    LLM_TIMEOUT_SECONDS: int = 30
    LLM_MAX_RETRIES: int = 3

    # Pagination
    DEFAULT_PAGE_SIZE: int = 50
    MAX_PAGE_SIZE: int = 1000

    @property
    def is_production(self) -> bool:
        return self.ENV.lower() == "production"

    @property
    def upload_path(self) -> str:
        import os
        path = os.path.abspath(self.UPLOAD_DIR)
        os.makedirs(path, exist_ok=True)
        return path

    @property
    def artifact_path(self) -> str:
        import os
        path = os.path.abspath(self.ARTIFACT_DIR)
        os.makedirs(path, exist_ok=True)
        return path


settings = Settings()

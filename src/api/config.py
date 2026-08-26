"""TraceLine API Configuration and Environment Settings."""

from __future__ import annotations

import os
from pathlib import Path

# Repository Root Path resolution (3 levels up from src/api/config.py)
REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def get_data_dir() -> Path:
    """Resolve data directory path from environment variable or standard location."""
    env_path = os.getenv("TRACELINE_DATA_DIR")
    if env_path:
        p = Path(env_path)
        return p if p.is_absolute() else (REPO_ROOT / p).resolve()

    # Standard location: repo_root/data/processed/payment_network
    std_path = REPO_ROOT / "data" / "processed" / "payment_network"
    if std_path.exists():
        return std_path

    # Fallback relative to current working directory
    cwd_path = Path("data/processed/payment_network")
    if cwd_path.exists():
        return cwd_path.resolve()

    return std_path


def get_cors_origins() -> list[str]:
    """Parse comma-separated allowed CORS origins from environment."""
    env_origins = os.getenv("TRACELINE_CORS_ORIGINS") or os.getenv("CORS_ORIGINS")
    if env_origins:
        origins = [origin.strip() for origin in env_origins.split(",") if origin.strip()]
        if origins:
            return origins

    # Default development origins
    return [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "*",
    ]


class Settings:
    """Application settings and environment configuration."""

    @property
    def HOST(self) -> str:
        return os.getenv("HOST", os.getenv("TRACELINE_HOST", "0.0.0.0"))

    @property
    def PORT(self) -> int:
        return int(os.getenv("PORT", os.getenv("TRACELINE_PORT", "8000")))

    @property
    def DATA_DIR(self) -> Path:
        return get_data_dir()

    @property
    def CORS_ORIGINS(self) -> list[str]:
        return get_cors_origins()

    VERSION: str = "1.0.0"
    APP_NAME: str = "TraceLine Investigator API"


settings = Settings()

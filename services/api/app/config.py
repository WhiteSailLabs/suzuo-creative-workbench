from __future__ import annotations

import os
from dataclasses import dataclass


def _bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "Huichuang AI API")
    app_env: str = os.getenv("APP_ENV", "demo")
    api_prefix: str = os.getenv("API_PREFIX", "/api")
    database_url: str = os.getenv("DATABASE_URL", "")
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    queue_backend: str = os.getenv("QUEUE_BACKEND", "inline")
    storage_endpoint: str = os.getenv("S3_ENDPOINT", "http://localhost:9000")
    storage_backend: str = os.getenv("STORAGE_BACKEND", "inline")
    storage_bucket: str = os.getenv("S3_BUCKET", "huichuang-assets")
    storage_access_key: str = os.getenv("S3_ACCESS_KEY", "minioadmin")
    storage_secret_key: str = os.getenv("S3_SECRET_KEY", "minioadmin")
    image_api_base_url: str = os.getenv("IMAGE_API_BASE_URL", "")
    image_api_key: str = os.getenv("IMAGE_API_KEY", "")
    image_model: str = os.getenv("IMAGE_MODEL", "gpt-image-2")
    image_output_dir: str = os.getenv("IMAGE_OUTPUT_DIR", "outputs/images")
    rodin_output_dir: str = os.getenv("RODIN_OUTPUT_DIR", "outputs/rodin")
    rodin_node_bin: str = os.getenv("RODIN_NODE_BIN", "node")
    rodin_script_path: str = os.getenv("RODIN_SCRIPT_PATH", "")
    text_api_base_url: str = os.getenv("TEXT_API_BASE_URL", "")
    text_api_key: str = os.getenv("TEXT_API_KEY", "")
    text_model: str = os.getenv("TEXT_MODEL", "gpt-5.6-sol")
    search_api_url: str = os.getenv("SEARCH_API_URL", "")
    search_api_key: str = os.getenv("SEARCH_API_KEY", "")
    allow_demo_fallback: bool = _bool("ALLOW_DEMO_FALLBACK", True)


settings = Settings()


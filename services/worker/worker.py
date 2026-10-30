"""RQ worker entrypoint.

Run from the repository root after Redis is available:
    rq worker huichuang

The API uses an inline runner by default and switches to this worker when
`QUEUE_BACKEND=rq` and a Postgres database are configured.
"""

from __future__ import annotations

import asyncio
import os
from typing import Any

import httpx
from redis import Redis
from rq import Queue


REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
queue = Queue("huichuang", connection=Redis.from_url(REDIS_URL))


def generate_artifact(payload: dict[str, Any]) -> dict[str, Any]:
    """Call the configured image provider and return a normalized result."""
    base_url = os.getenv("IMAGE_API_BASE_URL", "").rstrip("/")
    api_key = os.getenv("IMAGE_API_KEY", "")
    model = os.getenv("IMAGE_MODEL", "gpt-image-2")
    if not base_url or not api_key:
        return {"provider": "demo-fallback", "model": model, "status": "completed"}
    headers = {"Authorization": f"Bearer {api_key}"}
    body = {"model": model, "prompt": payload.get("prompt", ""), "size": payload.get("size", "1024x1280"), "quality": payload.get("quality", "high"), "n": 1}
    prefix = base_url if base_url.endswith("/v1") else base_url + "/v1"
    response = httpx.post(f"{prefix}/images/generations", headers=headers, json=body, timeout=120)
    response.raise_for_status()
    return response.json()


def execute_run(run_id: str) -> dict[str, Any]:
    """RQ entrypoint used by the API when QUEUE_BACKEND=rq.

    The worker creates its own Postgres-backed store so it can update run,
    artifact and audit-event records from a separate process.
    """
    from services.api.app.config import settings
    from services.api.app.postgres_store import PostgresStore
    from services.api.app.providers.image import OpenAICompatibleImageProvider
    from services.api.app.storage import ArtifactStorage

    if not settings.database_url:
        raise RuntimeError("RQ worker requires DATABASE_URL so it can persist results")
    store = PostgresStore(settings.database_url)
    return asyncio.run(store.complete_run(run_id, OpenAICompatibleImageProvider(), ArtifactStorage()))


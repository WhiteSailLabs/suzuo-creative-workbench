from __future__ import annotations

import asyncio
import base64
import mimetypes
from typing import Any

import httpx

from .config import settings


class ArtifactStorage:
    """Store generated images inline for demo or in S3-compatible MinIO."""

    def __init__(self) -> None:
        self.backend = settings.storage_backend.lower()
        self.client: Any | None = None
        self.import_error: str | None = None
        if self.backend == "s3":
            try:
                import boto3
                self.client = boto3.client(
                    "s3",
                    endpoint_url=settings.storage_endpoint,
                    aws_access_key_id=settings.storage_access_key,
                    aws_secret_access_key=settings.storage_secret_key,
                    region_name="us-east-1",
                )
            except Exception as exc:
                self.import_error = str(exc)
                if not settings.allow_demo_fallback:
                    raise
                self.backend = "inline"

    @property
    def configured(self) -> bool:
        return self.backend == "s3" and self.client is not None

    async def save(self, image_url: str, object_key: str) -> str:
        if not self.configured:
            return image_url
        content_type, content = await self._image_bytes(image_url)
        await asyncio.to_thread(
            self.client.put_object,
            Bucket=settings.storage_bucket,
            Key=object_key,
            Body=content,
            ContentType=content_type,
        )
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.storage_bucket, "Key": object_key},
            ExpiresIn=60 * 60 * 24 * 7,
        )

    async def _image_bytes(self, image_url: str) -> tuple[str, bytes]:
        if image_url.startswith(("http://", "https://")):
            async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
                response = await client.get(image_url)
                response.raise_for_status()
                return response.headers.get("content-type", "image/png").split(";", 1)[0], response.content
        return self._decode_data_url(image_url)

    @staticmethod
    def _decode_data_url(image_url: str) -> tuple[str, bytes]:
        if image_url.startswith("data:"):
            header, payload = image_url.split(",", 1)
            content_type = header[5:].split(";", 1)[0] or "image/png"
            return content_type, base64.b64decode(payload) if ";base64" in header else payload.encode("utf-8")
        return mimetypes.guess_type(image_url)[0] or "image/png", image_url.encode("utf-8")

from __future__ import annotations

import base64
import mimetypes
from pathlib import Path
from typing import Any

import httpx

from ..config import settings
from ..store import svg_data_url


class OpenAICompatibleImageProvider:
    """Adapter for /v1/images/generations and /v1/images/edits.

    The browser never sees the API key. When no endpoint is configured, the
    provider returns an explicit demo result so local UI work remains runnable.
    """

    def __init__(self) -> None:
        self.base_url = settings.image_api_base_url.rstrip("/")
        self.api_key = settings.image_api_key
        self.model = settings.image_model

    @property
    def configured(self) -> bool:
        return bool(self.base_url and self.api_key)

    def _endpoint(self, path: str) -> str:
        prefix = self.base_url if self.base_url.endswith("/v1") else self.base_url + "/v1"
        return prefix + path

    async def generate(self, prompt: str, *, model: str | None = None, size: str = "1024x1280", quality: str = "high", n: int = 1) -> dict[str, Any]:
        if not self.configured:
            return {"provider": "demo", "model": model or self.model, "images": [svg_data_url("演示生成", prompt[:48], "#d6c7b8", 1)]}
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        payload = {"model": model or self.model, "prompt": prompt, "size": size, "quality": quality, "n": n}
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(self._endpoint("/images/generations"), headers=headers, json=payload)
            response.raise_for_status()
            return response.json()

    async def edit(self, prompt: str, image: str, *, model: str | None = None, size: str = "1024x1280", quality: str = "high") -> dict[str, Any]:
        if not self.configured:
            return {"provider": "demo", "model": model or self.model, "images": [svg_data_url("演示编辑", prompt[:48], "#cdb7aa", 2)]}
        headers = {"Authorization": f"Bearer {self.api_key}"}
        data = {"model": model or self.model, "prompt": prompt, "size": size, "quality": quality}
        filename, content, content_type = await self._image_file(image)
        files = {"image": (filename, content, content_type)}
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(self._endpoint("/images/edits"), headers=headers, data=data, files=files)
            response.raise_for_status()
            return response.json()

    async def _image_file(self, image: str) -> tuple[str, bytes, str]:
        """Normalize a data URL, local path, remote URL, or base64 payload."""
        if not image:
            raise ValueError("图片编辑缺少输入图片")
        if image.startswith("data:"):
            header, payload = image.split(",", 1)
            content_type = header[5:].split(";", 1)[0] or "image/png"
            if ";base64" in header:
                raw = base64.b64decode(payload)
            else:
                from urllib.parse import unquote_to_bytes
                raw = unquote_to_bytes(payload)
            extension = mimetypes.guess_extension(content_type) or ".png"
            return "reference" + extension, raw, content_type
        if image.startswith(("http://", "https://")):
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                response = await client.get(image)
                response.raise_for_status()
                content_type = response.headers.get("content-type", "image/png").split(";", 1)[0]
                extension = mimetypes.guess_extension(content_type) or ".png"
                return "reference" + extension, response.content, content_type
        path = Path(image)
        if path.exists() and path.is_file():
            content_type = mimetypes.guess_type(path.name)[0] or "image/png"
            return path.name, path.read_bytes(), content_type
        try:
            return "reference.png", base64.b64decode(image), "image/png"
        except Exception as exc:
            raise ValueError("图片输入必须是 data URL、HTTP URL、本地文件或 base64") from exc


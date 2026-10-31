from __future__ import annotations

import base64
import mimetypes
from urllib.parse import unquote_to_bytes, urlparse
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

    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = (base_url if base_url is not None else settings.image_api_base_url).rstrip("/")
        self.api_key = api_key if api_key is not None else settings.image_api_key
        self.model = model if model is not None else settings.image_model
        self.transport = transport

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
        async with httpx.AsyncClient(timeout=120, transport=self.transport) as client:
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
        async with httpx.AsyncClient(timeout=120, transport=self.transport) as client:
            response = await client.post(self._endpoint("/images/edits"), headers=headers, data=data, files=files)
            response.raise_for_status()
            return response.json()

    async def with_references(self, prompt: str, images: list[str]) -> dict[str, Any]:
        if not self.configured:
            return await self.generate(prompt)
        files = []
        for image in images:
            filename, content, content_type = await self._image_file(image)
            files.append(("image[]", (filename, content, content_type)))
        async with httpx.AsyncClient(timeout=120, transport=self.transport) as client:
            response = await client.post(self._endpoint("/images/edits"), headers={"Authorization": f"Bearer {self.api_key}"}, data={"model": self.model, "prompt": prompt, "size": "1024x1280", "quality": "high"}, files=files)
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
                raw = unquote_to_bytes(payload)
            extension = mimetypes.guess_extension(content_type) or ".png"
            return "reference" + extension, raw, content_type
        if image.startswith(("http://", "https://")):
            async with httpx.AsyncClient(timeout=30, follow_redirects=True, transport=self.transport) as client:
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

    @staticmethod
    def normalize_images(result: dict[str, Any] | None) -> list[str]:
        if not result:
            return []
        items = result.get("data")
        if not isinstance(items, list):
            items = result.get("images")
        if not isinstance(items, list):
            return []
        images: list[str] = []
        for item in items:
            if isinstance(item, str):
                if item.startswith(("data:", "http://", "https://")):
                    images.append(item)
                continue
            if not isinstance(item, dict):
                continue
            if isinstance(item.get("url"), str) and item["url"]:
                images.append(item["url"])
            elif isinstance(item.get("b64_json"), str) and item["b64_json"]:
                images.append("data:image/png;base64," + item["b64_json"])
        return images

    async def save_image(self, image: str, output_dir: Path, stem: str) -> dict[str, str]:
        if image.startswith("data:"):
            header, payload = image.split(",", 1)
            media_type = header[5:].split(";", 1)[0] or "image/png"
            content = base64.b64decode(payload) if ";base64" in header else unquote_to_bytes(payload)
        elif image.startswith(("http://", "https://")):
            async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
                response = await client.get(image)
                response.raise_for_status()
                content = response.content
                media_type = response.headers.get("content-type", "image/png").split(";", 1)[0]
        else:
            path = Path(image)
            if not path.is_file():
                raise ValueError("图片结果不是可保存的 URL、data URL 或本地文件")
            content = path.read_bytes()
            media_type = mimetypes.guess_type(path.name)[0] or "image/png"
        if not content:
            raise ValueError("图片结果为空")
        extension = mimetypes.guess_extension(media_type) or Path(urlparse(image).path).suffix or ".png"
        output_dir.mkdir(parents=True, exist_ok=True)
        target = (output_dir / f"{stem}{extension}").resolve()
        target.write_bytes(content)
        return {"path": str(target), "media_type": media_type}


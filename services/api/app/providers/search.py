from __future__ import annotations

from typing import Any

import httpx

from ..config import settings


class SearchProvider:
    """Replaceable internet search adapter with a safe local fallback."""

    async def search(self, query: str) -> dict[str, Any]:
        if not settings.search_api_url:
            return {"provider": "local-fallback", "results": []}
        headers = {"Authorization": f"Bearer {settings.search_api_key}"} if settings.search_api_key else {}
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(settings.search_api_url, params={"q": query}, headers=headers)
            response.raise_for_status()
            return response.json()


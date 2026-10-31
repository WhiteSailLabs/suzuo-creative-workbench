import base64
import unittest

import httpx

from app.providers.image import OpenAICompatibleImageProvider


class ImageProviderNormalizationTests(unittest.IsolatedAsyncioTestCase):
    def test_normalize_url_b64_and_data_url_results(self):
        encoded = base64.b64encode(b"png-bytes").decode("ascii")
        payload = {
            "data": [
                {"url": "https://cdn.example.test/result.png"},
                {"b64_json": encoded},
                "data:image/png;base64," + encoded,
            ]
        }

        images = OpenAICompatibleImageProvider.normalize_images(payload)

        self.assertEqual(images[0], "https://cdn.example.test/result.png")
        self.assertEqual(images[1], "data:image/png;base64," + encoded)
        self.assertEqual(images[2], "data:image/png;base64," + encoded)

    def test_normalize_empty_output_returns_empty_list(self):
        self.assertEqual(OpenAICompatibleImageProvider.normalize_images({"data": []}), [])
        self.assertEqual(OpenAICompatibleImageProvider.normalize_images({}), [])

    async def test_generate_raises_on_http_failure(self):
        async def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(503, text="temporarily unavailable")

        provider = OpenAICompatibleImageProvider(
            base_url="https://example.test/v1",
            api_key="secret-token",
            model="gpt-image-1",
            transport=httpx.MockTransport(handler),
        )

        with self.assertRaises(httpx.HTTPStatusError):
            await provider.generate("a modern Suzhou incense holder")


if __name__ == "__main__":
    unittest.main()

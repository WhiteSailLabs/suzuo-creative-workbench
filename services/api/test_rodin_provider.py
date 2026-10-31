import json
import tempfile
import unittest
from pathlib import Path


class RodinProviderTests(unittest.IsolatedAsyncioTestCase):
    async def test_image_mode_returns_pbr_asset_before_untextured_variants(self):
        from app.providers.rodin import RodinProvider

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output_dir = root / "output"
            reference = root / "reference.png"
            reference.write_bytes(b"reference-image")

            async def runner(args, env):
                shaded = output_dir / "base_basic_shaded.glb"
                pbr = output_dir / "base_basic_pbr.glb"
                shaded.write_bytes(b"glTF" + b"\x00" * 32)
                pbr.write_bytes(b"glTF" + b"\x00" * 32)
                return 0, json.dumps(
                    {
                        "generation_id": "gen_pbr",
                        "status": "completed",
                        "files": [
                            {"name": shaded.name, "role": "model", "path": str(shaded)},
                            {"name": pbr.name, "role": "model", "path": str(pbr)},
                        ],
                    }
                ), ""

            result = await RodinProvider(runner=runner).generate(
                "", output_dir, image_paths=[reference]
            )

            self.assertEqual(result.files[0].name, "base_basic_pbr.glb")

    async def test_image_mode_rejects_result_without_pbr_asset(self):
        from app.providers.rodin import RodinProvider, RodinProviderError

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output_dir = root / "output"
            reference = root / "reference.png"
            reference.write_bytes(b"reference-image")

            async def runner(args, env):
                shaded = output_dir / "base_basic_shaded.glb"
                shaded.write_bytes(b"glTF" + b"\x00" * 32)
                return 0, json.dumps(
                    {
                        "generation_id": "gen_shaded",
                        "status": "completed",
                        "files": [
                            {"name": shaded.name, "role": "model", "path": str(shaded)}
                        ],
                    }
                ), ""

            with self.assertRaisesRegex(RodinProviderError, "PBR"):
                await RodinProvider(runner=runner).generate(
                    "", output_dir, image_paths=[reference]
                )
    async def test_image_mode_passes_repeated_images_without_prompt(self):
        from app.providers.rodin import RodinProvider

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output_dir = root / "output"
            front = root / "front.png"
            back = root / "back.png"
            front.write_bytes(b"front-image")
            back.write_bytes(b"back-image")
            captured = []

            async def runner(args, env):
                captured.extend(args)
                model = output_dir / "model_pbr.glb"
                model.write_bytes(b"glTF" + b"\x00" * 32)
                return 0, json.dumps(
                    {
                        "generation_id": "gen_image",
                        "status": "completed",
                        "files": [{"name": "model_pbr.glb", "role": "base", "path": str(model)}],
                    }
                ), ""

            await RodinProvider(runner=runner).generate(
                "ignored creative prompt",
                output_dir,
                image_paths=[front, back],
            )

            self.assertNotIn("--prompt", captured)
            self.assertEqual(
                [captured[index + 1] for index, item in enumerate(captured) if item == "--image"],
                [str(front.resolve()), str(back.resolve())],
            )

    async def test_text_mode_keeps_prompt_compatibility(self):
        from app.providers.rodin import RodinProvider

        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            captured = []

            async def runner(args, env):
                captured.extend(args)
                model = output_dir / "model.glb"
                model.write_bytes(b"glTF" + b"\x00" * 32)
                return 0, json.dumps(
                    {
                        "generation_id": "gen_text",
                        "status": "completed",
                        "files": [{"name": "model.glb", "role": "base", "path": str(model)}],
                    }
                ), ""

            await RodinProvider(runner=runner).generate(
                "modern incense holder", output_dir
            )

            self.assertNotIn("--image", captured)
            self.assertEqual(
                captured[captured.index("--prompt") + 1], "modern incense holder"
            )

    async def test_image_mode_rejects_more_than_five_references(self):
        from app.providers.rodin import RodinProvider, RodinProviderError

        async def runner(args, env):
            raise AssertionError("runner must not be called")

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            images = []
            for index in range(6):
                image = root / f"{index}.png"
                image.write_bytes(b"image")
                images.append(image)
            with self.assertRaisesRegex(RodinProviderError, "最多五张"):
                await RodinProvider(runner=runner).generate(
                    "", root / "output", image_paths=images
                )

    async def test_generate_returns_validated_glb_result(self):
        from app.providers.rodin import RodinProvider

        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            model = output_dir / "model.glb"
            model.write_bytes(b"glTF" + b"\x00" * 32)

            async def runner(args, env):
                return 0, json.dumps(
                    {
                        "generation_id": "gen_123",
                        "status": "completed",
                        "files": [{"name": "model.glb", "role": "base", "path": str(model)}],
                    }
                ), ""

            result = await RodinProvider(runner=runner).generate(
                "modern incense holder", output_dir
            )

            self.assertEqual(result.generation_id, "gen_123")
            self.assertEqual(result.status, "completed")
            self.assertEqual(result.files[0].path, str(model.resolve()))

    async def test_cli_nonzero_exit_is_safe_error(self):
        from app.providers.rodin import RodinProvider, RodinProviderError

        async def runner(args, env):
            return 2, "", "OAuth token expired: private details"

        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(RodinProviderError, "Rodin CLI 执行失败"):
                await RodinProvider(runner=runner).generate(
                    "modern incense holder", Path(directory)
                )

    async def test_invalid_json_is_rejected(self):
        from app.providers.rodin import RodinProvider, RodinProviderError

        async def runner(args, env):
            return 0, "not-json", ""

        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(RodinProviderError, "无效 JSON"):
                await RodinProvider(runner=runner).generate("prompt", Path(directory))

    async def test_completed_result_without_glb_is_rejected(self):
        from app.providers.rodin import RodinProvider, RodinProviderError

        with tempfile.TemporaryDirectory() as directory:
            txt = Path(directory) / "readme.txt"
            txt.write_text("no model", encoding="utf-8")

            async def runner(args, env):
                return 0, json.dumps(
                    {
                        "generation_id": "gen_empty",
                        "status": "completed",
                        "files": [{"name": "readme.txt", "role": "note", "path": str(txt)}],
                    }
                ), ""

            with self.assertRaisesRegex(RodinProviderError, "GLB"):
                await RodinProvider(runner=runner).generate("prompt", Path(directory))

    async def test_output_path_outside_configured_directory_is_rejected(self):
        from app.providers.rodin import RodinProvider, RodinProviderError

        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as outside:
            model = Path(outside) / "escape.glb"
            model.write_bytes(b"glTF" + b"\x00" * 16)

            async def runner(args, env):
                return 0, json.dumps(
                    {
                        "generation_id": "gen_escape",
                        "status": "completed",
                        "files": [{"name": "escape.glb", "role": "base", "path": str(model)}],
                    }
                ), ""

            with self.assertRaisesRegex(RodinProviderError, "输出目录"):
                await RodinProvider(runner=runner).generate("prompt", Path(directory))


if __name__ == "__main__":
    unittest.main()

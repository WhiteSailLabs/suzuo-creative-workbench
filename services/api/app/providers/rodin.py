from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Awaitable, Callable

from ..config import settings


class RodinProviderError(RuntimeError):
    pass


@dataclass(frozen=True)
class RodinFile:
    name: str
    role: str
    path: str


@dataclass(frozen=True)
class RodinResult:
    generation_id: str
    status: str
    files: list[RodinFile]


Runner = Callable[[list[str], dict[str, str]], Awaitable[tuple[int, str, str]]]


async def _default_runner(
    args: list[str], env: dict[str, str]
) -> tuple[int, str, str]:
    process = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    stdout, stderr = await process.communicate()
    return (
        process.returncode,
        stdout.decode("utf-8", errors="replace"),
        stderr.decode("utf-8", errors="replace"),
    )


class RodinProvider:
    def __init__(
        self,
        *,
        node_bin: str | None = None,
        script_path: str | Path | None = None,
        runner: Runner | None = None,
    ) -> None:
        repository_root = Path(__file__).resolve().parents[4]
        self.node_bin = node_bin or settings.rodin_node_bin
        self.script_path = Path(
            script_path or settings.rodin_script_path or repository_root / "scripts" / "rodin-generate.mjs"
        ).resolve()
        self.runner = runner or _default_runner

    async def generate(
        self,
        prompt: str,
        output_dir: Path,
        *,
        image_paths: list[Path] | None = None,
    ) -> RodinResult:
        resolved_output = output_dir.resolve()
        resolved_output.mkdir(parents=True, exist_ok=True)
        references = [Path(item).resolve() for item in (image_paths or [])]
        if len(references) > 5:
            raise RodinProviderError("Rodin 二维参考图最多五张")
        for reference in references:
            if not reference.is_file() or reference.stat().st_size == 0:
                raise RodinProviderError("Rodin 二维参考图不存在或为空")
        if not references and not prompt.strip():
            raise RodinProviderError("Rodin 文字模式缺少提示词")
        env = dict(os.environ)
        env["RODIN_OUTPUT_DIR"] = str(resolved_output)
        command = [self.node_bin, str(self.script_path)]
        if references:
            for reference in references:
                command.extend(["--image", str(reference)])
        else:
            command.extend(["--prompt", prompt])
        returncode, stdout, _stderr = await self.runner(
            command, env
        )
        if returncode != 0:
            raise RodinProviderError("Rodin CLI 执行失败，请检查授权或服务状态")
        try:
            payload = json.loads(stdout)
        except json.JSONDecodeError as exc:
            raise RodinProviderError("Rodin CLI 返回无效 JSON") from exc
        files: list[RodinFile] = []
        for item in payload.get("files") or []:
            path = Path(item.get("path", "")).resolve()
            if path != resolved_output and resolved_output not in path.parents:
                raise RodinProviderError("Rodin 文件不在允许的输出目录")
            if path.suffix.lower() != ".glb":
                continue
            if not path.is_file() or path.stat().st_size <= 4:
                raise RodinProviderError("Rodin GLB 文件不存在或为空")
            if path.read_bytes()[:4] != b"glTF":
                raise RodinProviderError("Rodin GLB 文件头无效")
            files.append(
                RodinFile(
                    name=item.get("name") or path.name,
                    role=item.get("role") or "model",
                    path=str(path),
                )
            )
        if references:
            pbr_files = [item for item in files if "pbr" in item.name.lower()]
            if not pbr_files:
                raise RodinProviderError("Rodin 没有返回可交付的 PBR 贴图模型")
            files = pbr_files + [item for item in files if item not in pbr_files]
        if payload.get("status") != "completed" or not files:
            raise RodinProviderError("Rodin 已结束但没有返回有效 GLB")
        return RodinResult(
            generation_id=str(payload.get("generation_id") or ""),
            status="completed",
            files=files,
        )

# 苏作创意台后端

FastAPI 负责项目状态、对话解释、不可变 Brief 修订、文化溯源、2D/3D 异步任务、设计版本、候选锁定和提案投影。默认使用 `MemoryStore`，适合本地 Demo；服务重启后工作区状态重置，但 `outputs/` 中生成文件仍保留。

## 主要接口

- `GET /api/workbench/projects/{project_id}`：完整工作区。
- `POST /api/workbench/projects/{project_id}/turns`：解释对话并追加 Brief 修订。
- `GET/POST/PATCH /api/workbench/projects/{project_id}/culture`：文化事实与设计转译。
- `POST /api/workbench/projects/{project_id}/image-jobs`：创建二维任务。
- `POST /api/workbench/projects/{project_id}/rodin-jobs`：为已有版本创建 GLB 任务。
- `GET /api/workbench/projects/{project_id}/jobs/{job_id}`：按精确任务 ID 查询状态。
- `POST /api/workbench/projects/{project_id}/jobs/{job_id}/retry`：重试失败任务。
- `GET /api/workbench/projects/{project_id}/versions`：不可变版本历史。
- `POST /api/workbench/projects/{project_id}/versions/{version_id}/candidate`：显式锁定候选。
- `GET /api/workbench/projects/{project_id}/proposal`：只返回可对客内容。
- `GET /api/workbench/assets/{artifact_id}`：只允许访问配置输出目录内的已登记成果。

任务状态为 `submitted → processing → completed|failed|stale`。旧 Brief 或旧版本的晚到结果会保留为 `stale`，不会替换候选版本；失败任务不创建空版本。

## Provider 环境变量

```bash
IMAGE_API_BASE_URL=https://example.com/v1
IMAGE_API_KEY=...             # 只通过安全注入提供
IMAGE_MODEL=gpt-image-2
IMAGE_OUTPUT_DIR=outputs/images

TEXT_API_BASE_URL=https://example.com/v1
TEXT_API_KEY=...              # 可选；失败时退回确定性解释器
TEXT_MODEL=gpt-5.6-sol

RODIN_OUTPUT_DIR=outputs/rodin
RODIN_NODE_BIN=node
RODIN_SCRIPT_PATH=scripts/rodin-generate.mjs
```

没有配置图片 Provider 时，本地会生成明确标识的 SVG 演示图，便于验证交互；这不等于真实图片 Provider 已通过。真实验收必须检查非空且可解码的图片。Rodin 需要先运行 `hyper3d auth login`。

## 启动与测试

```bash
PYTHONPATH=services/api .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
PYTHONPATH=services/api .venv/bin/python -m unittest discover -s services/api -p 'test_*.py' -v
```

# 会创 AI 后端

## 结构

- `services/api`：FastAPI REST、SSE、素材预览、图片 Provider 代理和可选 PostgreSQL Repository。
- `services/worker`：RQ Worker 入口；设置 `QUEUE_BACKEND=rq` 后负责独立执行工作流并回写 PostgreSQL。
- `schema.sql`：PostgreSQL 目标表结构，客户档案、项目、工作流、运行、版本和审计事件均按客户/项目保留。
- `docker-compose.yml`：本地 PostgreSQL、Redis、MinIO。

## 本地启动

```powershell
docker compose up -d postgres redis minio
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r services/api/requirements.txt
uvicorn services.api.app.main:app --reload --port 8000
```

没有 Docker、Redis 或图片 API 时，API 会明确回退到 MemoryStore、inline runner 和演示图片，便于前端开发。配置 `DATABASE_URL` 后会启用 PostgreSQL 持久化；配置 `QUEUE_BACKEND=rq`、`REDIS_URL` 后再启动 worker。

## 主要接口

- `GET /api/clients`：单公司客户切换器数据。
- `GET /api/clients/{id}/projects`：客户档案下的项目。
- `GET /api/projects/{id}/workflow`：可编辑工作流节点。
- `PATCH /api/projects/{id}/nodes/{node_id}`：修改提示词、参数、引用素材，并标记下游节点过期。
- `POST /api/projects/{id}/runs`：创建生成任务。
- `GET /api/projects/{id}/events`：SSE 节点与成果事件；前端按 `input_locked`、`material_resolved`、`references_bound`、`prompt_composed`、`provider.*`、`quality.*`、`artifact.created` 更新流程轨迹。
- `GET /api/materials/search?q=...`：全局 CC0 面料库检索。
- `GET /api/materials/{material_id}/preview`：返回已下载的 CC0 面料预览图。
- `GET /api/references?q=...`：全局参考图库检索。
- `POST /api/search`：联网搜索适配器；未配置时回退本地参考图目录。
- `POST /api/references/confirm`：用户确认后，把联网参考图写入全局参考图库。
- `POST /api/image/generate` / `POST /api/image/edit`：OpenAI 兼容图片 API 代理。

## 已实现的执行路径

- `QUEUE_BACKEND=inline`：本地开发默认路径，FastAPI 后台任务直接执行，仍会发出 SSE 事件。
- `QUEUE_BACKEND=rq`：API 把 `run_id` 入 Redis/RQ，worker 从 PostgreSQL 恢复运行数据、调用图片 Provider、写入 artifact 和审计事件。
- 图片编辑输入支持 data URL、HTTP URL、本地文件和 base64，统一转成 multipart 二进制文件。
- 编辑任务必须携带明确的 `source_artifact_id`（兼容旧字段 `edit_artifact_id`）；运行支持 `idempotency_key`，版本会记录 `parent_artifact_id` 并按源版本递增。
- 图片结果先经过最小质量门禁；Provider 没有返回图片时运行失败，不会生成空 artifact。
- `STORAGE_BACKEND=s3`：生成结果写入本地 MinIO/S3，并把预签名 URL 保存到 artifact；默认 `inline` 便于无 Docker 启动。

## 真实 Provider 注意

不同 OpenAI 兼容服务对 `/v1/images/edits` 的字段名和响应格式仍可能不同。当前适配器已经统一 URL、data URL、文件和 base64 输入；接入具体服务时只需调整 `providers/image.py` 的请求字段，不需要改前端或工作流数据模型。

## 仍需接入生产环境的部分

- `STORAGE_BACKEND=inline` 时成果仍返回 data URL；切换为 `s3` 并启动 MinIO 后才会真正走对象存储。
- SSE 当前在 API 进程内广播；RQ 多进程部署时应把事件广播迁移到 Redis Stream 或 Pub/Sub。


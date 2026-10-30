# 会创 AI · Talk to Create

ToB 内部创作工作台 Demo。它把客户档案、项目、全局 CC0 面料库、参考图库、可编辑图片工作流和对话摘要放在同一个工作台里。

## 已落地的演示闭环

1. 切换客户档案，查看该客户的多个项目。
2. 在左侧选择 CC0 面料和参考图；联网搜索结果先显示为待确认缩略图。
3. 点击“模拟一段实时对话”，观察转写、素材检索、Prompt 组装和工作流状态同步推进。
4. 在右侧工作流节点中直接修改 Prompt、面料和参考图。
5. 点击“运行此节点”，查看 8 节点图片生成流：输入锁定、面料匹配、参考绑定、Prompt 编排、版本分支、调用 Image 2、质量检查、保存版本。
6. 查看对话总结，切换 V1/V2，导出项目 Brief 与工作流记录。
7. 点击“进入生成画布”或右侧“打开画布”，进入类似 ComfyUI 的节点画布；节点、连接线、参数面板和运行轨迹都在同一视图中。

## 本地运行

前端：

```powershell
npm install
npm run dev -- --host 127.0.0.1
```

打开 <http://127.0.0.1:5173>。

后端（可选，当前前端没有真实图片 API 时仍可单独演示）：

```powershell
python -m pip install -r services/api/requirements.txt
python -m uvicorn services.api.app.main:app --reload --port 8000
```

打开 <http://127.0.0.1:8000/docs> 查看接口。

## 目录

- `src/`：React/Vite 工作台界面。
- `services/api/`：FastAPI REST、SSE、图片 Provider 适配器和搜索适配器。
- `services/worker/`：RQ Worker 入口，后续把长任务移出 API 进程。
- `schema.sql`：客户、项目、工作流、运行、版本和审计事件表结构。
- `data/materials/`：从 GitHub 目录索引识别、从 ambientCG 下载的 CC0 面料种子包，含 `manifest.json` 和许可文本。
- `workflow-sources/`：Comfy-Org 官方工作流模板来源存档。

## 真实图片 API

后端提供 OpenAI 兼容的 `/api/image/generate` 和 `/api/image/edit` 代理，目标契约对应 `/v1/images/generations` 与 `/v1/images/edits`。配置 `IMAGE_API_BASE_URL`、`IMAGE_API_KEY` 和 `IMAGE_MODEL` 后再接入真实服务；没有配置时会回退到演示成果，方便先验证交互链路。

## 当前边界

- 当前登录是单公司会话和客户切换器，未接入真实身份系统。
- 当前默认使用 inline runner + MemoryStore，方便无依赖启动；配置 `DATABASE_URL` 后启用 PostgreSQL 持久化，配置 `QUEUE_BACKEND=rq` 后由独立 worker 执行任务；配置 `STORAGE_BACKEND=s3` 后将成果写入 MinIO。
- 思必驰语音 API 暂不接入，先用文字/模拟语音验证“说话时 Agent 就开始准备”的链路。

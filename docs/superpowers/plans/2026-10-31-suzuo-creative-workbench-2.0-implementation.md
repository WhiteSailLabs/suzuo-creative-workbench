# 苏作创意台 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 React/Vite + FastAPI 工作台中完整实现项目首页、多设计方向、统一作品资产库、评审、提案和二维到贴图三维的苏作文创设计闭环。

**Architecture:** 保留现有 `Workspace → DesignVersion → Artifact/GenerationJob` 契约，在工作区内增量增加 `DesignDirection`、统一 `AssetRecord`、`ReviewRecord` 和项目集合 API。前端不增加路由依赖，使用顶层 `AppView` 状态提供项目、工作台、作品、资产、评审和提案六个页面；现有生成流程继续通过 FastAPI 后台任务和轮询运行。

**Tech Stack:** React 19、TypeScript 7、Vite 8、Vitest/Testing Library、FastAPI、Pydantic、Python unittest、Three.js/React Three Fiber、现有 OpenAI-compatible 图片接口和 Hyper3D/Rodin CLI。

**Spec:** `docs/superpowers/specs/2026-10-31-suzuo-creative-workbench-2.0-design.md`

## Global Constraints

- 在当前脏工作区增量实现，保留所有现有用户文件和未提交改动；只提交任务明确列出的文件。
- P0 是本机单用户 Demo，不实现登录、多租户、公开分享和实时多人协作。
- 默认图片生成保持 OpenAI-compatible 接口；默认三维生成保持 Rodin Image to 3D。
- 三维最终资产必须选择带 PBR 材质的 GLB；白模不能标记为最终作品。
- P0 使用一张锁定主图，数据结构继续支持同版本最多 5 张参考图。
- 局部修改在 P0 只展示入口与说明，实际使用整图编辑；不得伪装为遮罩 inpainting。
- 文化事实、设计转译、设计师判断、AI 推断和待核验必须有不同类型和可见标签。
- 桌面 Chrome 基准 1440×900，最低有效视口 1280×720；状态不能只靠颜色表达。
- 不引入 React Router、状态管理框架、数据库迁移框架或新的 UI 组件库。
- 每个新行为遵循 RED → GREEN；任务结束运行前端全套、后端全套和生产构建。

## Review Focus

1. 项目切换后所有生成、版本锁定和评审请求必须使用当前项目 ID，不能静默回落到默认香插项目；Task 4、5 的测试覆盖。
2. 归档/失败/过期资产不能被默认设为候选或进入客户提案；Task 2、3 的测试覆盖。
3. 文化事实未经核验时内部提案可带标签，客户提案必须拒绝；Task 3 的测试覆盖。
4. 同一项目同类生成任务已有 `submitted/processing` 时必须返回可理解冲突，避免重复扣费；Task 2 的测试覆盖。
5. 低于 1280×720 时主界面必须给出窗口提示且主操作不覆盖作品；Task 8 的组件与浏览器测试覆盖。

---

### Task 1: 多项目、设计方向和兼容数据模型

**Files:**
- Modify: `services/api/app/cultural_workbench.py`
- Modify: `services/api/app/schemas.py`
- Modify: `services/api/app/store.py`
- Create: `services/api/test_workbench_v2_domain.py`

**Interfaces:**
- Consumes: 现有 `create_seed_workspace()`、`MemoryStore.workspaces` 和 WorkspaceOut。
- Produces: `create_seed_workspaces() -> dict[str, dict]`、`DesignDirection`、扩展后的 `ProjectState/WorkspaceOut`、`MemoryStore.list_projects()`、`create_project(payload)`、`create_direction(project_id, payload)`。

- [ ] **Step 1: 写失败测试，固定三个 Demo 项目和方向模型**

测试断言 `create_seed_workspaces()` 返回漏景香插、丝绸收纳盒、水袖桌面灯；每个工作区包含 `directions`、`active_direction_id`、`assets`、`reviews`、`proposals`，且旧 `create_seed_workspace()` 仍返回香插项目。

- [ ] **Step 2: 运行领域测试并确认因接口缺失失败**

Run: `PYTHONPATH=services/api .venv/bin/python -m unittest services/api/test_workbench_v2_domain.py -v`
Expected: FAIL，缺少 `create_seed_workspaces` 或新字段。

- [ ] **Step 3: 实现兼容数据模型和三个 Demo 种子**

新增方向字段 `id/name/concept/status/culture_ids/material_ids/created_at/updated_at`。香插保留现有 ID；收纳盒与水袖灯使用独立项目 ID、Brief 和文化条目。`MemoryStore.__init__` 使用三个工作区初始化，但保留测试可覆盖的内存字典。

- [ ] **Step 4: 写失败测试，固定项目和方向创建行为**

断言项目名称去空格后不可为空、方向名称必填、活动方向随创建更新、不同项目版本互不串联。

- [ ] **Step 5: 实现 `list_projects/create_project/create_direction`**

项目列表返回阶段、最新版本、二维/三维数量、待处理数量和更新时间；新项目使用空工作区结构而不是复制香插文化内容。

- [ ] **Step 6: 运行 Task 1 测试与后端全套**

Run: `PYTHONPATH=services/api .venv/bin/python -m unittest services/api/test_workbench_v2_domain.py -v && PYTHONPATH=services/api .venv/bin/python -m unittest discover -s services/api -p 'test_*.py' -v`
Expected: PASS，现有 58 个测试仍通过。

- [ ] **Step 7: 提交 Task 1**

```bash
git add services/api/app/cultural_workbench.py services/api/app/schemas.py services/api/app/store.py services/api/test_workbench_v2_domain.py
git commit -m "feat: add multi-project design direction model"
```

### Task 2: 统一资产库、关系和生成门禁

**Files:**
- Modify: `services/api/app/store.py`
- Modify: `services/api/app/schemas.py`
- Modify: `services/api/app/main.py`
- Create: `services/api/test_workbench_v2_assets.py`

**Interfaces:**
- Consumes: Task 1 的 `directions/assets` 和现有图片、Rodin 完成回调。
- Produces: `AssetRecord`、`list_assets(project_id, filters)`、`patch_asset(project_id, asset_id, payload)`、`asset_relations(project_id, asset_id)`、项目集合/方向/资产 REST API。

- [ ] **Step 1: 写失败 API 测试，固定项目、方向和资产端点**

覆盖 `GET/POST /api/workbench/projects`、`POST /projects/{id}/directions`、`GET /projects/{id}/assets`、`PATCH /assets/{id}`、`GET /assets/{id}/relations`。

- [ ] **Step 2: 运行资产测试并确认 404/接口缺失**

Run: `PYTHONPATH=services/api .venv/bin/python -m unittest services/api/test_workbench_v2_assets.py -v`
Expected: FAIL，集合和资产端点不存在。

- [ ] **Step 3: 实现统一资产登记和兼容回写**

图片导入/生成、Rodin 完成时同时保留 version 内 artifact 并 upsert 项目 `assets`。资产字段使用 spec 7.5，状态支持 `draft/reviewing/selected/published/archived/processing/completed/failed/stale`。

- [ ] **Step 4: 写失败测试，固定筛选、归档、关系和重复任务门禁**

断言可按 `type/status/direction_id/tag/query` 筛选；归档资产不能设候选；关系响应含父版本、输入资产和下游模型；同项目同类任务 processing 时第二次创建返回 409。

- [ ] **Step 5: 实现筛选、关系图和生成门禁**

重复任务错误为 `当前项目已有同类生成任务正在进行`。现有失败重试仍可创建新 attempt。

- [ ] **Step 6: 运行 Task 2 测试与后端全套**

Run: `PYTHONPATH=services/api .venv/bin/python -m unittest services/api/test_workbench_v2_assets.py -v && PYTHONPATH=services/api .venv/bin/python -m unittest discover -s services/api -p 'test_*.py' -v`
Expected: PASS。

- [ ] **Step 7: 提交 Task 2**

```bash
git add services/api/app/store.py services/api/app/schemas.py services/api/app/main.py services/api/test_workbench_v2_assets.py
git commit -m "feat: add traceable workbench asset library"
```

### Task 3: 评审、阶段门、内部与客户提案

**Files:**
- Modify: `services/api/app/store.py`
- Modify: `services/api/app/schemas.py`
- Modify: `services/api/app/main.py`
- Create: `services/api/test_workbench_v2_reviews.py`

**Interfaces:**
- Consumes: Task 2 的 AssetRecord、现有候选锁定和 proposal 生成。
- Produces: `ReviewRecord`、`create_review()`、`resolve_review()`、`stage_gate_status()`、`proposal_for_project(audience)`、`asset_manifest()` 及 REST API。

- [ ] **Step 1: 写失败测试，固定评审生命周期**

覆盖创建评审、绑定版本/资产/区域、`pending → passed/needs_changes/alternative/rejected`，以及“需要修改”的评审进入待处理计数。

- [ ] **Step 2: 运行评审测试并确认接口缺失失败**

Run: `PYTHONPATH=services/api .venv/bin/python -m unittest services/api/test_workbench_v2_reviews.py -v`
Expected: FAIL。

- [ ] **Step 3: 实现评审、阶段门和可理解阻塞原因**

实现 spec 19.1 的生成二维、锁定候选、Rodin、内部评审、内部提案和客户提案门禁；阻塞响应包含 `missing/reason/action`。

- [ ] **Step 4: 写失败测试，固定两类提案和资产清单**

内部提案允许未核验文化但显示 `to_verify`；客户提案遇到未核验 fact 返回 409；提案清单包含已选二维、关联 GLB、Brief、文化来源、版本历史，排除失败/归档资产。

- [ ] **Step 5: 实现提案 audience 和 manifest API**

端点：`GET /proposal?audience=internal|customer`、`GET /manifest`、`POST /reviews`、`PATCH /reviews/{id}`。

- [ ] **Step 6: 运行 Task 3 测试与后端全套**

Run: `PYTHONPATH=services/api .venv/bin/python -m unittest services/api/test_workbench_v2_reviews.py -v && PYTHONPATH=services/api .venv/bin/python -m unittest discover -s services/api -p 'test_*.py' -v`
Expected: PASS。

- [ ] **Step 7: 提交 Task 3**

```bash
git add services/api/app/store.py services/api/app/schemas.py services/api/app/main.py services/api/test_workbench_v2_reviews.py
git commit -m "feat: add review gates and proposal audiences"
```

### Task 4: 前端数据层、全局导航和项目首页

**Files:**
- Modify: `src/types/workbench.ts`
- Modify: `src/lib/api.ts`
- Modify: `src/App.tsx`
- Create: `src/components/AppShell.tsx`
- Create: `src/components/ProjectDashboard.tsx`
- Create: `src/components/ProjectDashboard.test.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: Task 1–3 REST API。
- Produces: `AppView = 'projects'|'workbench'|'works'|'assets'|'reviews'|'proposal'`、`ProjectSummary/DesignDirection/AssetRecord/ReviewRecord` 类型、以当前 `projectId` 为显式参数的 API 函数、项目首页导航。

- [ ] **Step 1: 写失败组件测试，固定项目首页和项目切换**

断言首页显示三个 Demo、阶段/版本/待处理数据；点击项目进入工作台；顶部六个导航可键盘操作；项目切换后 `getWorkspace` 使用选中的项目 ID。

- [ ] **Step 2: 运行测试并确认组件/类型缺失失败**

Run: `npm test -- --run src/components/ProjectDashboard.test.tsx src/App.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 扩展类型和 API，禁止新调用依赖默认项目 ID**

保留 `DEFAULT_PROJECT_ID` 仅用于首次加载兼容；所有 mutation 从 App 当前项目显式传入 projectId。

- [ ] **Step 4: 实现 AppShell 和项目首页**

项目卡片显示名称、类型、阶段、最新版本、二维/三维数量、待处理和最近修改；空项目显示开始入口。

- [ ] **Step 5: 运行 Task 4 测试、前端全套和构建**

Run: `npm test -- --run && npm run build`
Expected: PASS，TypeScript 无错误。

- [ ] **Step 6: 提交 Task 4**

```bash
git add src/types/workbench.ts src/lib/api.ts src/App.tsx src/components/AppShell.tsx src/components/ProjectDashboard.tsx src/components/ProjectDashboard.test.tsx src/App.test.tsx
git commit -m "feat: add project dashboard and app navigation"
```

### Task 5: 2.0 三栏工作台、方向和画布模式

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/ConversationPanel.tsx`
- Modify: `src/components/DesignCanvas.tsx`
- Modify: `src/components/DesignCanvas.test.tsx`
- Modify: `src/components/DesignTruthPanel.tsx`
- Modify: `src/components/StageRail.tsx`
- Modify: `src/components/VersionTimeline.tsx`
- Create: `src/components/DirectionSwitcher.tsx`
- Create: `src/components/TaskCenter.tsx`
- Create: `src/components/VersionComparison.tsx`
- Create: `src/components/WorkbenchView.test.tsx`

**Interfaces:**
- Consumes: Task 4 当前项目、directions、versions、jobs 和显式 projectId API。
- Produces: 方向切换、`image/model/compare/relations` 画布模式、任务中心、确认卡、可收起左右栏和版本胶片条。

- [ ] **Step 1: 写失败测试，固定方向切换与画布四模式**

断言切换方向只显示该方向版本；没有三维时显示原因和返回二维操作；对比模式选择两个版本并展示 changes/preserve；关系模式显示来源节点。

- [ ] **Step 2: 运行测试并确认新交互缺失失败**

Run: `npm test -- --run src/components/WorkbenchView.test.tsx src/components/DesignCanvas.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 实现工作台结构和任务中心**

保持现有生成轮询，任务中心关闭后任务继续；同类任务进行中时禁用重复操作并显示原因。

- [ ] **Step 4: 写失败测试，固定当前项目 ID 和生成确认卡**

测试对话、图片、候选、Rodin、重试请求都带当前项目 ID；确认卡显示变化、保留、约束和取消/确认动作。

- [ ] **Step 5: 实现确认卡与显式项目上下文**

`GENERATE` 只有在确认卡确认后提交；明确文本“确认修改并生成新版”可直接视为确认，保持已有快捷路径。

- [ ] **Step 6: 运行 Task 5 测试、前端全套和构建**

Run: `npm test -- --run && npm run build`
Expected: PASS。

- [ ] **Step 7: 提交 Task 5**

```bash
git add src/App.tsx src/components/ConversationPanel.tsx src/components/DesignCanvas.tsx src/components/DesignCanvas.test.tsx src/components/DesignTruthPanel.tsx src/components/StageRail.tsx src/components/VersionTimeline.tsx src/components/DirectionSwitcher.tsx src/components/TaskCenter.tsx src/components/VersionComparison.tsx src/components/WorkbenchView.test.tsx
git commit -m "feat: upgrade connected cultural design workbench"
```

### Task 6: 作品库、资产详情和关系视图

**Files:**
- Create: `src/components/AssetLibrary.tsx`
- Create: `src/components/AssetLibrary.test.tsx`
- Create: `src/components/AssetDetailDrawer.tsx`
- Create: `src/components/AssetRelationGraph.tsx`
- Modify: `src/App.tsx`
- Modify: `src/lib/api.ts`
- Modify: `src/types/workbench.ts`

**Interfaces:**
- Consumes: Task 2 资产 API、Task 4 AppView。
- Produces: 方案视图/资产视图、搜索筛选、资产详情、关系、候选/提案/下载/归档操作。

- [ ] **Step 1: 写失败测试，固定作品库筛选和卡片信息**

覆盖类型、状态、方向、文化、材质、搜索筛选；卡片显示父版本、关联三维、状态和文化标签。

- [ ] **Step 2: 运行测试并确认组件缺失失败**

Run: `npm test -- --run src/components/AssetLibrary.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 实现方案/资产双视图和详情抽屉**

快捷操作仅保留设为候选、加入提案、下载和更多；归档动作需要二次确认且不删除本地文件。

- [ ] **Step 4: 写失败测试，固定关系追溯和归档保护**

断言三维详情可追溯二维、版本、文化和任务；归档/失败资产不显示候选操作；批量跨项目不能设候选。

- [ ] **Step 5: 实现关系图和资产操作**

关系图使用可访问的 DOM 节点和连线，不引入图编辑器依赖。

- [ ] **Step 6: 运行 Task 6 测试、全套和构建**

Run: `npm test -- --run && npm run build`
Expected: PASS。

- [ ] **Step 7: 提交 Task 6**

```bash
git add src/App.tsx src/lib/api.ts src/types/workbench.ts src/components/AssetLibrary.tsx src/components/AssetLibrary.test.tsx src/components/AssetDetailDrawer.tsx src/components/AssetRelationGraph.tsx
git commit -m "feat: add cultural design asset library"
```

### Task 7: 评审中心、提案构建和下载清单

**Files:**
- Create: `src/components/ReviewCenter.tsx`
- Create: `src/components/ReviewCenter.test.tsx`
- Modify: `src/components/ProposalView.tsx`
- Create: `src/components/ProposalView.test.tsx`
- Create: `src/components/DownloadPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/lib/api.ts`

**Interfaces:**
- Consumes: Task 3 reviews/proposal/manifest API、Task 6 AssetRecord。
- Produces: 单人内部评审、内部/客户提案切换、文化核验阻塞提示、资产包下载面板。

- [ ] **Step 1: 写失败测试，固定评审状态和意见绑定**

测试版本/资产/区域绑定、通过/修改/备选/淘汰、待处理计数和从意见返回工作台。

- [ ] **Step 2: 运行评审测试并确认组件缺失失败**

Run: `npm test -- --run src/components/ReviewCenter.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 实现 ReviewCenter 和评审 API**

内部评审不模拟账号；操作后刷新项目摘要、工作区和资产状态。

- [ ] **Step 4: 写失败测试，固定提案 audience 与阻塞提示**

内部提案显示待核验标签；客户提案 409 时显示缺失项、原因和“去核验文化资料”；下载面板列出 PNG、GLB、Brief、文化、版本和 manifest。

- [ ] **Step 5: 实现 ProposalView、DownloadPanel 和打印样式**

P0 使用浏览器打印保存 PDF；下载清单逐项指向本地 API，不伪造不存在的压缩包。

- [ ] **Step 6: 运行 Task 7 测试、全套和构建**

Run: `npm test -- --run && npm run build`
Expected: PASS。

- [ ] **Step 7: 提交 Task 7**

```bash
git add src/App.tsx src/lib/api.ts src/components/ReviewCenter.tsx src/components/ReviewCenter.test.tsx src/components/ProposalView.tsx src/components/ProposalView.test.tsx src/components/DownloadPanel.tsx
git commit -m "feat: add review and proposal delivery workflow"
```

### Task 8: UI 视觉系统、导览、响应式和无障碍

**Files:**
- Modify: `src/App.css`
- Modify: `src/index.css`
- Create: `src/components/ProductTour.tsx`
- Create: `src/components/ProductTour.test.tsx`
- Modify: `src/components/AppShell.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: Tasks 4–7 页面和状态。
- Produces: 1440×900 稳定布局、1280×720 最低提示、收起栏、首次导览、统一状态标签、键盘/焦点和空状态。

- [ ] **Step 1: 写失败测试，固定导览和小视口提示**

断言导览五步可跳过/重开且不创建任务；模拟 1200×700 显示扩大窗口提示；状态标签包含文字；导航和抽屉可用 Escape 关闭。

- [ ] **Step 2: 运行测试并确认导览/提示缺失失败**

Run: `npm test -- --run src/components/ProductTour.test.tsx src/App.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 实现设计 token、页面布局、导览和响应式规则**

遵循 spec 11.7–11.13；主画布不被浮层操作遮挡，右栏在窄屏先变抽屉，左栏随后收起。

- [ ] **Step 4: 运行前端全套、lint 和构建**

Run: `npm test -- --run && npm run lint && npm run build`
Expected: PASS；允许已有 Three.js chunk size warning，不允许 TypeScript/oxlint 错误。

- [ ] **Step 5: 提交 Task 8**

```bash
git add src/App.css src/index.css src/App.test.tsx src/components/AppShell.tsx src/components/ProductTour.tsx src/components/ProductTour.test.tsx
git commit -m "feat: polish workbench navigation and responsive ui"
```

### Task 9: 完整运行链路、真实浏览器验收和文档

**Files:**
- Create: `docs/verification/2026-10-31-suzuo-workbench-2.0.md`
- Modify: `README.md`
- Modify: `README_BACKEND.md`
- Modify: `docs/superpowers/plans/2026-10-31-suzuo-creative-workbench-2.0-implementation.md`

**Interfaces:**
- Consumes: Tasks 1–8 完整系统。
- Produces: 可复现启动说明、需求覆盖表、真实 Chrome 用户旅程证据和最终验收记录。

- [ ] **Step 1: 运行全部自动化验证**

Run: `npm test -- --run && npm run lint && npm run build && PYTHONPATH=services/api .venv/bin/python -m unittest discover -s services/api -p 'test_*.py' -v`
Expected: 全部 PASS，构建 exit 0。

- [ ] **Step 2: 启动真实前后端并验证健康状态**

前端使用 `127.0.0.1:5173`，后端使用 `127.0.0.1:8000`；检查 `/api/health`、项目集合和主页面均返回 200。

- [ ] **Step 3: 使用本地 Chrome 执行完整用户旅程**

覆盖：项目首页 → 打开漏景香插 → 对话生成二维（若外部接口不可用则使用已存在真实资产，但必须明确记录）→ 锁定候选 → 生成/查看贴图三维 → 作品库追溯 → 评审 → 内部提案 → 下载清单；再打开另外两个 Demo 检查隔离。

- [ ] **Step 4: 验证布局和恢复路径**

在 1440×900、1280×720 和 1200×700 检查无溢出、提示正确；模拟一次后端离线和失败任务，验证重新连接/重试入口。

- [ ] **Step 5: 写验证文档和需求覆盖表**

逐条映射 spec P0、验收标准、测试命令、浏览器证据和任何外部依赖限制，不用窄测试支持广泛完成声明。

- [ ] **Step 6: 提交 Task 9**

```bash
git add README.md README_BACKEND.md docs/verification/2026-10-31-suzuo-workbench-2.0.md docs/superpowers/plans/2026-10-31-suzuo-creative-workbench-2.0-implementation.md
git commit -m "docs: verify suzuo creative workbench 2.0"
```


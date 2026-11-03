# 完整 mock 演示部署

## 获取与启动

```bash
git clone --branch mock --single-branch https://github.com/WhiteSailLabs/suzuo-creative-workbench.git
cd suzuo-creative-workbench
npm ci
python3 -m venv .venv
.venv/bin/pip install -r services/api/requirements.txt
PYTHONPATH=services/api .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

另开终端，进入同一目录：

```bash
npm run dev -- --host 127.0.0.1
```

使用 Node.js 22.12+、Python 3.10+。Windows 使用 `.venv\Scripts\python`，并以 PowerShell `$env:PYTHONPATH="services/api"` 设置模块路径。
打开 http://127.0.0.1:5173 。不需要 .env、数据库、Redis、Hyper3D 登录或任何 API Key。安装依赖需要网络；安装完毕后，三个预置项目展示不依赖外部服务。

## 演示步骤

选择香插、丝绸盒或昆曲灯项目。点击“试试这样说”再发送，重复三轮，逐步展示文化原型、设计灵感和作品。完成后切换“二维概念 / 三维模型”，可旋转查看模型；对话框继续保留，可追加讨论。

离线结果是已有保存作品，不会根据新文字实时生成。追加对话仅保存在当前页面，刷新会重新开始；服务端修改也会在后端重启时恢复快照。其他新建项目的在线生成功能不属于本 mock 演示保证范围。

## 文件与部署

`mock-data/` 包含三个项目快照、资源清单及图片/GLB 模型，随 Git 普通文件一起克隆，无需 Git LFS。请完整部署此目录，不要只复制前端。服务启动时将快照路径解析为当前机器的路径。

前端默认通过同源 `/api` 访问后端；开发服务器已配置转发。服务器部署运行 `npm run build`，静态服务器提供 `dist/`，将 `/api/*` 反向代理到 `http://127.0.0.1:8000`（保留完整路径），SPA 未匹配路径回退到 `index.html`。后端工作目录必须是仓库根目录，使用上述 PYTHONPATH 命令。可用 `npm run preview -- --host 127.0.0.1` 在本机检查构建结果。

本 demo 没有认证，不应裸露到公网；若远程展示，应在反向代理配置访问控制。不要在该分支配置生产凭证。

## 验证与排障

```bash
npm test -- --run
npm run build
PYTHONPATH=services/api .venv/bin/python scripts/verify-mock.py
```

空画布：确认三轮对话已完成、后端正在运行且 mock-data 完整。资源 404：检查工作目录和快照清单。三维模型约 25 MB，首次加载需要时间，浏览器必须支持 WebGL。浏览器验收应覆盖三个项目的三轮对话、二维图片、三维切换、追加对话和重新演示。

### 本次验证记录

提交归档导出到新目录后，三个项目全部资源完整性检查通过；演示专项 `npm test -- --run src/components/GuidedOfflineWorkbench.test.tsx` 三项通过，生产构建通过。全量旧测试目前 34 项通过、43 项失败（旧工作台界面预期、旧绝对接口地址及测试环境 ResizeObserver 等），不能视为全量通过。浏览器完整验收尚未完成，部署后请按上述步骤实际检查。

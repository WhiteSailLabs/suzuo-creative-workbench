# mock 分支：完整离线演示

请先阅读 [MOCK_DEPLOY.md](MOCK_DEPLOY.md)。其他 agent 请阅读 [AGENTS.md](AGENTS.md)。本分支已包含三个项目的图片、模型和数据，不需要在线生成配置。

# 苏作创意台

一个语音优先的苏州文化创意三维概念工作台。首个 Demo 以“苏州园林 × 桌面香插”为主线，把自然语言创意转成可追溯 Brief、文化转译、二维概念、Rodin 三维模型、版本评审和客户提案。

## 产品闭环

```text
语音或文字表达
  → AI 复述与结构化 Brief
  → 文化事实 / 设计转译 / 待验证分层
  → 2D 概念图
  → Rodin GLB 概念模型
  → 语音修改与 V1/V2 对比
  → 锁定候选版本
  → 客户安全提案
```

三维结果用于概念沟通，不是生产 CAD。尺寸、结构、材料和工艺仍需工程验证。

## 本地启动

完整的中文启动、离线演示和故障排查步骤见 [项目启动文档](STARTUP.md)。

需要 Node.js、Python 3.9+，以及已完成 OAuth 的 Hyper3D CLI。

```bash
cd /Users/Admin/Documents/ChatGPT/huichuang/sukesong-runtime-try3
npm install
python3 -m venv .venv
.venv/bin/pip install -r services/api/requirements.txt
```

终端 1：

```bash
PYTHONPATH=services/api .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

终端 2：

```bash
npm run dev -- --host 127.0.0.1
```

打开 <http://127.0.0.1:5173/>；API 文档在 <http://127.0.0.1:8000/docs>。

## 安全配置

- 浏览器永远不会收到 Provider API Key。
- 图片 Key 通过 macOS Keychain/环境变量注入，不写入仓库或日志。
- 文本模型和图片模型分开：`TEXT_MODEL=gpt-5.6-sol`，`IMAGE_MODEL=gpt-image-2`。
- Rodin 使用 Hyper3D CLI OAuth 会话，不在项目内保存 Token。
- 本地产物写入 `outputs/images/` 与 `outputs/rodin/`，两者均被 Git 忽略。

详见 [图片集成](docs/image-generation-integration.md)、[Rodin 集成](docs/rodin-integration.md) 和 [后端说明](README_BACKEND.md)。

## 验证

```bash
PYTHONPATH=services/api .venv/bin/python -m unittest discover -s services/api -p 'test_*.py' -v
npm test -- --run
npm run build
npm run lint
```

当前 MVP 是单用户、本地、简体中文、桌面 Chrome。多人协作、供应链、精确结构和量产工艺不在首版范围。

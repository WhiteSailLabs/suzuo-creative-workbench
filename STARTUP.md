# 苏作创意台启动文档

这份文档用于本地开发和离线演示。项目由 Vite 前端和 FastAPI 后端组成。

## 1. 环境要求

- Node.js 18 或更高版本
- Python 3.9 或更高版本
- macOS、Windows 或 Linux

## 2. 安装依赖

在项目根目录执行：

```bash
npm install
python3 -m venv .venv
.venv/bin/pip install -r services/api/requirements.txt
```

Windows PowerShell 将 `.venv/bin/` 替换为 `.venv/Scripts/`。

## 3. 配置环境变量

复制示例配置：

```bash
cp .env.example .env
```

离线演示不需要填写 API Key。项目已经包含三个苏州文创项目的本地图片、灵感概念图和已保存作品资源。

需要在线生成二维图片时，再配置图片服务：

```bash
IMAGE_API_BASE_URL=https://你的服务地址/v1
IMAGE_API_KEY=你的密钥
IMAGE_MODEL=你的图片模型名
```

不要把真实密钥提交到 GitHub。`.env` 已被 Git 忽略。

## 4. 启动后端

打开第一个终端，在项目根目录执行：

```bash
PYTHONPATH=services/api .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

看到 `Uvicorn running on http://127.0.0.1:8000` 即表示后端启动成功。

后端接口文档：<http://127.0.0.1:8000/docs>

## 5. 启动前端

打开第二个终端，在项目根目录执行：

```bash
npm run dev -- --host 127.0.0.1
```

打开：<http://127.0.0.1:5173/>

## 6. 离线演示

1. 进入“项目”页面。
2. 选择三个项目中的任意一个：漏景香插、丝绸收纳盒或水袖桌面灯。
3. 进入“工作台”。
4. 右侧查看四段文化转译链路：

   ```text
   文化原型 → 文化特征 → 灵感概念 → 文创结果
   ```

5. 点击“查看文化转译”，查看本地保存的文化图片、特征标签、灵感概念图和作品结果。
6. 切换中间画布的“二维概念”和“三维模型”，查看已经保存的演示作品。

离线演示不依赖外部图片搜索和现场生成服务。素材位于 `public/assets/suzhou/`，生成产物位于 `outputs/`，后者默认不提交到 Git。

## 7. 验证安装

```bash
npm run build
npm test -- --run
PYTHONPATH=services/api .venv/bin/python -m unittest discover -s services/api -p 'test_*.py' -q
```

## 8. 常见问题

### 页面打不开

确认两个终端都在运行，并检查前端地址是否为 `5173`、后端地址是否为 `8000`。

### 后端提示端口被占用

关闭已有的 Uvicorn 进程，或改用其他端口，并同步修改前端 API 地址配置。

### 看不到离线图片

确认项目根目录下存在 `public/assets/suzhou/real/` 和 `public/assets/suzhou/inspiration-*.svg`，然后用 `Command + Shift + R` 强制刷新浏览器。

### 想要在线生成

在线生成需要配置图片服务和相应密钥；离线展示不需要这些配置。

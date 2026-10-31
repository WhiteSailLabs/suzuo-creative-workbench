# 苏作创意台 MVP 验收记录

日期：2026-10-30（Asia/Shanghai）  
环境：本地 Google Chrome、Vite `127.0.0.1:5173`、FastAPI `127.0.0.1:8000`

## 结论

二维概念图到 Rodin 三维概念模型的真实链路已在本地 Chrome 验证。图片服务恢复后已生成新的 1536 × 1024 PNG；本轮将该图片导入工作台并以默认 Image-to-3D 模式提交，后端冻结参考图快照、下载并校验 GLB，前端显示可审计的图片来源。当前只证明“确实以该版本二维图作为三维输入”，尚未实现基于固定相机的轮廓重投影评分，因此界面诚实显示“待一致性检查”。

## 真实媒体证据

- 已有真实 2D 概念图：`outputs/images/image-1793366654985-1.png`
  - PNG，1536 × 1024，RGB，非空且可解码。
  - 通过 `POST /api/workbench/projects/prj_suzhou_incense/image-imports` 导入为 V1；导入成果明确记录 `source=imported`。
- 本轮真实 Rodin 任务：`job_rodin_1f2a6b010b`
  - generation ID：`3cbcdd4a-45ce-4565-9cc2-5b2e8dcd6867`
  - GLB：`outputs/rodin/3cbcdd4a-45ce-4565-9cc2-5b2e8dcd6867-base_basic_pbr.glb`
  - 大小：22,246,560 字节。
  - `file` 识别为 glTF binary model version 2；前四字节为 `67 6c 54 46`（`glTF`）。
  - Three.js 查看器已在本地 Chrome 中实际渲染模型，并显示“概念模型，不是生产 CAD”。
- 新增真实 Image-to-3D 验证图：`outputs/images/image-1793382755229-1.png`
  - PNG，1536 × 1024，1,812,774 字节；由已恢复的真实图片服务生成。
  - 导入任务：`job_image_6a5bbed0c7`；不可变版本：`version_212ea173c4`；图片工件：`artifact_image_7a9e702ac0`。
- 本轮真实 Image-to-3D 任务：`job_rodin_525bee3608`
  - 提交状态明确记录 `input_mode=image`、空文字 prompt、`reference_artifact_ids=[artifact_image_7a9e702ac0]`，参考快照在任务创建时冻结。
  - generation ID：`98e81c29-eb34-40ea-af09-f2935bc0399a`
  - GLB：`outputs/rodin/98e81c29-eb34-40ea-af09-f2935bc0399a-base_basic_pbr.glb`
  - 大小：22,065,588 字节；`file` 识别为 glTF binary model version 2；前四字节为 `67 6c 54 46`（`glTF`）。
  - 本地 Google Chrome 中存在一个 Three.js canvas、无 `.viewer-error`，模型实际渲染；页面显示“由二维图生成 / 1 张参考图 / 待一致性检查”。
  - Chrome 验收截图：`docs/verification/image-to-3d-chrome-proof.jpg`。

## Chrome 用户旅程

1. 输入“我想做一个年轻人用的苏州园林香插，不要太传统”。
2. AI 复述为现代、克制、年轻用户、避免仿古与符号堆砌；右侧 Brief 在提交后同步刷新。
3. 点击“生成第一版二维概念”，真实请求到指定图片服务；界面展示 530 失败及“重试”，上下文未丢失。
4. 将已验证的真实 PNG 作为 V1 导入，浏览器从 FastAPI 资产地址正确显示，而非错误请求 Vite 端口。
5. 在 3D 页签点击“用当前版本生成 3D”；按精确任务 ID 轮询直至完成，浏览器加载真实 GLB。
6. 输入“保留漏景，镂空简单一点，底座更稳”。系统产生：
   - `changes.hollow_structure = simplified`
   - `preserve = [leak_view]`
   - `constraints = [stable_base]`
7. 以 V1 为父版本导入恢复图形成不可变 V2；版本栏显示 V1/V2、镂空简化、保留漏景。
8. 锁定 V2 为候选版本，打开客户安全提案；提案只显示设计转译和风险声明，不把 AI 想象伪装成文化事实。

## G1–G8

| Gate | 状态 | 证据 |
|---|---|---|
| G1 意图成立 | 通过 | 文字输入、AI 复述、Brief 修订和原始 turn 均可追溯；Chrome 已验证提交后即时刷新。 |
| G2 文化成立 | 通过 | UI 与 API 区分文化事实、设计转译、AI 生成和待核验；客户提案只投影安全内容。 |
| G3 概念成立 | 通过（生成后导入） | 图片服务恢复后生成新的真实 PNG，并通过工作台导入接口形成不可变版本；尚未验证从工作台按钮直接生图。 |
| G4 三维成立 | 通过 | 默认路径已改为 Image-to-3D；任务快照、GLB 文件头、大小、后端资产服务、Chrome Three.js 渲染和来源标签均验证。 |
| G5 修改成立 | 通过（恢复路径） | 一句修改形成 ChangePatch 和父子 V2；视觉内容通过导入恢复形成，未声称为模型重绘。 |
| G6 决策成立 | 通过 | V1/V2 差异可见，V2 可明确锁定为候选。 |
| G7 交付成立 | 通过 | HTML/打印提案在 Chrome 打开，包含文化转译、版本说明和非 CAD 风险声明。 |
| G8 恢复成立 | 通过 | 真实 530 失败可见且可重试；导入恢复入口与图片/Rodin 重试单元测试通过。 |

## 自动验证

```text
PYTHONPATH=services/api .venv/bin/python -m unittest discover -s services/api -p 'test_*.py' -v
=> 45 tests, OK

npm test -- --run
=> 3 files / 8 tests, PASS

npm run build
=> PASS（Three.js 独立延迟加载 chunk 仍有体积提示）

npm run lint
=> exit 0（2 条 set-state-in-effect 非阻断提示）
```

运行时入口、文化工作台前端和构建产物中的服装域词扫描为干净；历史未接入启动路径的兼容模块与测试断言不作为默认运行面。

## 剩余风险与恢复条件

- 工作台按钮直接调用图片供应商仍需在一次稳定窗口中补充验收；本轮二维成果采用“真实服务生成后导入”，并未伪装成工作台生成。
- “由二维图生成”表示输入来源已锁定和可追溯，不等于三维几何已通过自动相似度评分；后续需增加固定相机渲染、轮廓/结构评分和人工确认闭环。
- 3D 为概念模型，不是 CAD、开模文件或工程验证结果。
- 当前 MemoryStore 在后端重启后清空；持久化数据库、多用户协作与生产资产治理不属于本轮 P0。

## PBR 贴图成品门禁（2026-10-31）

- 图生三维不再接受只有 shaded/白模版本的结果；后端必须找到并优先交付 Rodin 的 `_pbr.glb`，否则任务失败并提示没有可交付的 PBR 贴图模型。
- 查看器会枚举实际材质贴图，设置漫反射贴图为 sRGB 色彩空间，并采用较克制的环境光、双向棚拍光和 ACES 色调映射；检测不到任何贴图时进入错误态，不把白模展示为最终成果。
- 真实任务：`job_rodin_eb06cf02f5`；generation ID：`2d9fa760-bb9f-4417-8eaa-ce155bd3ff62`。
- 输出：`outputs/rodin/2d9fa760-bb9f-4417-8eaa-ce155bd3ff62-base_basic_pbr.glb`，21,813,096 字节，glTF 2 binary。
- GLB 内含 1 个材质、3 张嵌入贴图：`texture_diffuse`、`texture_normal`、`texture_metallic-texture_roughness`。
- 本地 Google Chrome 显示“PBR 材质已加载 · 3 张贴图”，存在 WebGL canvas 且无查看器错误；验收截图：`docs/verification/pbr-textured-model-chrome-proof.jpg`。

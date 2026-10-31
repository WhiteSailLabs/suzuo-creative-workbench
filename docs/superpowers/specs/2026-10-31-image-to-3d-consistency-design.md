# 二维到三维一致性设计

## 目的

把当前默认的 Rodin Text-to-3D 改成由已确认二维版本驱动的 Image-to-3D。系统必须能够证明某个 GLB 使用了哪些二维参考图、属于哪个不可变设计版本，并在参考不足或版本过期时拒绝把结果伪装成当前方案。

## 用户承诺

产品承诺“视觉轮廓、关键结构和文化语言可验证一致”，不承诺自动得到生产 CAD。尺寸、壁厚、重心、装配与工艺仍需工程验证。

## 默认流程

```text
已确认二维 DesignVersion
  → 收集同版本 1–5 张 reference image
  → 固化 DesignIdentityContract 与 reference snapshot
  → Rodin Image-to-3D
  → GLB 附着回原 DesignVersion
  → 显示输入来源与一致性状态
  → 人工对照；后续接入自动重投影评分
```

## 设计身份合同

每个三维任务在提交时固化：

- `version_id`、`brief_revision` 与 `source_turn_id`
- `reference_artifact_ids`，按 front、left、right、back、top、unknown 排序，最多 5 张
- `input_mode=image`；只有用户显式请求降级时才能为 `text`
- `must_preserve`：版本中的 preserved fields 和关键结构约束
- `constraints`：稳定底座、香座结构等
- `reference_snapshot`：artifact id、路径、媒体类型、视角标签；后续修改 artifact 不影响已提交任务

## 失败与过期

- 默认 image 模式没有可用二维图片时，任务不创建并返回可理解错误。
- 图片路径必须位于图片输出目录且文件非空，最多使用 5 张。
- Rodin 失败不得给版本附着空模型。
- 任务完成时，如果当前版本或 Brief 已变化，结果保留但标记 `stale`。
- 文字降级模式必须在任务和模型 artifact 上显式显示，不能显示“由二维图生成”。

## 多视图策略

P0 接受单张 master image；数据模型从第一天支持最多 5 张。后续通过同版本 reference-view 上传/生成接口补充 front、side、back、top。多视图必须属于同一版本，不允许从其他版本静默拼接。

## 一致性验收

P0 显示可审计来源：输入模式、参考图数量、参考 artifact 和待人工检查状态。下一阶段在同一字段中增加浏览器重投影结果：轮廓、关键结构、比例位置、材质四项评分；总分达到 85 且无关键结构缺失才能自动判为通过。

## 非目标

- 不把概念 GLB 宣称为生产 CAD。
- 不在本阶段实现精确尺寸建模、拓扑手工修复或陶瓷工程验证。
- 不为多视图另建平行项目或第二套版本系统。

## 上游复用

- 主产品：`Almond117/sukesong` 当前 React/Vite + FastAPI 工作台与 DesignVersion/GenerationJob/Artifact 流程。
- 次能力：Hyper3D CLI，继续作为单一 Rodin adapter；CLI 原生支持 `generate --image <path>` 重复最多五次。
- 交接：DesignVersion image artifacts → Rodin adapter → GLB artifact 回写同一 DesignVersion。


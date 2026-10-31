from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any


STAGES = (
    "capturing",
    "grounding",
    "concepting",
    "prototyping",
    "reviewing",
    "presenting",
    "archived",
)

STAGE_STATUSES = ("active", "awaiting_confirmation", "blocked", "done")
# Keep `generated` as the compatible wire value for AI inference.
CULTURE_KIND_LABELS = {
    "fact": "文化事实",
    "translation": "设计转译",
    "designer_judgment": "设计师判断",
    "generated": "AI 推断",
    "to_verify": "待核验",
}
CULTURE_KINDS = tuple(CULTURE_KIND_LABELS)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def seed_cultural_entries() -> list[dict[str, Any]]:
    concepts = {
        "漏景": ("有遮有露的界面形成含蓄而有层次的观看关系。", "用局部开口、前后层次与香烟穿行路径表达空间含蓄感。"),
        "框景": ("通过门、窗或洞口限定观看范围，形成画面感。", "以产品开口框取内部香座和烟气，让使用过程成为画面。"),
        "借景": ("把园外或远处景物纳入当前空间的观看关系。", "让桌面环境、光影和使用者视角参与产品造型。"),
        "层次": ("通过空间前后、开合和虚实关系形成丰富体验。", "使用前后两层体块，而不是把纹样平贴在表面。"),
        "留白": ("以克制和空缺给观看与想象保留空间。", "减少装饰密度，让负空间、光线与烟气成为设计组成。"),
    }
    entries: list[dict[str, Any]] = []
    for index, (title, (fact, translation)) in enumerate(concepts.items(), start=1):
        entries.extend(
            [
                {
                    "id": f"culture_fact_{index}",
                    "kind": "fact",
                    "title": title,
                    "statement": fact,
                    "source_title": "苏州园林空间语言 · Demo 种子资料",
                    "source_url": "",
                    "note": "首版演示资料，进入正式提案前需补充权威出处。",
                    "verified": False,
                },
                {
                    "id": "culture_leak_view_translation" if title == "漏景" else f"culture_translation_{index}",
                    "kind": "translation",
                    "title": f"{title}的产品转译",
                    "statement": translation,
                    "source_title": "项目设计转译",
                    "source_url": "",
                    "note": "现代产品设计解释，不作为历史事实陈述。",
                    "verified": True,
                },
            ]
        )
    return entries


def create_seed_workspace() -> dict[str, Any]:
    """Create a fresh incense demo, preserving its original public ID."""
    created_at = _now_iso()
    project_id = "prj_suzhou_incense"
    direction_id = "direction_incense_leak_view"
    return {
        "active_direction_id": direction_id,
        "directions": [{
            "id": direction_id, "name": "漏景",
            "concept": "将园林漏景转译为香烟穿行的层次空间",
            "status": "draft",
            "culture_ids": [entry["id"] for entry in seed_cultural_entries()],
            "material_ids": [], "created_at": created_at, "updated_at": created_at,
        }],
        "assets": [], "reviews": [], "proposals": [], "proposal_asset_ids": [],
        "project": {
            "id": project_id,
            "name": "苏州园林 · 漏景香插",
            "active_direction_id": direction_id,
            "brief_revision": 0,
            "product_type": "桌面香插",
            "stage": "capturing",
            "stage_status": "active",
            "candidate_version_id": None,
            "created_at": created_at,
            "updated_at": created_at,
        },
        "brief_revisions": [
            {
                "revision": 0,
                "confirmed": {},
                "assumptions": {
                    "target_user": "年轻用户",
                    "use_scene": "书桌与居家空间",
                },
                "conflicts": [],
                "missing": ["material", "dimensions", "incense_structure"],
                "source_turn_id": None,
                "created_at": created_at,
            }
        ],
        "culture": seed_cultural_entries(),
        "turns": [],
        "versions": [],
        "jobs": [],
        "stage_gates": [
            {
                "stage": "capturing",
                "status": "active",
                "reason": "等待用户表达第一轮设计意图",
                "updated_at": created_at,
            }
        ],
    }


def create_seed_workspaces() -> dict[str, dict[str, Any]]:
    """Create three isolated demo projects with their own cultural context."""
    incense = create_seed_workspace()
    workspaces = {incense["project"]["id"]: incense}
    demos = [
        ("prj_suzhou_silk_box", "苏州丝绸 · 丝绸收纳盒", "桌面收纳盒", "丝绸",
         "将丝绸的经纬秩序转译为收纳盒表面与分格关系", "丝绸包覆与木质内胆", "分类收纳桌面小物"),
        ("prj_kunqu_lamp", "昆曲水袖 · 水袖桌面灯", "桌面灯", "水袖",
         "将水袖的流动意象转译为柔和曲面与光影层次", "半透明灯罩与稳定底座", "桌面氛围照明"),
    ]
    for project_id, name, product_type, cue, concept, material, function in demos:
        workspace = create_seed_workspace()
        now = workspace["project"]["created_at"]
        direction_id = f"direction_{project_id}"
        workspace["project"].update(
            id=project_id, name=name, product_type=product_type,
            active_direction_id=direction_id,
        )
        workspace["active_direction_id"] = direction_id
        workspace["culture"] = [
            {"id": f"{project_id}_culture_reference", "kind": "to_verify", "title": cue,
             "statement": f"{cue}文化线索，正式使用前需补充权威资料核验。",
             "source_title": "Demo 待核验线索", "source_url": "", "verified": False},
            {"id": f"{project_id}_culture_translation", "kind": "translation",
             "title": f"{cue}的产品转译", "statement": concept,
             "source_title": "项目设计转译", "source_url": "", "verified": True},
        ]
        workspace["directions"] = [{
            "id": direction_id, "name": cue, "concept": concept, "status": "draft",
            "culture_ids": [entry["id"] for entry in workspace["culture"]],
            "material_ids": [], "created_at": now, "updated_at": now,
        }]
        workspace["brief_revisions"][0].update(
            confirmed={"product_type": product_type, "culture_cues": cue, "function": function},
            assumptions={"material": material, "use_scene": "书桌与居家空间"},
            missing=["dimensions", "structure"],
        )
        workspaces[project_id] = workspace
    return workspaces


def append_brief_revision(
    workspace: dict[str, Any],
    *,
    confirmed: dict[str, Any] | None = None,
    assumptions: dict[str, Any] | None = None,
    conflicts: list[dict[str, Any]] | None = None,
    missing: list[str] | None = None,
    source_turn_id: str | None = None,
) -> dict[str, Any]:
    """Append a revision without mutating earlier Brief snapshots."""
    previous = workspace["brief_revisions"][-1]
    current = deepcopy(previous)
    current["revision"] = int(previous["revision"]) + 1
    current["confirmed"].update(confirmed or {})
    current["assumptions"].update(assumptions or {})
    current["conflicts"] = deepcopy(conflicts if conflicts is not None else previous["conflicts"])
    current["missing"] = list(missing if missing is not None else previous["missing"])
    current["source_turn_id"] = source_turn_id
    current["created_at"] = _now_iso()
    workspace["brief_revisions"].append(current)
    workspace["project"]["brief_revision"] = current["revision"]
    workspace["project"]["updated_at"] = current["created_at"]
    return current


def transition_stage(
    workspace: dict[str, Any],
    stage: str,
    *,
    status: str = "active",
    reason: str = "",
) -> dict[str, Any]:
    if stage not in STAGES:
        raise ValueError(f"未知项目阶段：{stage}")
    if status not in STAGE_STATUSES:
        raise ValueError(f"未知阶段状态：{status}")
    gate = {
        "stage": stage,
        "status": status,
        "reason": reason,
        "updated_at": _now_iso(),
    }
    workspace["project"]["stage"] = stage
    workspace["project"]["stage_status"] = status
    workspace["project"]["updated_at"] = gate["updated_at"]
    workspace["stage_gates"].append(gate)
    return gate

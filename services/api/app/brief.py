from __future__ import annotations

from typing import Any

BRIEF_FIELDS = (
    "garment_type", "target_user", "style", "color", "fit", "length",
    "collar", "sleeve", "fabric_reference", "pattern", "negative_constraints",
)


def empty_brief() -> dict[str, Any]:
    return {
        "confirmed_constraints": {},
        "tentative_preferences": {},
        "conflicts": [],
        "revision": 0,
    }


def apply_patch(brief: dict[str, Any], patch: dict[str, Any], *, source: dict[str, Any] | None = None) -> dict[str, Any]:
    """Apply a constrained fashion brief patch without losing provenance."""
    result = {
        **empty_brief(),
        **brief,
        "confirmed_constraints": {**brief.get("confirmed_constraints", {})},
        "tentative_preferences": {**brief.get("tentative_preferences", {})},
        "conflicts": list(brief.get("conflicts", [])),
    }
    confirmed = result["confirmed_constraints"]
    tentative = result["tentative_preferences"]
    for field, value in patch.get("confirmed", {}).items():
        if field not in BRIEF_FIELDS:
            raise ValueError(f"未知服装 Brief 字段：{field}")
        confirmed[field] = {"value": value, "source": source or {}}
        tentative.pop(field, None)
    for field, value in patch.get("tentative", {}).items():
        if field not in BRIEF_FIELDS:
            raise ValueError(f"未知服装 Brief 字段：{field}")
        if field not in confirmed:
            tentative[field] = {"value": value, "source": source or {}}
    result["revision"] = int(brief.get("revision", 0)) + 1
    return result


def make_change_event(*, patch: dict[str, Any], preserve: list[str], source: dict[str, Any], base_revision: str) -> dict[str, Any]:
    return {
        "type": "MODIFY_ATTRIBUTE",
        "patch": patch,
        "preserve": preserve,
        "source": source,
        "base_revision": base_revision,
    }

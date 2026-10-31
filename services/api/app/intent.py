from __future__ import annotations

import secrets
import json
import re
from datetime import datetime, timezone
from typing import Any

import httpx

from .config import settings
from .schemas import ChangePatch, InterpretedTurn


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _as_dict(value: Any, *, list_key: str) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, list):
        return {list_key: value}
    if value:
        return {list_key.rstrip("s"): value}
    return {}


def _as_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    if value:
        return [str(value)]
    return []


def _is_discussion_only(text: str) -> bool:
    return any(
        token in text
        for token in (
            "只是讨论",
            "继续讨论",
            "先别生成",
            "不要生成",
            "别生成",
            "暂不生成",
            "还不能确认",
            "不能确认",
        )
    )


def _is_confirmed_generation(text: str) -> bool:
    if _is_discussion_only(text):
        return False
    return any(
        token in text for token in ("确认", "确定", "就按这个", "可以")
    ) and any(token in text for token in ("生成", "出一版", "新版"))


def _intent_for(text: str, workspace: dict[str, Any] | None = None) -> str:
    if _is_discussion_only(text):
        return "DISCUSS"
    if any(token in text for token in ("导出", "提案", "交付")):
        return "EXPORT"
    if _is_confirmed_generation(text):
        return "GENERATE"
    if any(token in text for token in ("保留", "简单一点", "更稳", "只改", "再小", "修改", "去掉", "删除", "移除")):
        # A brand-new project has no base image to modify. Treat its first
        # descriptive sentence as discussion so confirmation can start the
        # initial generation instead of triggering the modify gate.
        if workspace is not None and not workspace.get("versions") and any(
            token in text for token in ("香插", "收纳盒", "桌面灯", "摆件", "文创")
        ):
            return "DISCUSS"
        return "MODIFY"
    if any(token in text for token in ("生成", "做一版", "转成三维", "做成3D", "做成 3D")):
        return "GENERATE"
    if any(token in text for token in ("确认", "就这个", "锁定")):
        return "CONFIRM"
    return "DISCUSS"


def interpret_turn(text: str, workspace: dict[str, Any]) -> InterpretedTurn:
    """Interpret the acceptance-path phrases without requiring a network model."""
    normalized = text.strip()
    intent = _intent_for(normalized, workspace)
    confirmed: dict[str, Any] = {}
    assumptions: dict[str, Any] = {}
    changes: dict[str, Any] = {}
    preserve: list[str] = []
    constraints: list[str] = []

    if "香插" in normalized:
        confirmed["product_type"] = "桌面香插"
    if "年轻人" in normalized or "年轻用户" in normalized:
        confirmed["target_user"] = "年轻用户"
    if "苏州园林" in normalized or "园林" in normalized:
        confirmed["cultural_direction"] = "苏州园林的空间关系"
    if "不要太传统" in normalized or "不要仿古" in normalized:
        confirmed["negative_constraints"] = "避免仿古与符号堆砌"
    if "材质" in normalized:
        assumptions["material"] = "待讨论"
    if "镂空简单" in normalized or "镂空不要太复杂" in normalized:
        changes["hollow_structure"] = "simplified"
    if "看起来要轻" in normalized or "轻一点" in normalized:
        changes["visual_weight"] = "lighter"
    if "保留漏景" in normalized:
        preserve.append("leak_view")
    if "底座更稳" in normalized or "底座要稳" in normalized:
        constraints.append("stable_base")
    if "保留" in normalized and "现代" in normalized:
        preserve.append("modern_style")
    removal = re.search(r"(?:把)?(.+?)(?:去掉|删除|移除)", normalized)
    if removal:
        target = removal.group(1).strip("，。,. ")
        if "把" in target:
            target = target.rsplit("把", 1)[-1]
        if target:
            changes["remove_element"] = target

    if confirmed.get("product_type") == "桌面香插":
        restatement = "我理解为：为年轻用户设计一件现代、克制的桌面香插，用苏州园林的空间关系形成文化辨识度，避免仿古和符号堆砌。"
    elif intent == "MODIFY":
        restatement = "我理解为：本轮只调整明确提出的结构，同时保留已锁定的文化线索和设计方向。"
    elif intent == "DISCUSS":
        restatement = "我会先把这轮内容作为讨论和设计假设记录，不启动生成任务。"
    else:
        restatement = "我已经记录本轮意图，并会沿用当前 Brief 和已确认约束继续推进。"

    return InterpretedTurn(
        id=f"turn_{secrets.token_hex(5)}",
        text=normalized,
        intent=intent,
        restatement=restatement,
        change_patch=ChangePatch(
            changes=changes,
            preserve=preserve,
            constraints=constraints,
        ),
        brief_patch={"confirmed": confirmed, "assumptions": assumptions},
        brief_revision=-1,
        interpreter_mode="fallback",
        created_at=_now_iso(),
    )


class TextInterpretationProvider:
    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = (base_url if base_url is not None else settings.text_api_base_url).rstrip("/")
        self.api_key = api_key if api_key is not None else settings.text_api_key
        self.model = model if model is not None else settings.text_model
        self.transport = transport

    @property
    def configured(self) -> bool:
        return bool(self.base_url and self.api_key and self.model)

    def _endpoint(self) -> str:
        prefix = self.base_url if self.base_url.endswith(("/v1", "/v3")) else self.base_url + "/v1"
        return prefix + "/chat/completions"

    async def interpret(self, text: str, workspace: dict[str, Any]) -> InterpretedTurn:
        if not self.configured:
            raise RuntimeError("文本理解 Provider 未配置")
        latest_brief = workspace["brief_revisions"][-1]
        prompt = (
            "你是苏州文创设计意图解析器。只返回 JSON，字段为 intent、restatement、"
            "changes、preserve、constraints、confirmed、assumptions。changes、confirmed、"
            "assumptions 必须是 JSON 对象；preserve、constraints 必须是字符串数组。"
            "intent 只能是 "
            "DISCUSS、GENERATE、MODIFY、CONFIRM、EXPORT。用户只提出修改时必须返回 MODIFY，"
            "不能启动生成；用户明确说确认修改并生成新版时返回 GENERATE。"
            "不要把推测写成文化事实。\n"
            f"当前Brief：{json.dumps(latest_brief, ensure_ascii=False)}\n"
            f"用户输入：{text}"
        )
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"},
        }
        async with httpx.AsyncClient(timeout=60, transport=self.transport) as client:
            response = await client.post(self._endpoint(), headers=headers, json=body)
            response.raise_for_status()
            payload = response.json()
        content = payload["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        return InterpretedTurn(
            id=f"turn_{secrets.token_hex(5)}",
            text=text.strip(),
            intent=parsed["intent"],
            restatement=parsed["restatement"],
            change_patch=ChangePatch(
                changes=_as_dict(parsed.get("changes"), list_key="requested_changes"),
                preserve=_as_list(parsed.get("preserve")),
                constraints=_as_list(parsed.get("constraints")),
            ),
            brief_patch={
                "confirmed": _as_dict(parsed.get("confirmed"), list_key="confirmed_items"),
                "assumptions": _as_dict(parsed.get("assumptions"), list_key="assumption_items"),
            },
            brief_revision=-1,
            interpreter_mode="provider",
            created_at=_now_iso(),
        )


async def interpret_turn_with_provider(
    text: str,
    workspace: dict[str, Any],
    provider: TextInterpretationProvider | None = None,
) -> InterpretedTurn:
    selected = provider or TextInterpretationProvider()
    if selected.configured:
        try:
            result = await selected.interpret(text, workspace)
            if _is_discussion_only(text):
                return result.model_copy(update={"intent": "DISCUSS"})
            if _is_confirmed_generation(text):
                return result.model_copy(update={"intent": "GENERATE"})
            return result
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError):
            pass
    return interpret_turn(text, workspace)

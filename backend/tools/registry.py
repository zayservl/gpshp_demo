"""
Реестр инструментов.

Каждый инструмент — асинхронная функция, которая:
  - принимает ctx (контекст выполнения: сессия, данные)
  - возвращает dict c результатом

Инструменты намеренно simple: они имитируют работу внешних систем
с помощью DataStore и небольших задержек для «ощущения живого процесса».
"""
import asyncio
import random
from typing import Any, Awaitable, Callable, Dict, Optional

from loguru import logger


ToolFunc = Callable[["ToolContext"], Awaitable[Dict[str, Any]]]


class ToolContext:
    """Контекст вызова инструмента"""

    def __init__(
        self,
        workflow_id: str,
        employee_id: str,
        scenario_id: str,
        user_text: str,
        shared: Dict[str, Any],
        parameters: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.workflow_id = workflow_id
        self.employee_id = employee_id
        self.scenario_id = scenario_id
        self.user_text = user_text
        self.shared = shared  # накопленные данные между шагами
        self.parameters = parameters or {}


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: Dict[str, ToolFunc] = {}

    def register(self, name: str, func: ToolFunc) -> None:
        self._tools[name] = func

    def has(self, name: str) -> bool:
        return name in self._tools

    async def call(self, name: str, ctx: ToolContext) -> Dict[str, Any]:
        if name not in self._tools:
            logger.warning(f"Tool {name} не зарегистрирован, использую generic")
            return await self._tools["generic"](ctx)
        return await self._tools[name](ctx)


tool_registry = ToolRegistry()


# ---------------------------------------------------------------------------
# Базовые реализации инструментов. Все работают поверх DataStore.
# ---------------------------------------------------------------------------


async def _sleep_thinking(min_ms: int = 400, max_ms: int = 900) -> None:
    """Небольшая задержка для демонстрации процесса"""
    await asyncio.sleep(random.uniform(min_ms, max_ms) / 1000)


async def generic_tool(ctx: ToolContext) -> Dict[str, Any]:
    await _sleep_thinking()
    return {"status": "ok", "tool": "generic"}


tool_registry.register("generic", generic_tool)


# ----- Общие «загрузчики» -----

async def application_loader(ctx: ToolContext) -> Dict[str, Any]:
    from backend.data_access import datastore
    number = (
        ctx.parameters.get("application_number")
        or ctx.parameters.get("number")
        or ctx.shared.get("application_number")
    )
    if not number:
        return {"status": "error", "error": "Не указан номер заявки"}
    app = datastore.get_application(str(number))
    await _sleep_thinking()
    if not app:
        return {"status": "error", "error": f"Заявка №{number} не найдена"}
    ctx.shared["application"] = app
    return {
        "status": "ok",
        "loaded": f"Заявка №{app['number']}",
        "title": app["title"],
        "initiator": app["initiator"],
        "amount": app["amount"],
    }


async def contract_loader(ctx: ToolContext) -> Dict[str, Any]:
    from backend.data_access import datastore
    number = (
        ctx.parameters.get("contract_number")
        or ctx.parameters.get("number")
        or ctx.shared.get("contract_number", "Д-2026-001")
    )
    contract = datastore.get_contract(number)
    await _sleep_thinking()
    if not contract:
        return {"status": "error", "error": f"Договор {number} не найден"}
    ctx.shared["contract"] = contract
    return {
        "status": "ok",
        "loaded": f"Договор {contract['number']}",
        "contractor": contract["contractor"]["name"],
        "amount": contract["amount"],
    }


async def text_loader(ctx: ToolContext) -> Dict[str, Any]:
    from backend.data_access import datastore
    number = (
        ctx.parameters.get("letter_number")
        or ctx.parameters.get("contract_number")
        or ctx.parameters.get("number")
        or ctx.shared.get("letter_number")
        or "Исх-45-2024"
    )
    letter = datastore.get_letter(number)
    await _sleep_thinking()
    if letter:
        ctx.shared["letter"] = letter
        return {"status": "ok", "loaded": letter["subject"]}
    contract = datastore.get_contract(number)
    if contract:
        ctx.shared["contract"] = contract
        return {"status": "ok", "loaded": contract["title"]}
    return {"status": "ok", "loaded": "Исходный текст"}


async def kp_loader(ctx: ToolContext) -> Dict[str, Any]:
    from backend.data_access import datastore
    tender_id = ctx.parameters.get("tender_id")
    tender = datastore.get_tender(tender_id) if tender_id else datastore.get_tender()
    subset = ctx.parameters.get("proposals")
    if subset:
        proposals = datastore.get_proposals_subset(subset)
    elif tender and tender.get("id"):
        proposals = datastore.list_proposals(tender_id=tender.get("id"))
        if not proposals:
            proposals = datastore.list_proposals()
    else:
        proposals = datastore.list_proposals()
    await _sleep_thinking(600, 1100)
    ctx.shared["tender"] = tender
    ctx.shared["proposals"] = proposals
    return {
        "status": "ok",
        "tender": tender.get("number"),
        "proposals_loaded": [p["number"] for p in proposals]
    }


async def appeal_loader(ctx: ToolContext) -> Dict[str, Any]:
    from backend.data_access import datastore
    number = (
        ctx.parameters.get("appeal_number")
        or ctx.parameters.get("number")
        or ctx.shared.get("appeal_number")
        or "45-2026"
    )
    appeal = datastore.get_appeal(number)
    await _sleep_thinking()
    if not appeal:
        return {"status": "error", "error": f"Обращение {number} не найдено"}
    ctx.shared["appeal"] = appeal
    return {
        "status": "ok",
        "loaded": f"Обращение №{appeal['number']}",
        "from": appeal["from"]["name"],
        "category": appeal["category"]
    }


tool_registry.register("application_loader", application_loader)
tool_registry.register("contract_loader", contract_loader)
tool_registry.register("text_loader", text_loader)
tool_registry.register("kp_loader", kp_loader)
tool_registry.register("appeal_loader", appeal_loader)
tool_registry.register("supplier_lookup", generic_tool)


# ----- Анализ / проверки -----

async def text_analyzer(ctx: ToolContext) -> Dict[str, Any]:
    await _sleep_thinking(500, 900)
    app = ctx.shared.get("application")
    if app:
        return {
            "status": "ok",
            "extracted": {
                "title": app["title"],
                "initiator": app["initiator"],
                "amount": app["amount"],
                "items_count": len(app.get("items", [])),
            }
        }
    return {"status": "ok", "tokens_processed": random.randint(400, 1200)}


async def document_checker(ctx: ToolContext) -> Dict[str, Any]:
    await _sleep_thinking(700, 1200)
    app = ctx.shared.get("application")
    if not app:
        return {"status": "ok", "note": "Нет данных заявки"}
    expected = app.get("expected_check_result", {})
    ctx.shared["check_result"] = expected
    return {
        "status": "ok",
        "completeness": expected.get("completeness"),
        "issues_count": len(expected.get("issues", []))
    }


async def document_validator(ctx: ToolContext) -> Dict[str, Any]:
    await _sleep_thinking()
    app = ctx.shared.get("application")
    if not app:
        return {"status": "ok"}
    approvals_needed = [a for a in app.get("approvals", []) if a.get("status") != "согласовано"]
    return {
        "status": "ok",
        "missing_approvals": [a.get("role") for a in approvals_needed]
    }


async def contract_analyzer(ctx: ToolContext) -> Dict[str, Any]:
    await _sleep_thinking(800, 1300)
    contract = ctx.shared.get("contract")
    if not contract:
        return {"status": "ok"}
    return {
        "status": "ok",
        "clauses_parsed": random.randint(18, 32),
        "contractor": contract["contractor"]["name"]
    }


async def risk_assessment(ctx: ToolContext) -> Dict[str, Any]:
    await _sleep_thinking(900, 1500)
    contract = ctx.shared.get("contract")
    if not contract:
        return {"status": "ok", "risks_found": 0}
    risks = contract.get("expected_risks", {}).get("risks", [])
    ctx.shared["risks"] = risks
    ctx.shared["risk_verdict"] = contract.get("expected_risks", {}).get("overall_verdict")
    return {
        "status": "ok",
        "high": len([r for r in risks if r["severity"] == "high"]),
        "medium": len([r for r in risks if r["severity"] == "medium"]),
        "low": len([r for r in risks if r["severity"] == "low"]),
    }


async def legal_search(ctx: ToolContext) -> Dict[str, Any]:
    await _sleep_thinking(600, 1100)
    return {
        "status": "ok",
        "references_found": random.randint(4, 9),
        "base": "ГК РФ, 44-ФЗ, судебная практика ВС РФ"
    }


async def text_proofreader(ctx: ToolContext) -> Dict[str, Any]:
    await _sleep_thinking(500, 900)
    from backend.data_access import datastore
    letter = ctx.shared.get("letter") or datastore.get_letter("Исх-45-2024")
    issues = letter.get("expected_issues", []) if letter else []
    ctx.shared["proofread_issues"] = issues
    return {
        "status": "ok",
        "issues_count": len(issues),
        "types": list({i["type"] for i in issues})
    }


async def legal_translator(ctx: ToolContext) -> Dict[str, Any]:
    await _sleep_thinking(900, 1500)
    ctx.shared["translation"] = {
        "ru": "Исполнитель обязуется выполнить работы по реконструкции производственного цеха "
              "в соответствии с технической документацией и в сроки, установленные Приложением №1.",
        "en": "The Contractor shall perform the industrial workshop reconstruction works "
              "in accordance with the technical documentation and within the deadlines set forth in Annex No. 1.",
        "glossary": [
            {"ru": "Исполнитель", "en": "Contractor"},
            {"ru": "работы", "en": "works"},
            {"ru": "реконструкция", "en": "reconstruction"},
            {"ru": "техническая документация", "en": "technical documentation"}
        ]
    }
    return {"status": "ok", "glossary_terms": 4}


async def semantic_search(ctx: ToolContext) -> Dict[str, Any]:
    from backend.data_access import datastore
    await _sleep_thinking(700, 1200)
    query = ctx.parameters.get("query") or ctx.user_text or ""
    results = datastore.search_lna(query, top_k=3)
    ctx.shared["search_hits"] = results
    return {"status": "ok", "hits": len(results)}


async def kp_analyzer(ctx: ToolContext) -> Dict[str, Any]:
    await _sleep_thinking(800, 1200)
    proposals = ctx.shared.get("proposals", [])
    return {
        "status": "ok",
        "proposals_analyzed": len(proposals)
    }


async def tz_matcher(ctx: ToolContext) -> Dict[str, Any]:
    await _sleep_thinking()
    proposals = ctx.shared.get("proposals", [])
    matches = []
    for p in proposals:
        matches.append({"id": p["id"], "number": p["number"], "compliance": p.get("overall_compliance")})
    ctx.shared["tz_matches"] = matches
    return {"status": "ok", "checked": len(matches)}


async def price_comparison(ctx: ToolContext) -> Dict[str, Any]:
    await _sleep_thinking()
    proposals = ctx.shared.get("proposals", [])
    if not proposals:
        return {"status": "ok"}
    prices = sorted(proposals, key=lambda p: p.get("price_rub", 0))
    return {
        "status": "ok",
        "min": prices[0].get("number"),
        "max": prices[-1].get("number"),
        "spread_rub": prices[-1].get("price_rub", 0) - prices[0].get("price_rub", 0)
    }


async def supplier_assessment(ctx: ToolContext) -> Dict[str, Any]:
    from backend.data_access import datastore
    await _sleep_thinking(600, 1000)
    proposals = ctx.shared.get("proposals", [])
    supplier_hint = ctx.parameters.get("supplier")
    if supplier_hint:
        rec = datastore.find_supplier(supplier_hint)
        ctx.shared["supplier_verdict"] = rec
        return {"status": "ok", "supplier": supplier_hint, "verdict": rec.get("verdict") if rec else None}

    # из КП
    assessed = []
    for p in proposals:
        s = datastore.find_supplier(p["supplier"]["name"])
        if s:
            assessed.append({"supplier": s["name"], "rating": s["rating"], "reliability": s["reliability"]})
    ctx.shared["suppliers_assessed"] = assessed
    return {"status": "ok", "assessed": len(assessed)}


tool_registry.register("text_analyzer", text_analyzer)
tool_registry.register("document_checker", document_checker)
tool_registry.register("document_validator", document_validator)
tool_registry.register("contract_analyzer", contract_analyzer)
tool_registry.register("risk_assessment", risk_assessment)
tool_registry.register("legal_search", legal_search)
tool_registry.register("text_proofreader", text_proofreader)
tool_registry.register("legal_translator", legal_translator)
tool_registry.register("semantic_search", semantic_search)
tool_registry.register("kp_analyzer", kp_analyzer)
tool_registry.register("tz_matcher", tz_matcher)
tool_registry.register("price_comparison", price_comparison)
tool_registry.register("supplier_assessment", supplier_assessment)


# ----- Генераторы -----

async def text_generator(ctx: ToolContext) -> Dict[str, Any]:
    """Генерация текста (ответа на обращение и т.п.)"""
    await _sleep_thinking(900, 1500)
    return {"status": "ok", "generated": True}


async def reference_builder(ctx: ToolContext) -> Dict[str, Any]:
    await _sleep_thinking()
    return {"status": "ok"}


async def daily_summary(ctx: ToolContext) -> Dict[str, Any]:
    from backend.data_access import datastore
    await _sleep_thinking(600, 1100)
    ctx.shared["daily_ops"] = datastore.get_daily_ops()
    return {"status": "ok"}


async def data_collector(ctx: ToolContext) -> Dict[str, Any]:
    await _sleep_thinking()
    return {"status": "ok", "records_collected": random.randint(40, 120)}


async def report_builder(ctx: ToolContext) -> Dict[str, Any]:
    """Финальный сборщик отчёта — всё уже лежит в ctx.shared"""
    await _sleep_thinking(500, 900)
    return {"status": "ok", "report": "built"}


tool_registry.register("text_generator", text_generator)
tool_registry.register("reference_builder", reference_builder)
tool_registry.register("daily_summary", daily_summary)
tool_registry.register("data_collector", data_collector)
tool_registry.register("report_builder", report_builder)


# ----- Follow-up / маршрутизация -----

async def approval_router(ctx: ToolContext) -> Dict[str, Any]:
    """Определяет маршрут согласования по заявке (сборка списка согласующих)."""
    from backend.data_access import datastore
    await _sleep_thinking(500, 900)
    number = ctx.parameters.get("application_number") or ctx.shared.get("application_number")
    app = datastore.get_application(str(number)) if number else None
    if app:
        ctx.shared["application"] = app
        route = [a for a in app.get("approvals", []) if a.get("status") != "согласовано"]
        ctx.shared["approval_route"] = route
        return {
            "status": "ok",
            "application": app.get("number"),
            "pending_steps": len(route),
        }
    return {"status": "ok", "note": "Используется типовой маршрут"}


async def application_list_loader(ctx: ToolContext) -> Dict[str, Any]:
    """Возвращает список заявок (опционально — с фильтром по периоду/типу)."""
    from backend.data_access import datastore
    await _sleep_thinking()
    apps = datastore.list_applications()
    ftype = ctx.parameters.get("filter_type")
    period = ctx.parameters.get("period", "")
    if ftype and ftype != "any":
        apps = [a for a in apps if a.get("type") == ftype]
    ctx.shared["applications_list"] = apps
    ctx.shared["list_period"] = period
    return {"status": "ok", "applications_count": len(apps)}


async def kp_protocol_builder(ctx: ToolContext) -> Dict[str, Any]:
    """Сборка протокола закупочной комиссии — эмуляция."""
    await _sleep_thinking(700, 1100)
    tender = ctx.shared.get("tender") or {}
    proposals = ctx.shared.get("proposals", [])
    return {
        "status": "ok",
        "tender": tender.get("number"),
        "proposals_count": len(proposals),
        "protocol": "собран"
    }


tool_registry.register("approval_router", approval_router)
tool_registry.register("application_list_loader", application_list_loader)
tool_registry.register("kp_protocol_builder", kp_protocol_builder)

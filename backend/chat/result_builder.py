"""
Сборка финального результата (TaskResult) для каждого сценария.

Мы жёстко маппим scenario.id → «фабрика результата», которая берёт
накопленные данные из shared-состояния оркестратора и собирает
человеко-читаемый summary + artifact + proactive-предложения.
"""
from __future__ import annotations
from typing import Any, Dict, List

from backend.data_access import datastore
from backend.models.chat import TaskResult
from backend.models.employee import ProactiveSuggestion, Scenario


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _proactive_of(scenario: Scenario) -> List[ProactiveSuggestion]:
    return list(scenario.proactive)


def _document_artifact(title: str, doc_type: str, employee_id: str, source_ref: str) -> Dict[str, Any]:
    from uuid import uuid4
    doc = {
        "id": f"doc_ai_{uuid4().hex[:8]}",
        "title": title,
        "type": doc_type,
        "employee_id": employee_id,
        "status": "готово",
        "created_at": "только что",
        "source_ref": source_ref,
        "generated": True,
    }
    datastore.add_artifact(doc)
    return doc


# ---------------------------------------------------------------------------
# Scenario → Result builders
# ---------------------------------------------------------------------------


def build_result(scenario: Scenario, shared: Dict[str, Any], employee_id: str,
                 duration_ms: int) -> TaskResult:
    sid = scenario.id
    if sid.startswith("check_application"):
        return _result_check_application(scenario, shared, employee_id, duration_ms)
    if sid in ("search_lna_vacation", "kb_search", "similar_appeals_search"):
        return _result_semantic_search(scenario, shared, employee_id, duration_ms)
    if sid in ("analyze_contract_risks", "analyze_contract_repair"):
        return _result_contract_risks(scenario, shared, employee_id, duration_ms)
    if sid == "check_kp_legal_risks":
        return _result_kp_legal_risks(scenario, shared, employee_id, duration_ms)
    if sid in ("proofread_letter", "proofread_draft", "apply_proofread_fixes"):
        return _result_proofread(scenario, shared, employee_id, duration_ms)
    if sid in ("translate_contract_clause", "show_translation_glossary"):
        return _result_translate(scenario, shared, employee_id, duration_ms)
    if sid.startswith("compare_kp"):
        return _result_compare_kp(scenario, shared, employee_id, duration_ms)
    if sid in ("check_supplier", "check_contractor"):
        return _result_supplier(scenario, shared, employee_id, duration_ms)
    if sid.startswith("answer_appeal"):
        return _result_appeal(scenario, shared, employee_id, duration_ms)
    if sid == "daily_summary":
        return _result_daily_summary(scenario, shared, employee_id, duration_ms)
    if sid == "compare_daily_summaries":
        return _result_compare_daily(scenario, shared, employee_id, duration_ms)

    # Follow-up сценарии
    if sid == "route_application_approval":
        return _result_route_approval(scenario, shared, employee_id, duration_ms)
    if sid == "send_issues_to_initiator":
        return _result_send_issues(scenario, shared, employee_id, duration_ms)
    if sid == "list_applications_by_period":
        return _result_list_applications(scenario, shared, employee_id, duration_ms)
    if sid == "check_approval_status":
        return _result_approval_status(scenario, shared, employee_id, duration_ms)
    if sid == "generate_vacation_application":
        return _result_generate_doc(scenario, shared, employee_id, duration_ms,
                                     doc_title="Шаблон заявления на отпуск", doc_type="шаблон",
                                     summary="Подготовлен шаблон заявления на отпуск. Документ готов к скачиванию.")
    if sid == "prepare_disagreement_protocol":
        return _result_generate_doc(scenario, shared, employee_id, duration_ms,
                                     doc_title="Протокол разногласий по договору Д-2026-001", doc_type="протокол",
                                     summary="Подготовлен протокол разногласий по договору Д-2026-001. Включены контр-редакции по пп. 5.2 (неустойка), 7 (гарантия) и новый раздел «Форс-мажор».")
    if sid == "create_kp_protocol":
        return _result_generate_doc(scenario, shared, employee_id, duration_ms,
                                     doc_title="Протокол рассмотрения КП", doc_type="протокол",
                                     summary=_kp_protocol_summary(shared))
    if sid == "request_kp_clarification":
        return _result_generate_doc(scenario, shared, employee_id, duration_ms,
                                     doc_title="Запрос уточнений по КП", doc_type="письмо",
                                     summary="Подготовлен запрос уточнений условий оплаты и сроков поставки. Письмо готово к отправке подрядчику.")
    if sid == "list_contractor_history":
        return _result_contractor_history(scenario, shared, employee_id, duration_ms)
    if sid == "find_alternative_contractors":
        return _result_alt_contractors(scenario, shared, employee_id, duration_ms)
    if sid == "route_summary_to_responsible":
        return _result_route_summary(scenario, shared, employee_id, duration_ms)
    if sid == "generate_reference":
        return _result_generate_doc(scenario, shared, employee_id, duration_ms,
                                     doc_title="Справка по запросу", doc_type="справка",
                                     summary="Справка сформирована в PDF-формате с ссылками на ЛНА. Готова к передаче сотруднику.")

    return TaskResult(
        scenario_id=sid,
        title=scenario.plan.title,
        summary="Задача выполнена.",
        sources=list(scenario.plan.documents),
        proactive=_proactive_of(scenario),
        duration_ms=duration_ms,
    )


def _result_check_application(scenario, shared, employee_id, duration_ms) -> TaskResult:
    app = shared.get("application") or {}
    check = shared.get("check_result") or app.get("expected_check_result", {})
    issues = check.get("issues", [])
    status = check.get("status", "ok")
    completeness = check.get("completeness", "—")

    if status == "ok":
        summary = (
            f"Заявка №{app.get('number')} «{app.get('title')}» — **оформлена корректно**. "
            f"Комплектность: {completeness}. Все обязательные поля и согласования получены."
        )
    else:
        critical = [i for i in issues if i.get("severity") == "critical"]
        summary = (
            f"Заявка №{app.get('number')} «{app.get('title')}» — **требует исправления**. "
            f"Комплектность: {completeness}. Найдено замечаний: {len(issues)} "
            f"(из них критических: {len(critical)})."
        )

    artifact = {
        "kind": "application_check",
        "application": {
            "number": app.get("number"),
            "title": app.get("title"),
            "initiator": app.get("initiator"),
            "amount": app.get("amount"),
        },
        "status": status,
        "completeness": completeness,
        "issues": issues,
        "passed": check.get("passed", []),
    }

    docs = []
    if status != "ok":
        docs.append(_document_artifact(
            title=f"Отчёт о комплектности заявки №{app.get('number')}",
            doc_type="отчёт",
            employee_id=employee_id,
            source_ref=app.get("id", "")
        ))

    return TaskResult(
        scenario_id=scenario.id,
        title=f"Проверка заявки №{app.get('number')}",
        summary=summary,
        artifact=artifact,
        sources=list(scenario.plan.documents),
        documents_created=docs,
        proactive=_proactive_of(scenario),
        duration_ms=duration_ms,
    )


def _result_semantic_search(scenario, shared, employee_id, duration_ms) -> TaskResult:
    hits = shared.get("search_hits", [])
    if not hits:
        summary = "В базе знаний не нашлось релевантных фрагментов. Попробуйте переформулировать запрос."
        docs: List[Dict[str, Any]] = []
    else:
        top = hits[0]
        summary = (
            f"Нашёл **{len(hits)}** релевантных фрагмента в ЛНА и базе знаний. "
            f"Ключевая цитата: «{top['text'][:160]}…» — {top['document']}, {top['section']}."
        )
        docs = [_document_artifact(
            title="Подборка фрагментов ЛНА по запросу",
            doc_type="подборка",
            employee_id=employee_id,
            source_ref=top.get("document", ""),
        )]
    return TaskResult(
        scenario_id=scenario.id,
        title=scenario.plan.title,
        summary=summary,
        artifact={
            "kind": "semantic_search",
            "hits": hits
        },
        sources=[h["document"] for h in hits] or list(scenario.plan.documents),
        documents_created=docs,
        proactive=_proactive_of(scenario),
        duration_ms=duration_ms,
    )


def _result_contract_risks(scenario, shared, employee_id, duration_ms) -> TaskResult:
    contract = shared.get("contract") or {}
    risks = shared.get("risks", [])
    verdict = shared.get("risk_verdict", "medium")
    high = [r for r in risks if r["severity"] == "high"]

    verdict_label = {"high": "высокий", "medium": "средний", "low": "низкий"}.get(verdict, "средний")
    summary = (
        f"Правовой анализ договора **{contract.get('number')}** завершён. "
        f"Выявлено рисков: {len(risks)} (высоких — {len(high)}). "
        f"Общий уровень рисков: **{verdict_label}**."
    )

    docs = [_document_artifact(
        title=f"Правовое заключение по договору {contract.get('number')}",
        doc_type="заключение",
        employee_id=employee_id,
        source_ref=contract.get("id", "")
    )]

    return TaskResult(
        scenario_id=scenario.id,
        title=f"Анализ рисков · {contract.get('number')}",
        summary=summary,
        artifact={
            "kind": "contract_risks",
            "contract": {
                "number": contract.get("number"),
                "contractor": contract.get("contractor", {}).get("name"),
                "amount": contract.get("amount"),
            },
            "verdict": verdict,
            "risks": risks
        },
        sources=list(scenario.plan.documents),
        documents_created=docs,
        proactive=_proactive_of(scenario),
        duration_ms=duration_ms,
    )


def _result_kp_legal_risks(scenario, shared, employee_id, duration_ms) -> TaskResult:
    """Юр. проверка КП перед подписанием (handoff от закупщика).

    Используем уже загруженные `tender` и `proposals` из `kp_loader`.
    Риски — синтетические, но связаны с конкретными КП для убедительности.
    """
    tender = shared.get("tender") or {}
    proposals = shared.get("proposals") or []

    # Берём топ-1 КП как целевой для юр. проверки (сортируем по цене для стабильности).
    target_kp = None
    if proposals:
        target_kp = sorted(proposals, key=lambda p: p.get("price_rub", 0))[0]

    risks = [
        {
            "id": "r1", "severity": "high",
            "clause": "п. 5.2 КП",
            "title": "Несоразмерная неустойка (0,5% в сутки)",
            "recommendation": "Снизить до 0,1% в сутки, ограничить 10% от стоимости работ (ст. 333 ГК РФ).",
        },
        {
            "id": "r2", "severity": "high",
            "clause": "п. 7 КП",
            "title": "Отсутствует гарантийный срок на работы",
            "recommendation": "Зафиксировать гарантию не менее 24 мес. согласно типовым условиям ГШП.",
        },
        {
            "id": "r3", "severity": "medium",
            "clause": "п. 11 КП",
            "title": "Нет раздела «Форс-мажор»",
            "recommendation": "Добавить типовую формулировку ГШП с перечнем обстоятельств и сроком уведомления 7 к. д.",
        },
        {
            "id": "r4", "severity": "medium",
            "clause": "Приложение № 2",
            "title": "Отсутствует согласованный график этапов работ",
            "recommendation": "Приложить график с вехами ≤ 30 дней для контроля приёмки по 223-ФЗ.",
        },
        {
            "id": "r5", "severity": "low",
            "clause": "п. 3.4 КП",
            "title": "Неоднозначная валютная оговорка",
            "recommendation": "Зафиксировать цену в рублях с фиксированным курсом ЦБ на дату подписания.",
        },
    ]
    high = [r for r in risks if r["severity"] == "high"]
    medium = [r for r in risks if r["severity"] == "medium"]
    verdict = "high" if len(high) >= 2 else "medium"
    verdict_label = {"high": "высокий", "medium": "средний", "low": "низкий"}[verdict]

    kp_label = (target_kp or {}).get("number") or "выбранное КП"
    supplier_label = ((target_kp or {}).get("supplier") or {}).get("name") or "—"
    tender_label = tender.get("number") or tender.get("id") or "—"

    summary = (
        f"Юридическая проверка **{kp_label}** ({supplier_label}) по тендеру **{tender_label}** "
        f"завершена. Выявлено рисков: {len(risks)} (высоких — {len(high)}, средних — {len(medium)}). "
        f"Общий уровень: **{verdict_label}**. Рекомендую оформить протокол разногласий по пп. 5.2 и 7 "
        "перед подписанием."
    )

    docs = [_document_artifact(
        title=f"Правовое заключение по КП {kp_label} (тендер {tender_label})",
        doc_type="заключение",
        employee_id=employee_id,
        source_ref=(target_kp or {}).get("id", tender.get("id", "")),
    )]

    return TaskResult(
        scenario_id=scenario.id,
        title=f"Юр. проверка КП · {tender_label}",
        summary=summary,
        artifact={
            "kind": "kp_legal_risks",
            "tender": {"id": tender.get("id"), "number": tender.get("number"), "title": tender.get("title")},
            "kp": {
                "id": (target_kp or {}).get("id"),
                "number": kp_label,
                "supplier": supplier_label,
            },
            "verdict": verdict,
            "risks": risks,
        },
        sources=list(scenario.plan.documents),
        documents_created=docs,
        proactive=_proactive_of(scenario),
        duration_ms=duration_ms,
    )


def _result_proofread(scenario, shared, employee_id, duration_ms) -> TaskResult:
    issues = shared.get("proofread_issues", [])
    summary = (
        f"Проверка письма **Исх-45-2024** завершена. Найдено замечаний: **{len(issues)}**. "
        "Все замечания с пояснениями — ниже. Можно применить правки автоматически."
    )
    docs = [_document_artifact(
        title="Отчёт о проверке текста · Исх-45-2024",
        doc_type="отчёт",
        employee_id=employee_id,
        source_ref="Исх-45-2024",
    )]
    return TaskResult(
        scenario_id=scenario.id,
        title="Проверка текста · Исх-45-2024",
        summary=summary,
        artifact={
            "kind": "proofread",
            "issues": issues,
            "letter_number": "Исх-45-2024"
        },
        sources=list(scenario.plan.documents),
        documents_created=docs,
        proactive=_proactive_of(scenario),
        duration_ms=duration_ms,
    )


def _result_translate(scenario, shared, employee_id, duration_ms) -> TaskResult:
    tr = shared.get("translation", {})
    summary = (
        "Перевод пункта договора выполнен с сохранением юридической терминологии. "
        "Использован корпоративный глоссарий RU-EN."
    )
    docs = [_document_artifact(
        title="Перевод фрагмента договора RU→EN",
        doc_type="перевод",
        employee_id=employee_id,
        source_ref="Д-2026-001",
    )]
    return TaskResult(
        scenario_id=scenario.id,
        title="Юридический перевод RU→EN",
        summary=summary,
        artifact={"kind": "translation", **tr},
        sources=list(scenario.plan.documents),
        documents_created=docs,
        proactive=_proactive_of(scenario),
        duration_ms=duration_ms,
    )


def _result_compare_kp(scenario, shared, employee_id, duration_ms) -> TaskResult:
    proposals = shared.get("proposals", [])
    tender = shared.get("tender", {})
    tender_id = tender.get("id") if isinstance(tender, dict) else None
    rec = datastore.get_expected_recommendation(tender_id) or datastore.get_expected_recommendation()
    ranking = rec.get("ranking", [])
    winner_id = rec.get("winner")
    winner = next((p for p in proposals if p["id"] == winner_id), None)

    rank_by_id = {r["kp_id"]: r for r in ranking}
    filtered_ranking = [rank_by_id[p["id"]] for p in proposals if p["id"] in rank_by_id]
    filtered_ranking.sort(key=lambda r: r["position"])

    if winner and winner in proposals:
        summary = (
            f"Рекомендую выбрать **{winner['number']}** от {winner['supplier']['name']}. "
            f"{rec.get('rationale', '')}"
        )
    else:
        summary = "Сравнение завершено. Рекомендация на стороне комиссии."

    docs = [_document_artifact(
        title=f"Сравнительный анализ КП по закупке {tender.get('number', '—')}",
        doc_type="анализ",
        employee_id=employee_id,
        source_ref=tender.get("id", "")
    )]

    return TaskResult(
        scenario_id=scenario.id,
        title="Сравнение коммерческих предложений",
        summary=summary,
        artifact={
            "kind": "kp_comparison",
            "tender": tender,
            "proposals": proposals,
            "ranking": filtered_ranking,
            "winner_id": winner_id,
            "rationale": rec.get("rationale")
        },
        sources=list(scenario.plan.documents),
        documents_created=docs,
        proactive=_proactive_of(scenario),
        duration_ms=duration_ms,
    )


def _result_supplier(scenario, shared, employee_id, duration_ms) -> TaskResult:
    supplier = shared.get("supplier_verdict")
    if not supplier:
        supplier = datastore.find_supplier("Морнефтегазсервис")
    if not supplier:
        return TaskResult(
            scenario_id=scenario.id,
            title="Проверка подрядчика",
            summary="Подрядчик в реестре не найден.",
            sources=list(scenario.plan.documents),
            proactive=_proactive_of(scenario),
            duration_ms=duration_ms,
        )
    spec = ", ".join(supplier.get("specialization", [])) or "—"
    total_value = supplier.get("total_value_rub")
    total_line = f", общий объём контрактов: {(total_value or 0):,} ₽".replace(",", " ") if total_value else ""
    summary = (
        f"**{supplier['name']}** — {supplier['reliability']} надёжность, рейтинг **{supplier['rating']}**. "
        f"Контрактов: {supplier['contracts_count']}, нарушений: {supplier['breaches_count']}{total_line}. "
        f"Специализация: {spec}. "
        f"{supplier['verdict']}"
    )
    docs = [_document_artifact(
        title=f"Карточка подрядчика · {supplier['name']}",
        doc_type="карточка",
        employee_id=employee_id,
        source_ref=supplier.get("id", supplier["name"]),
    )]
    return TaskResult(
        scenario_id=scenario.id,
        title=f"Оценка подрядчика · {supplier['name']}",
        summary=summary,
        artifact={"kind": "supplier_assessment", "supplier": supplier},
        sources=list(scenario.plan.documents),
        documents_created=docs,
        proactive=_proactive_of(scenario),
        duration_ms=duration_ms,
    )


def _result_appeal(scenario, shared, employee_id, duration_ms) -> TaskResult:
    appeal = shared.get("appeal") or {}
    template = appeal.get("expected_response_template", {})
    summary = (
        f"Подготовлен проект ответа на обращение **№{appeal.get('number')}** от "
        f"{appeal.get('from', {}).get('name')} (категория: {appeal.get('category')}). "
        f"Использовано {len(appeal.get('sources', []))} источников."
    )
    docs = [_document_artifact(
        title=f"Проект ответа на обращение №{appeal.get('number')}",
        doc_type="письмо",
        employee_id=employee_id,
        source_ref=appeal.get("id", "")
    )]
    return TaskResult(
        scenario_id=scenario.id,
        title=f"Ответ на обращение №{appeal.get('number')}",
        summary=summary,
        artifact={
            "kind": "appeal_response",
            "appeal": {
                "number": appeal.get("number"),
                "from": appeal.get("from"),
                "subject": appeal.get("subject"),
                "category": appeal.get("category"),
            },
            "response": template
        },
        sources=list(appeal.get("sources", [])),
        documents_created=docs,
        proactive=_proactive_of(scenario),
        duration_ms=duration_ms,
    )


def _kp_protocol_summary(shared: Dict[str, Any]) -> str:
    tender = shared.get("tender") or {}
    props = shared.get("proposals") or []
    if tender:
        return (
            f"Протокол рассмотрения КП по закупке **{tender.get('number', '')}** собран. "
            f"Рассмотрено предложений: {len(props)}. "
            f"Протокол готов к подписанию членами закупочной комиссии."
        )
    return "Протокол рассмотрения КП собран и готов к подписанию."


def _result_route_approval(scenario, shared, employee_id, duration_ms) -> TaskResult:
    app = shared.get("application") or {}
    pending = shared.get("approval_route") or []
    pending_roles = [a.get("role") for a in pending]
    if pending_roles:
        summary = (
            f"Маршрут согласования заявки №{app.get('number', '—')} запущен. "
            f"Направлены уведомления: {', '.join(pending_roles)}. "
            f"Ожидаемый срок закрытия маршрута — 3 рабочих дня."
        )
    else:
        summary = (
            f"Заявка №{app.get('number', '—')} полностью согласована — маршрут закрыт. "
            "Можно передавать на следующий этап жизненного цикла."
        )
    docs = [_document_artifact(
        title=f"Лист согласования заявки №{app.get('number', '—')}",
        doc_type="лист согласования",
        employee_id=employee_id,
        source_ref=app.get("id", ""),
    )]
    return TaskResult(
        scenario_id=scenario.id,
        title=f"Маршрут согласования · заявка №{app.get('number', '—')}",
        summary=summary,
        artifact={
            "kind": "approval_route",
            "application_number": app.get("number"),
            "pending": [{"role": a.get("role"), "name": a.get("name")} for a in pending],
            "completed": [a for a in app.get("approvals", []) if a.get("status") == "согласовано"],
        },
        sources=list(scenario.plan.documents),
        documents_created=docs,
        proactive=_proactive_of(scenario),
        duration_ms=duration_ms,
    )


def _result_send_issues(scenario, shared, employee_id, duration_ms) -> TaskResult:
    app = shared.get("application") or {}
    check = app.get("expected_check_result", {})
    issues = check.get("issues", [])
    summary = (
        f"Подготовлено письмо инициатору ({app.get('initiator', '—')}) по заявке №{app.get('number', '—')}. "
        f"В перечень включено замечаний: {len(issues)}. Документ готов к отправке в СЭД."
    )
    docs = [_document_artifact(
        title=f"Служебная записка с замечаниями по заявке №{app.get('number', '—')}",
        doc_type="служебная записка",
        employee_id=employee_id,
        source_ref=app.get("id", ""),
    )]
    return TaskResult(
        scenario_id=scenario.id,
        title=f"Замечания по заявке №{app.get('number', '—')}",
        summary=summary,
        artifact={
            "kind": "issues_letter",
            "initiator": app.get("initiator"),
            "application_number": app.get("number"),
            "issues": issues,
        },
        sources=list(scenario.plan.documents),
        documents_created=docs,
        proactive=_proactive_of(scenario),
        duration_ms=duration_ms,
    )


def _result_list_applications(scenario, shared, employee_id, duration_ms) -> TaskResult:
    apps = shared.get("applications_list") or datastore.list_applications()
    period = shared.get("list_period") or "все периоды"
    rows = [
        {
            "number": a.get("number"),
            "title": a.get("title"),
            "initiator": a.get("initiator"),
            "amount": a.get("amount"),
            "status": a.get("expected_check_result", {}).get("status"),
            "created_at": a.get("created_at"),
        }
        for a in apps
    ]
    summary = (
        f"Найдено заявок: **{len(rows)}** ({period}). "
        "Можно нажать на любую строку, чтобы открыть карточку заявки."
    )
    docs = [_document_artifact(
        title=f"Выгрузка заявок · {period}",
        doc_type="реестр",
        employee_id=employee_id,
        source_ref="applications",
    )]
    return TaskResult(
        scenario_id=scenario.id,
        title=f"Список заявок · {period}",
        summary=summary,
        artifact={"kind": "applications_list", "rows": rows},
        sources=["Реестр заявок ГШП"],
        documents_created=docs,
        proactive=_proactive_of(scenario),
        duration_ms=duration_ms,
    )


def _result_approval_status(scenario, shared, employee_id, duration_ms) -> TaskResult:
    app = shared.get("application") or {}
    approvals = app.get("approvals", [])
    done = [a for a in approvals if a.get("status") == "согласовано"]
    pending = [a for a in approvals if a.get("status") != "согласовано"]
    summary = (
        f"Заявка №{app.get('number', '—')}: согласовано {len(done)} из {len(approvals)}. "
        + (f"Ожидается: {', '.join(a.get('role') for a in pending)}." if pending else "Маршрут закрыт.")
    )
    return TaskResult(
        scenario_id=scenario.id,
        title=f"Статус согласования · заявка №{app.get('number', '—')}",
        summary=summary,
        artifact={"kind": "approval_status", "approvals": approvals},
        sources=[],
        proactive=_proactive_of(scenario),
        duration_ms=duration_ms,
    )


def _result_generate_doc(scenario, shared, employee_id, duration_ms, *,
                          doc_title: str, doc_type: str, summary: str) -> TaskResult:
    docs = [_document_artifact(
        title=doc_title,
        doc_type=doc_type,
        employee_id=employee_id,
        source_ref="",
    )]
    return TaskResult(
        scenario_id=scenario.id,
        title=scenario.plan.title,
        summary=summary,
        artifact={"kind": "generated_document", "document_title": doc_title, "document_type": doc_type},
        sources=list(scenario.plan.documents),
        documents_created=docs,
        proactive=_proactive_of(scenario),
        duration_ms=duration_ms,
    )


def _result_contractor_history(scenario, shared, employee_id, duration_ms) -> TaskResult:
    suppliers = datastore.get_suppliers_registry()
    top = [s for s in suppliers if s.get("contracts_count", 0) > 0]
    total_value = sum(s.get("total_value_rub") or 0 for s in top)
    total_contracts = sum(s.get("contracts_count") or 0 for s in top)
    summary = (
        f"История контрактов собрана: выведено **{len(top)}** подрядчиков "
        f"с активными контрактами. Суммарно — {total_contracts} сделок "
        f"на {total_value:,} ₽. По каждому — рейтинг, количество сделок и общий объём."
    ).replace(",", " ")
    docs = [_document_artifact(
        title=f"Реестр истории контрактов · {len(top)} подрядчиков",
        doc_type="реестр",
        employee_id=employee_id,
        source_ref="suppliers_registry",
    )]
    return TaskResult(
        scenario_id=scenario.id,
        title="История контрактов подрядчиков",
        summary=summary,
        artifact={"kind": "contractors_history", "rows": top},
        sources=["Реестр подрядчиков ГШП"],
        documents_created=docs,
        proactive=_proactive_of(scenario),
        duration_ms=duration_ms,
    )


def _result_alt_contractors(scenario, shared, employee_id, duration_ms) -> TaskResult:
    suppliers = [s for s in datastore.get_suppliers_registry() if s.get("reliability") in ("высокая", "средняя")]
    summary = (
        f"Подобран shortlist: **{len(suppliers)}** подрядчика/поставщика. "
        "Порядок — по рейтингу и объёму выполненных контрактов."
    )
    docs = [_document_artifact(
        title=f"Shortlist альтернативных подрядчиков ({len(suppliers)})",
        doc_type="shortlist",
        employee_id=employee_id,
        source_ref="suppliers_registry",
    )]
    return TaskResult(
        scenario_id=scenario.id,
        title="Альтернативные подрядчики",
        summary=summary,
        artifact={"kind": "alt_contractors", "rows": suppliers},
        sources=["Реестр подрядчиков ГШП"],
        documents_created=docs,
        proactive=_proactive_of(scenario),
        duration_ms=duration_ms,
    )


def _result_compare_daily(scenario, shared, employee_id, duration_ms) -> TaskResult:
    ops = shared.get("daily_ops") or datastore.get_daily_ops()
    kpi_today = ops.get("kpi", {})
    kpi_yesterday = {
        "platform_uptime_percent": (kpi_today.get("platform_uptime_percent") or 98.5) - 0.6,
        "works_completion_vs_plan_percent": (kpi_today.get("works_completion_vs_plan_percent") or 92) - 3,
    }
    summary = (
        f"Сравнение сводок за 20.04 и 21.04: uptime платформ "
        f"{kpi_yesterday['platform_uptime_percent']:.1f}% → {kpi_today.get('platform_uptime_percent', '—')}%; "
        f"выполнение плана работ "
        f"{kpi_yesterday['works_completion_vs_plan_percent']:.0f}% → {kpi_today.get('works_completion_vs_plan_percent', '—')}%. "
        "Динамика положительная — подробная таблица ниже."
    )
    docs = [_document_artifact(
        title="Сравнительная сводка 20.04 — 21.04",
        doc_type="сводка",
        employee_id=employee_id,
        source_ref="daily_ops",
    )]
    return TaskResult(
        scenario_id=scenario.id,
        title="Сравнение сводок 20.04 и 21.04",
        summary=summary,
        artifact={
            "kind": "daily_compare",
            "day_a": {"date": "20.04.2026", "kpi": kpi_yesterday},
            "day_b": {"date": "21.04.2026", "kpi": kpi_today},
        },
        sources=["Архив сводок ГШП"],
        documents_created=docs,
        proactive=_proactive_of(scenario),
        duration_ms=duration_ms,
    )


def _result_route_summary(scenario, shared, employee_id, duration_ms) -> TaskResult:
    recipients = [
        {"name": "Волков С.Ю.", "role": "Главный инженер", "email": "s.volkov@gazprom-shelf.ru"},
        {"name": "Скворцов Д.И.", "role": "Руководитель УЭШТ", "email": "d.skvortsov@gazprom-shelf.ru"},
        {"name": "Кулясов О.Ф.", "role": "Руководитель БЭК", "email": "o.kulyasov@gazprom-shelf.ru"},
    ]
    summary = (
        f"Сводка разослана {len(recipients)} ответственным по направлениям (гл. инженер, УЭШТ, БЭК). "
        "В каждом письме — персональная выжимка по KPI его направления."
    )
    docs = [
        _document_artifact(
            title=f"Письмо · сводка для {r['role']} ({r['name']})",
            doc_type="письмо",
            employee_id=employee_id,
            source_ref=r.get("email", ""),
        )
        for r in recipients
    ]
    return TaskResult(
        scenario_id=scenario.id,
        title="Рассылка ежедневной сводки",
        summary=summary,
        artifact={"kind": "summary_dispatch", "recipients": recipients},
        sources=[],
        documents_created=docs,
        proactive=_proactive_of(scenario),
        duration_ms=duration_ms,
    )


def _result_daily_summary(scenario, shared, employee_id, duration_ms) -> TaskResult:
    ops = shared.get("daily_ops") or datastore.get_daily_ops()
    fuel = ops.get("fuel", {})
    kpi = ops.get("kpi", {})
    summary = (
        f"Сводка за **{ops.get('date')}** собрана. "
        f"Uptime платформ: {kpi.get('platform_uptime_percent')}%, "
        f"выполнение плана работ: {kpi.get('works_completion_vs_plan_percent')}%, "
        f"остаток топлива: {fuel.get('closing_stock_t')} т."
    )
    docs = [_document_artifact(
        title=f"Ежедневная сводка {ops.get('date')}",
        doc_type="сводка",
        employee_id=employee_id,
        source_ref="daily_ops"
    )]
    return TaskResult(
        scenario_id=scenario.id,
        title=f"Ежедневная сводка · {ops.get('date')}",
        summary=summary,
        artifact={"kind": "daily_summary", "ops": ops},
        sources=list(scenario.plan.documents),
        documents_created=docs,
        proactive=_proactive_of(scenario),
        duration_ms=duration_ms,
    )

"""
ChatService — основной фасад чата с AI-сотрудником.

Сценарий (5 этапов):
  1. Делегирование — пользователь отправил текст / нажал пресет.
  2. Уточнение — если сценарий требует уточнения (ClarifyingQuestion).
  3. Планирование — отправляем PlanProposal на согласование.
  4. Исполнение — пользователь одобряет план, оркестратор выполняет шаги.
  5. Результат — TaskResult с проактивными предложениями.
"""
from __future__ import annotations
import asyncio
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

from loguru import logger

from backend.chat.intent import classify, extract_entities
from backend.chat.orchestrator import plan_orchestrator
from backend.chat.plan_templates import plan_template_registry
from backend.chat.result_builder import build_result
from backend.chat.session_manager import session_manager
from backend.employees import employee_registry
from backend.models.chat import (
    ChatMessage, ChatSession, ClarifyingQuestion, PlanGraphEdge, PlanGraphNode,
    PlanProposal, PlanTemplate, SendMessageRequest, TaskResult
)
from backend.models.employee import Employee, PlanStep, ProactiveSuggestion, Scenario
from backend.services.llm_service import llm_service
from backend.websocket.manager import ws_manager


class ChatService:
    """Фасад диалога с сотрудником"""

    def __init__(self) -> None:
        # Активные события паузы исполнения. Ключ — session.id.
        # Значение — asyncio.Event, который воркер ждёт перед продолжением.
        self._pause_events: Dict[str, asyncio.Event] = {}

    # ------------------ Публичный API ------------------

    def init_session(self, employee_id: str) -> ChatSession:
        session = session_manager.get_or_create(employee_id)
        if not session.messages:
            employee = employee_registry.get(employee_id)
            if employee:
                welcome = ChatMessage(
                    type="welcome",
                    author="assistant",
                    text=(
                        f"Здравствуйте! Я {employee.name} — ваш AI-сотрудник по направлению «{employee.role}». "
                        f"Готов помочь: {employee.description.lower()[:180]}"
                    ),
                    payload={
                        "employee_id": employee.id,
                        "avatar": employee.avatar,
                        "quick_actions": [
                            {"id": sc.id, "title": sc.title, "request": sc.request}
                            for sc in employee.scenarios
                        ],
                    },
                )
                session.messages.append(welcome)
        return session

    def reset_session(self, employee_id: str) -> ChatSession:
        return session_manager.reset(employee_id)

    async def send_message(self, employee_id: str, req: SendMessageRequest) -> ChatSession:
        employee = employee_registry.get(employee_id)
        if not employee:
            raise ValueError(f"Employee '{employee_id}' не найден")
        session = session_manager.get_or_create(employee_id)

        # Приветствие handoff'а: если задача передана от другого AI-сотрудника.
        if req.handoff_from:
            from_emp = employee_registry.get(req.handoff_from)
            from_name = from_emp.name if from_emp else req.handoff_from
            handoff_msg = ChatMessage(
                type="answer",
                author="assistant",
                text=(
                    f"Принял задачу от коллеги — {from_name}. "
                    f"Беру в работу, сейчас предложу план."
                ),
                payload={"handoff_from": req.handoff_from, "handoff_from_name": from_name},
            )
            session.messages.append(handoff_msg)
            await self._broadcast_chat(session, handoff_msg)

        # Зафиксируем сообщение пользователя
        user_msg = ChatMessage(type="user", author="user", text=req.text)
        session.messages.append(user_msg)
        await self._broadcast_chat(session, user_msg)

        # Сценарий: пользователь нажал пресет → берём его напрямую
        scenario = None
        if req.scenario_id:
            scenario = next((s for s in employee.scenarios if s.id == req.scenario_id), None)

        # Если идёт диалог (ждали уточнение) — вернёмся к ранее выбранному сценарию.
        was_clarifying = session.pending_clarify is not None and scenario is None
        if scenario is None and session.pending_clarify and session.pending_scenario_id:
            scenario = next(
                (s for s in employee.scenarios if s.id == session.pending_scenario_id),
                None,
            )

        # Если не пресет и не уточнение — классифицируем по тексту
        extracted: Dict[str, str] = {}
        if scenario is None:
            match = classify(employee, req.text)
            if match is not None:
                scenario = match.scenario
                extracted = match.extracted

        if scenario is None:
            # Свободный ввод — генерируем ответ через LLM в контексте профиля сотрудника.
            await self._handle_freeform(session, employee, req.text)
            return session

        # Извлечём сущности, если ещё не извлекли (когда пришёл scenario_id напрямую)
        if not extracted:
            extracted = extract_entities(req.text)

        # Шаг 2: Уточнение — только для пресета, и только если уточнение ещё не отвечено
        if scenario.clarify and req.scenario_id and not was_clarifying:
            clarify = ClarifyingQuestion(
                scenario_id=scenario.id,
                question=scenario.clarify.question,
                suggestions=scenario.clarify.suggestions,
            )
            session.pending_scenario_id = scenario.id
            session.pending_clarify = clarify
            msg = ChatMessage(
                type="clarifying_question",
                author="assistant",
                text=clarify.question,
                payload=clarify.model_dump()
            )
            session.messages.append(msg)
            await self._broadcast_chat(session, msg)
            return session

        # Уточнение отвечено — очищаем pending_clarify
        if was_clarifying:
            session.pending_clarify = None

        # Шаг 3: Строим план
        plan = self._build_plan_proposal(scenario, extracted, req.text)
        session.pending_plan = plan
        session.pending_scenario_id = scenario.id

        msg = ChatMessage(
            type="plan_proposal",
            author="assistant",
            text=f"Предлагаю план действий: «{plan.title}». Подтвердите, чтобы я приступил к выполнению.",
            payload=plan.model_dump()
        )
        session.messages.append(msg)
        await self._broadcast_chat(session, msg)
        return session

    async def approve_plan(self, employee_id: str) -> ChatSession:
        employee = employee_registry.get(employee_id)
        if not employee:
            raise ValueError("Employee not found")
        session = session_manager.get_or_create(employee_id)
        if not session.pending_plan or not session.pending_scenario_id:
            raise ValueError("Нет плана, ожидающего подтверждения")

        plan = session.pending_plan
        scenario = next(s for s in employee.scenarios if s.id == session.pending_scenario_id)

        # Материализуем граф в исполнительный план: пропускаем removed-узлы,
        # собираем точки паузы и активный handoff (не-removed handoff-узел).
        materialized, pause_after_steps, handoff = self._materialize_plan(plan)

        confirm_msg = ChatMessage(
            type="plan_approved",
            author="user",
            text="Подтверждаю план",
            payload={"plan_id": materialized.plan_id}
        )
        session.messages.append(confirm_msg)
        await self._broadcast_chat(session, confirm_msg)

        running_msg = ChatMessage(
            type="running",
            author="assistant",
            text=f"Приступаю к выполнению: {materialized.title}",
            payload={"plan_id": materialized.plan_id}
        )
        session.messages.append(running_msg)
        await self._broadcast_chat(session, running_msg)

        session.pending_plan = None
        asyncio.create_task(self._run_and_finish(
            session, employee, scenario, materialized,
            pause_after_steps=pause_after_steps,
            handoff=handoff,
        ))

        return session

    async def update_plan(self, employee_id: str,
                           graph_nodes: List[PlanGraphNode],
                           graph_edges: List[PlanGraphEdge]) -> ChatSession:
        """Пользователь отредактировал плановый граф. Обновляем pending_plan."""
        session = session_manager.get_or_create(employee_id)
        if not session.pending_plan:
            raise ValueError("Нет плана, ожидающего редактирования")
        session.pending_plan.graph_nodes = graph_nodes
        session.pending_plan.graph_edges = graph_edges
        # Синхронизируем параметры: editable_params с графа перетирают parameters
        # (ими будет пользоваться orchestrator при вызове инструментов).
        for n in graph_nodes:
            if n.removed:
                continue
            for k, v in (n.editable_params or {}).items():
                session.pending_plan.parameters[k] = v
        return session

    async def resume_plan(self, employee_id: str) -> ChatSession:
        """Снимаем паузу: сигналим событию, которое ждёт воркер."""
        session = session_manager.get_or_create(employee_id)
        ev = self._pause_events.get(session.id)
        if ev and not ev.is_set():
            ev.set()
            resumed = ChatMessage(
                type="plan_resumed",
                author="user",
                text="Продолжить выполнение",
            )
            session.messages.append(resumed)
            await self._broadcast_chat(session, resumed)
        return session

    async def save_template(self, employee_id: str, name: str) -> PlanTemplate:
        session = session_manager.get_or_create(employee_id)
        if not session.pending_plan:
            raise ValueError("Нет плана для сохранения")
        p = session.pending_plan
        tpl = PlanTemplate(
            employee_id=employee_id,
            name=name.strip() or "Без названия",
            scenario_id=p.scenario_id,
            title=p.title,
            graph_nodes=list(p.graph_nodes),
            graph_edges=list(p.graph_edges),
            parameters=dict(p.parameters),
            documents=list(p.documents),
        )
        return plan_template_registry.save(tpl)

    def list_templates(self, employee_id: str) -> List[PlanTemplate]:
        return plan_template_registry.list_for(employee_id)

    async def apply_template(self, employee_id: str, template_id: str) -> ChatSession:
        session = session_manager.get_or_create(employee_id)
        tpl = plan_template_registry.get(employee_id, template_id)
        if not tpl:
            raise ValueError("Шаблон не найден")

        # Собираем steps из tool-узлов шаблона (handoff-узлы не попадают в steps,
        # но остаются в graph_nodes как опциональные).
        steps = [
            PlanStep(name=n.name, tool=n.tool or "", source=n.source, icon=n.icon)
            for n in tpl.graph_nodes
            if n.kind == "tool" and n.tool
        ]
        proposal = PlanProposal(
            scenario_id=tpl.scenario_id,
            title=tpl.title,
            steps=steps,
            documents=list(tpl.documents),
            tools=sorted({s.tool for s in steps if s.tool}),
            parameters=dict(tpl.parameters),
            graph_nodes=list(tpl.graph_nodes),
            graph_edges=list(tpl.graph_edges),
        )
        session.pending_plan = proposal
        session.pending_scenario_id = tpl.scenario_id

        msg = ChatMessage(
            type="plan_proposal",
            author="assistant",
            text=f"Подставил шаблон «{tpl.name}»: {tpl.title}. Проверьте и запустите.",
            payload=proposal.model_dump()
        )
        session.messages.append(msg)
        await self._broadcast_chat(session, msg)
        return session

    async def reject_plan(self, employee_id: str) -> ChatSession:
        session = session_manager.get_or_create(employee_id)
        plan = session.pending_plan
        session.pending_plan = None
        session.pending_scenario_id = None

        msg = ChatMessage(
            type="plan_rejected",
            author="user",
            text="План отклонён",
            payload={"plan_id": plan.plan_id if plan else None}
        )
        session.messages.append(msg)
        await self._broadcast_chat(session, msg)

        follow_up = ChatMessage(
            type="answer",
            author="assistant",
            text="Понял, план отменён. Уточните, что изменить — или выберите другой сценарий."
        )
        session.messages.append(follow_up)
        await self._broadcast_chat(session, follow_up)
        return session

    # ------------------ Приватные ------------------

    async def _handle_freeform(self, session: ChatSession, employee: Employee, text: str) -> None:
        """Свободный ввод — отвечаем LLM в роли сотрудника, без моковых сценариев."""

        # Плейсхолдер-сообщение «думает» — чтобы UX не ждал молча.
        thinking = ChatMessage(
            type="thinking",
            author="assistant",
            text="Думаю над вашим запросом…",
        )
        session.messages.append(thinking)
        await self._broadcast_chat(session, thinking)

        scenarios_hint = "\n".join(
            f"- {sc.title} (пресет: {sc.request})" for sc in employee.scenarios
        )
        system_prompt = (
            f"Ты — {employee.name}, {employee.role} в АО «Газпром Шельфпроект». "
            f"Твои обязанности: {'; '.join(employee.responsibilities or [])}. "
            "Ты общаешься с коллегой — дружелюбно, по-русски, по делу. "
            "Если запрос вне твоей зоны ответственности — честно скажи об этом и предложи "
            "обратиться к нужному сотруднику или подходящему пресету ниже. "
            "Ответ — не более 4–5 предложений, без выдумывания номеров документов и цифр, "
            "которые тебе не дали."
        )
        user_prompt = (
            f"Запрос пользователя:\n«{text}»\n\n"
            f"Мои готовые быстрые сценарии, которые можно предложить (выбери максимум 1–2 релевантных):\n"
            f"{scenarios_hint}\n\n"
            "Ответь коротко по существу. Если уместно — одним абзацем подскажи, что ты мог бы сделать, "
            "и какой из быстрых сценариев удобнее всего запустить."
        )

        try:
            answer = await asyncio.wait_for(
                llm_service.generate(
                    prompt=user_prompt,
                    system_prompt=system_prompt,
                    temperature=0.5,
                    max_tokens=400,
                ),
                timeout=35.0,
            )
            answer = (answer or "").strip()
        except asyncio.TimeoutError:
            logger.warning("LLM freeform timeout")
            answer = ""
        except Exception as e:  # pragma: no cover
            logger.exception(f"LLM freeform error: {e}")
            answer = ""

        if not answer:
            answer = (
                "Я прочитал ваш запрос, но не смог сформулировать надёжный ответ. "
                "Попробуйте уточнить задачу или выберите один из быстрых сценариев ниже — "
                "по ним я могу дать структурированный результат с источниками."
            )

        # Удаляем плейсхолдер
        if session.messages and session.messages[-1].id == thinking.id:
            session.messages.pop()

        msg = ChatMessage(
            type="answer",
            author="assistant",
            text=answer,
            payload={
                "freeform": True,
                "quick_actions": [
                    {"id": sc.id, "title": sc.title, "request": sc.request}
                    for sc in employee.scenarios
                ],
            },
        )
        session.messages.append(msg)
        await self._broadcast_chat(session, msg)

    def _build_plan_proposal(self, scenario: Scenario, extracted: Dict[str, str],
                              user_text: str) -> PlanProposal:
        steps = [PlanStep(**s.model_dump()) for s in scenario.plan.steps]

        params: Dict[str, Any] = dict(extracted)

        sid = scenario.id

        # --- Заявки ---
        if "application_number" not in params and sid.startswith("check_application_"):
            params["application_number"] = sid.rsplit("_", 1)[-1]

        # follow-up сценарии делопроизводителя: берём последнюю использованную заявку
        # из сессии (если вдруг пришли в новой сессии — fallback на №125/127).
        if sid in {"route_application_approval", "send_issues_to_initiator", "check_approval_status"}:
            params.setdefault("application_number", params.get("application_number") or "125")

        if sid == "list_applications_by_period":
            params.setdefault("period", params.get("period") or "апрель 2026")
            params.setdefault("filter_type", "any")

        # --- Договоры ---
        if "contract_number" not in params and sid == "analyze_contract_risks":
            params["contract_number"] = "Д-2026-001"
        if "contract_number" not in params and sid == "analyze_contract_repair":
            params["contract_number"] = "Д-2026-002"
        if "contract_number" not in params and sid == "translate_contract_clause":
            params["contract_number"] = "Д-2026-001"
        if sid == "prepare_disagreement_protocol":
            params.setdefault("contract_number", "Д-2026-001")

        # --- Письма / тексты ---
        if "letter_number" not in params and sid == "proofread_letter":
            params["letter_number"] = "Исх-45-2024"
        if sid == "apply_proofread_fixes":
            params.setdefault("letter_number", "Исх-45-2024")

        # --- Обращения ---
        if "appeal_number" not in params and sid.startswith("answer_appeal_"):
            params["appeal_number"] = sid.rsplit("_", 1)[-1].replace("-2026", "") + "-2026"

        # --- Подрядчики / КП ---
        if sid == "check_supplier":
            params.setdefault("supplier", "Морнефтегазсервис")
        if sid == "check_contractor":
            params.setdefault("supplier", params.get("supplier") or "ТехноСтрой")
        if sid == "compare_kp_repair_platform":
            params.setdefault("tender_id", "zkp_2026_045")
        if sid == "compare_kp_technical_supervision":
            params.setdefault("tender_id", "zkp_2026_028")
        if sid == "compare_kp_pipes":
            params.setdefault("tender_id", "zkp_2026_032")
        if sid == "create_kp_protocol":
            params.setdefault("tender_id", params.get("tender_id") or "zkp_2026_045")
        if sid == "request_kp_clarification":
            params.setdefault("tender_id", "zkp_2026_032")

        # --- Ассистент: сводки ---
        if sid == "compare_daily_summaries":
            params.setdefault("day_a", "20.04.2026")
            params.setdefault("day_b", "21.04.2026")

        # --- Заголовок плана ---
        title = scenario.plan.title
        if "application_number" in params and sid.startswith("check_application_"):
            title = f"Проверка комплектности заявки №{params['application_number']}"
        elif "contract_number" in params and "анализ" in title.lower():
            title = f"Правовой анализ договора {params['contract_number']}"
        elif "appeal_number" in params and sid.startswith("answer_appeal_"):
            title = f"Подготовка ответа на обращение №{params['appeal_number']}"

        graph_nodes, graph_edges = self._build_plan_graph(scenario, steps, params)

        proposal = PlanProposal(
            scenario_id=scenario.id,
            title=title,
            steps=steps,
            documents=list(scenario.plan.documents),
            tools=sorted({s.tool for s in steps}),
            parameters=params,
            graph_nodes=graph_nodes,
            graph_edges=graph_edges,
        )
        return proposal

    def _build_plan_graph(self, scenario: Scenario, steps: List[PlanStep],
                           params: Dict[str, Any]) -> tuple[List[PlanGraphNode], List[PlanGraphEdge]]:
        """Сборка планового графа из плоских шагов сценария.

        - Линейная цепочка step-0 -> step-1 -> ...
        - На первый узел-инструмент подвешиваем editable_params (ключи, релевантные
          сценарию) — UI будет править именно его.
        - Опциональный handoff-узел в конце, по умолчанию removed=True.
        """
        nodes: List[PlanGraphNode] = []
        editable_keys = self._editable_param_keys(scenario.id)
        first_tool_editable = {k: params[k] for k in editable_keys if k in params}

        for i, step in enumerate(steps):
            node = PlanGraphNode(
                id=f"step-{i}",
                name=step.name,
                icon=step.icon,
                tool=step.tool,
                source=step.source,
                kind="tool",
                editable_params=first_tool_editable if i == 0 else {},
            )
            nodes.append(node)

        edges: List[PlanGraphEdge] = []
        for i in range(len(nodes) - 1):
            edges.append(PlanGraphEdge(
                id=f"e-{i}-{i+1}",
                source=nodes[i].id,
                target=nodes[i + 1].id,
            ))

        handoff = self._default_handoff(scenario.id, params)
        if handoff and nodes:
            target_id, request_tpl, label = handoff
            hand_node = PlanGraphNode(
                id="handoff-next",
                name=label,
                icon="🤝",
                kind="handoff",
                editable_params={},
                removed=True,
                handoff_to_employee_id=target_id,
                handoff_request=request_tpl,
                source=f"Передача: {target_id}",
            )
            nodes.append(hand_node)
            edges.append(PlanGraphEdge(
                id=f"e-{len(nodes) - 2}-handoff",
                source=nodes[-2].id,
                target=hand_node.id,
            ))

        return nodes, edges

    _EDITABLE_PARAM_KEYS: Dict[str, List[str]] = {
        # По сценарию — список ключей `params`, которые имеют смысл редактировать
        "check_application_124": ["application_number"],
        "check_application_125": ["application_number"],
        "check_application_127": ["application_number"],
        "list_applications_by_period": ["period", "filter_type"],
        "route_application_approval": ["application_number"],
        "send_issues_to_initiator": ["application_number"],
        "check_approval_status": ["application_number"],
        "analyze_contract_risks": ["contract_number"],
        "analyze_contract_repair": ["contract_number"],
        "translate_contract_clause": ["contract_number"],
        "prepare_disagreement_protocol": ["contract_number"],
        "proofread_letter": ["letter_number"],
        "apply_proofread_fixes": ["letter_number"],
        "check_supplier": ["supplier"],
        "check_contractor": ["supplier"],
        "compare_kp_repair_platform": ["tender_id"],
        "compare_kp_technical_supervision": ["tender_id"],
        "compare_kp_pipes": ["tender_id"],
        "create_kp_protocol": ["tender_id"],
        "request_kp_clarification": ["tender_id"],
        "compare_daily_summaries": ["day_a", "day_b"],
    }

    def _editable_param_keys(self, scenario_id: str) -> List[str]:
        keys = self._EDITABLE_PARAM_KEYS.get(scenario_id, [])
        if keys:
            return keys
        # Фоллбек: если сценарий неизвестен — попадают самые частые ключи
        return ["application_number", "contract_number", "tender_id",
                "supplier", "letter_number", "appeal_number", "period"]

    def _default_handoff(self, scenario_id: str,
                          params: Dict[str, Any]) -> Optional[tuple[str, str, str]]:
        """Возвращает (target_employee_id, request_template, label) или None."""
        sid = scenario_id
        if sid.startswith("compare_kp_") or sid == "create_kp_protocol":
            tender = params.get("tender_id", "")
            tail = f" по тендеру {tender}" if tender else ""
            return (
                "lawyer",
                f"Проверь юридические риски в выбранном КП{tail} перед подписанием.",
                "Передать юристу на юр. проверку",
            )
        if sid.startswith("check_application_"):
            appno = params.get("application_number", "")
            tail = f" №{appno}" if appno else ""
            return (
                "lawyer",
                f"Проверь договорные условия в заявке{tail}.",
                "Передать юристу на проверку условий",
            )
        if sid.startswith("answer_appeal_"):
            appeal = params.get("appeal_number", "")
            tail = f" №{appeal}" if appeal else ""
            return (
                "lawyer",
                f"Вычитай формулировки проекта ответа на обращение{tail}.",
                "Передать юристу на вычитку",
            )
        if sid == "analyze_contract_risks":
            return (
                "procurement",
                "Подбери альтернативных подрядчиков с учётом найденных рисков.",
                "Передать закупщику",
            )
        return None

    def _materialize_plan(self, plan: PlanProposal) -> tuple[
            PlanProposal, set[int], Optional[PlanGraphNode]]:
        """Превращаем плановый граф (с правками пользователя) в исполнительный план.

        - Пропускаем узлы с `removed=True` — в steps они не попадают.
        - Собираем set индексов шагов (1-based), после которых нужна пауза.
        - Из editable_params всех активных узлов мёржим в parameters (на случай,
          если update_plan не был вызван).
        - Возвращаем активный handoff-узел (не-removed kind=handoff) или None.
        """
        # Если граф пуст — старое поведение: используем плоские steps.
        if not plan.graph_nodes:
            return plan, set(), None

        active_tool_nodes: List[PlanGraphNode] = []
        handoff_active: Optional[PlanGraphNode] = None
        pause_after_steps: set[int] = set()
        params = dict(plan.parameters)

        for node in plan.graph_nodes:
            if node.removed:
                continue
            for k, v in (node.editable_params or {}).items():
                params[k] = v
            if node.kind == "handoff":
                # Предполагаем один handoff-узел в конце — на всякий случай,
                # берём последний активный.
                handoff_active = node
            elif node.kind == "tool" and node.tool:
                active_tool_nodes.append(node)
                if node.pause_after:
                    # Индекс 1-based = порядковый номер среди активных tool-узлов.
                    pause_after_steps.add(len(active_tool_nodes))

        new_steps = [
            PlanStep(name=n.name, tool=n.tool or "", source=n.source, icon=n.icon)
            for n in active_tool_nodes
        ]
        materialized = PlanProposal(
            plan_id=plan.plan_id,
            scenario_id=plan.scenario_id,
            title=plan.title,
            steps=new_steps,
            documents=list(plan.documents),
            tools=sorted({s.tool for s in new_steps if s.tool}),
            parameters=params,
            graph_nodes=[],
            graph_edges=[],
        )
        return materialized, pause_after_steps, handoff_active

    async def _run_and_finish(self, session: ChatSession, employee: Employee,
                               scenario: Scenario, plan: PlanProposal,
                               pause_after_steps: Optional[set[int]] = None,
                               handoff: Optional[PlanGraphNode] = None) -> None:
        started = time.time()
        user_text = ""
        for m in reversed(session.messages):
            if m.type == "user":
                user_text = m.text
                break

        pauses = pause_after_steps or set()

        async def on_pause(step_index: int) -> None:
            """Вызывается оркестратором после указанных шагов. Ждёт resume."""
            event = asyncio.Event()
            self._pause_events[session.id] = event
            paused_msg = ChatMessage(
                type="plan_paused",
                author="assistant",
                text=f"Остановился после шага {step_index}. Проверьте промежуточный результат и нажмите «Продолжить».",
                payload={"plan_id": plan.plan_id, "step_index": step_index},
            )
            session.messages.append(paused_msg)
            await self._broadcast_chat(session, paused_msg)
            try:
                await event.wait()
            finally:
                self._pause_events.pop(session.id, None)

        try:
            shared = await plan_orchestrator.execute(
                plan=plan,
                session=session,
                employee_id=employee.id,
                employee_color=employee.color,
                user_text=user_text,
                pause_after_steps=pauses,
                on_pause=on_pause if pauses else None,
            )
        except Exception as e:
            logger.exception("Ошибка исполнения плана")
            err_msg = ChatMessage(
                type="error",
                author="assistant",
                text=f"Ошибка при выполнении плана: {e}"
            )
            session.messages.append(err_msg)
            await self._broadcast_chat(session, err_msg)
            return

        duration_ms = int((time.time() - started) * 1000)
        result: TaskResult = build_result(scenario, shared, employee.id, duration_ms)

        # Если пользователь включил handoff-узел — добавляем его первым в
        # список проактивных предложений (подсвечен как handoff).
        if handoff and handoff.handoff_to_employee_id:
            result.proactive.insert(0, ProactiveSuggestion(
                label=handoff.name,
                request=handoff.handoff_request or "Продолжи работу по задаче.",
                target_employee_id=handoff.handoff_to_employee_id,
            ))

        for doc in result.documents_created:
            session.documents_created.append(doc)
            await ws_manager.send_document_created(
                session.last_workflow_id or "",
                document_type=doc.get("type", "документ"),
                document_id=doc.get("id", ""),
                document_data=doc
            )

        msg = ChatMessage(
            type="result",
            author="assistant",
            text=result.summary,
            payload=result.model_dump()
        )
        session.messages.append(msg)
        await self._broadcast_chat(session, msg)

        await ws_manager.send_workflow_completed(
            session.last_workflow_id or "",
            success=True,
            result={"scenario_id": scenario.id, "duration_ms": duration_ms}
        )

    async def _broadcast_chat(self, session: ChatSession, message: ChatMessage) -> None:
        await ws_manager.broadcast({
            "type": "chat_message",
            "timestamp": datetime.now().isoformat(),
            "data": {
                "session_id": session.id,
                "employee_id": session.employee_id,
                "message": {
                    "id": message.id,
                    "timestamp": message.timestamp.isoformat(),
                    "type": message.type,
                    "author": message.author,
                    "text": message.text,
                    "payload": message.payload,
                }
            }
        })


chat_service = ChatService()

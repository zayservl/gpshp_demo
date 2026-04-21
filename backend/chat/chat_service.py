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
from backend.chat.result_builder import build_result
from backend.chat.session_manager import session_manager
from backend.employees import employee_registry
from backend.models.chat import (
    ChatMessage, ChatSession, ClarifyingQuestion, PlanProposal,
    SendMessageRequest, TaskResult
)
from backend.models.employee import Employee, PlanStep, Scenario
from backend.services.llm_service import llm_service
from backend.websocket.manager import ws_manager


class ChatService:
    """Фасад диалога с сотрудником"""

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

        confirm_msg = ChatMessage(
            type="plan_approved",
            author="user",
            text="Подтверждаю план",
            payload={"plan_id": plan.plan_id}
        )
        session.messages.append(confirm_msg)
        await self._broadcast_chat(session, confirm_msg)

        running_msg = ChatMessage(
            type="running",
            author="assistant",
            text=f"Приступаю к выполнению: {plan.title}",
            payload={"plan_id": plan.plan_id}
        )
        session.messages.append(running_msg)
        await self._broadcast_chat(session, running_msg)

        # Исполняем план. Делаем в background, чтобы HTTP-запрос вернулся сразу,
        # а события шли через WebSocket.
        plan_to_run = plan
        session.pending_plan = None
        asyncio.create_task(self._run_and_finish(session, employee, scenario, plan_to_run))

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

        proposal = PlanProposal(
            scenario_id=scenario.id,
            title=title,
            steps=steps,
            documents=list(scenario.plan.documents),
            tools=sorted({s.tool for s in steps}),
            parameters=params,
        )
        return proposal

    async def _run_and_finish(self, session: ChatSession, employee: Employee,
                               scenario: Scenario, plan: PlanProposal) -> None:
        started = time.time()
        user_text = ""
        for m in reversed(session.messages):
            if m.type == "user":
                user_text = m.text
                break
        try:
            shared = await plan_orchestrator.execute(
                plan=plan,
                session=session,
                employee_id=employee.id,
                employee_color=employee.color,
                user_text=user_text,
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

        # Фиксируем созданные документы в сессии
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

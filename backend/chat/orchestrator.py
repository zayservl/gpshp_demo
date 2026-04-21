"""
Оркестратор исполнения плана сотрудника.

Берёт PlanProposal, строит WorkflowGraph, последовательно выполняет шаги
через tool_registry и отправляет WebSocket-события в реальном времени.
"""
from __future__ import annotations
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

from loguru import logger

from backend.models.chat import PlanProposal, ChatSession
from backend.models.workflow import (
    WorkflowGraph, WorkflowNode, WorkflowEdge, NodeStatus, NodeType
)
from backend.tools import tool_registry
from backend.tools.registry import ToolContext
from backend.websocket.manager import ws_manager


class PlanOrchestrator:
    """Исполнитель плана: прогоняет steps, эмитит события."""

    def __init__(self) -> None:
        self._active_workflows: Dict[str, WorkflowGraph] = {}

    def get_workflow(self, workflow_id: str) -> Optional[WorkflowGraph]:
        return self._active_workflows.get(workflow_id)

    def build_workflow(self, plan: PlanProposal, employee_color: str) -> WorkflowGraph:
        nodes: List[WorkflowNode] = []
        edges: List[WorkflowEdge] = []

        # Стартовый узел «Запрос пользователя»
        start_id = "node_start"
        nodes.append(WorkflowNode(
            id=start_id,
            name="Запрос",
            type=NodeType.DATA,
            description="Запрос пользователя",
            icon="💬",
            color="#64748b",
            status=NodeStatus.COMPLETED,
        ))

        prev_id = start_id
        for i, step in enumerate(plan.steps, 1):
            node_id = f"node_{i}"
            nodes.append(WorkflowNode(
                id=node_id,
                name=step.name,
                type=NodeType.EXECUTOR_AGENT,
                description=f"Инструмент: {step.tool} · Источник: {step.source}",
                icon=step.icon,
                color=employee_color,
                status=NodeStatus.PENDING,
                config={"tool": step.tool, "source": step.source}
            ))
            edges.append(WorkflowEdge(
                id=f"edge_{prev_id}_{node_id}",
                source=prev_id,
                target=node_id
            ))
            prev_id = node_id

        # Финальный узел «Результат»
        final_id = "node_final"
        nodes.append(WorkflowNode(
            id=final_id,
            name="Результат",
            type=NodeType.DATA,
            description="Структурированный ответ сотрудника",
            icon="📦",
            color="#10b981",
            status=NodeStatus.PENDING,
        ))
        edges.append(WorkflowEdge(id=f"edge_{prev_id}_{final_id}", source=prev_id, target=final_id))

        workflow = WorkflowGraph(
            id=plan.plan_id,
            name=plan.title,
            description=f"План сотрудника: {len(plan.steps)} шагов",
            nodes=nodes,
            edges=edges
        )
        self._active_workflows[workflow.id] = workflow
        return workflow

    async def execute(
        self,
        plan: PlanProposal,
        session: ChatSession,
        employee_id: str,
        employee_color: str,
        user_text: str,
    ) -> Dict[str, Any]:
        """Исполнить план, возвращает shared-состояние (для построения результата)."""
        workflow = self.build_workflow(plan, employee_color)
        session.last_workflow_id = workflow.id

        # 1. Публикуем пустой workflow
        workflow.status = NodeStatus.RUNNING
        await ws_manager.send_workflow_update(workflow)
        await ws_manager.send_log_entry(workflow.id, "INFO", "Оркестратор",
                                         f"Запущен план: {plan.title}")
        await self._emit_reasoning(workflow.id, "planning",
                                   "План построен",
                                   f"Собран план из {len(plan.steps)} шагов. Инструменты: "
                                   + ", ".join({s.tool for s in plan.steps}))

        shared: Dict[str, Any] = {}
        # Добавим извлечённые сущности, если положили в plan.documents как hint
        # (реальная привязка идёт через ChatService)

        # 2. Исполняем шаги
        for i, step in enumerate(plan.steps, 1):
            node_id = f"node_{i}"
            node = next(n for n in workflow.nodes if n.id == node_id)

            # started
            node.status = NodeStatus.RUNNING
            started_at = time.time()
            await ws_manager.send_node_status_update(workflow.id, node_id, NodeStatus.RUNNING)
            await ws_manager.send_log_entry(workflow.id, "INFO", step.tool,
                                             f"Шаг {i}/{len(plan.steps)}: {step.name}")
            await self._emit_reasoning(workflow.id, "step",
                                       f"Шаг {i}: {step.name}",
                                       f"Использую инструмент «{step.tool}». Источник: {step.source}.")

            # Вызываем инструмент
            ctx = ToolContext(
                workflow_id=workflow.id,
                employee_id=employee_id,
                scenario_id=plan.scenario_id or "",
                user_text=user_text,
                shared=shared,
                parameters=dict(plan.parameters),
            )
            try:
                result = await tool_registry.call(step.tool, ctx)
                duration_ms = int((time.time() - started_at) * 1000)
                node.status = NodeStatus.COMPLETED
                node.duration_ms = duration_ms
                node.output_data = result
                await ws_manager.send_node_status_update(
                    workflow.id, node_id, NodeStatus.COMPLETED,
                    output_data=result, duration_ms=duration_ms
                )
                await ws_manager.send_log_entry(workflow.id, "INFO", step.tool,
                                                 f"Шаг {i} завершён за {duration_ms} мс",
                                                 data={"result_summary": self._summarize(result)})
            except Exception as e:  # pragma: no cover
                logger.exception("Tool execution failed")
                node.status = NodeStatus.FAILED
                node.error = str(e)
                await ws_manager.send_node_status_update(
                    workflow.id, node_id, NodeStatus.FAILED, error=str(e)
                )
                workflow.status = NodeStatus.FAILED
                await ws_manager.send_workflow_completed(workflow.id, False, {"error": str(e)})
                raise

        # 3. Финализируем
        final = next(n for n in workflow.nodes if n.id == "node_final")
        final.status = NodeStatus.COMPLETED
        await ws_manager.send_node_status_update(workflow.id, "node_final", NodeStatus.COMPLETED)
        workflow.status = NodeStatus.COMPLETED

        return shared

    @staticmethod
    def _summarize(result: Dict[str, Any]) -> Dict[str, Any]:
        """Короткая сводка для лога (без громоздких полей)"""
        out = {}
        for k, v in result.items():
            if isinstance(v, (int, float, bool, str)):
                out[k] = v
            elif isinstance(v, list):
                out[k] = f"[{len(v)} элементов]"
            else:
                out[k] = "…"
        return out

    @staticmethod
    async def _emit_reasoning(workflow_id: str, stage: str, title: str, content: str,
                              details: Optional[Dict[str, Any]] = None) -> None:
        """Отправляем событие рассуждения в WebSocket (для панели Логи ИИ)"""
        await ws_manager.broadcast({
            "type": "agent_reasoning",
            "timestamp": datetime.now().isoformat(),
            "data": {
                "workflow_id": workflow_id,
                "stage": stage,
                "title": title,
                "content": content,
                "details": details or {}
            }
        }, workflow_id)


plan_orchestrator = PlanOrchestrator()

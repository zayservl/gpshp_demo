"""
Модели для чата с AI-сотрудником: сообщения, планы, события.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime
import uuid

from backend.models.employee import PlanStep, ProactiveSuggestion


MessageType = Literal[
    "welcome",
    "user",
    "answer",
    "thinking",
    "clarifying_question",
    "plan_proposal",
    "plan_approved",
    "plan_rejected",
    "plan_paused",
    "plan_resumed",
    "running",
    "result",
    "error"
]


NodeKind = Literal["tool", "data", "handoff", "result"]


class PlanGraphNode(BaseModel):
    """Узел планового графа (editable, до запуска).

    Отличается от WorkflowNode тем, что поддерживает пользовательские
    правки: removed, pause_after, editable_params.
    """
    id: str
    name: str
    icon: str = "⚙️"
    tool: Optional[str] = None
    source: str = "—"
    kind: NodeKind = "tool"
    # Параметры, которые пользователь может подменить до запуска
    editable_params: Dict[str, Any] = Field(default_factory=dict)
    # Пользователь пометил узел как удалённый — в исполнении пропустим (skipped)
    removed: bool = False
    # После этого узла остановиться и дождаться resume
    pause_after: bool = False
    # Для handoff-узлов: кому передаём задачу
    handoff_to_employee_id: Optional[str] = None
    handoff_request: Optional[str] = None
    # Опционально: конкретный сценарий у принимающего сотрудника.
    # Если указан — при handoff следующий AI сразу начнёт этот сценарий,
    # не полагаясь на keyword-классификатор.
    handoff_scenario_id: Optional[str] = None


class PlanGraphEdge(BaseModel):
    """Ребро планового графа"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    source: str
    target: str


class ChatMessage(BaseModel):
    """Сообщение в чате (пользователь или AI)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    timestamp: datetime = Field(default_factory=datetime.now)
    type: MessageType
    author: Literal["user", "assistant", "system"] = "assistant"
    text: str = ""
    # Для payload-сообщений (план, результат, уточнение и т.п.)
    payload: Optional[Dict[str, Any]] = None


class PlanProposal(BaseModel):
    """Предложенный план — отправляется на согласование пользователю.

    Содержит и плоский список `steps` (для обратной совместимости с чат-блоком),
    и графовую форму `graph_nodes`/`graph_edges` — источник истины при
    материализации в исполнительный workflow.
    """
    plan_id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    scenario_id: Optional[str] = None
    title: str
    steps: List[PlanStep]
    documents: List[str] = Field(default_factory=list)
    tools: List[str] = Field(default_factory=list)
    parameters: Dict[str, Any] = Field(default_factory=dict)
    graph_nodes: List[PlanGraphNode] = Field(default_factory=list)
    graph_edges: List[PlanGraphEdge] = Field(default_factory=list)


class ClarifyingQuestion(BaseModel):
    """Уточняющий вопрос от сотрудника"""
    scenario_id: Optional[str] = None
    question: str
    suggestions: List[str] = Field(default_factory=list)


class TaskResult(BaseModel):
    """Структурированный результат выполнения сценария"""
    scenario_id: str
    title: str
    summary: str
    artifact: Dict[str, Any] = Field(default_factory=dict)
    sources: List[str] = Field(default_factory=list)
    documents_created: List[Dict[str, Any]] = Field(default_factory=list)
    proactive: List[ProactiveSuggestion] = Field(default_factory=list)
    duration_ms: int = 0


class SendMessageRequest(BaseModel):
    """Запрос: пользователь отправил сообщение в чат"""
    text: str
    scenario_id: Optional[str] = None  # если пользователь нажал пресет
    # Метка handoff: откуда пришёл запрос (для приветственной ремарки при передаче
    # задачи от другого AI-сотрудника).
    handoff_from: Optional[str] = None


class PlanUpdateRequest(BaseModel):
    """Запрос: пользователь отредактировал плановый граф"""
    graph_nodes: List[PlanGraphNode]
    graph_edges: List[PlanGraphEdge] = Field(default_factory=list)


class PlanTemplateSaveRequest(BaseModel):
    """Запрос: сохранить текущий pending_plan в реестр шаблонов"""
    name: str


class PlanTemplate(BaseModel):
    """Сохранённый шаблон планового графа"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    employee_id: str
    name: str
    scenario_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now)
    title: str
    graph_nodes: List[PlanGraphNode]
    graph_edges: List[PlanGraphEdge] = Field(default_factory=list)
    parameters: Dict[str, Any] = Field(default_factory=dict)
    documents: List[str] = Field(default_factory=list)


class ChatSession(BaseModel):
    """Сессия чата с сотрудником (in-memory)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    employee_id: str
    created_at: datetime = Field(default_factory=datetime.now)
    messages: List[ChatMessage] = Field(default_factory=list)
    pending_plan: Optional[PlanProposal] = None
    pending_scenario_id: Optional[str] = None
    pending_clarify: Optional[ClarifyingQuestion] = None
    last_workflow_id: Optional[str] = None
    # Активная пауза исполнения (после plan_paused). Внутри — event, на котором
    # ждёт воркер; сюда не сериализуется (Field(exclude=True) через __init__).
    paused_event_key: Optional[str] = None
    documents_created: List[Dict[str, Any]] = Field(default_factory=list)


class AgentReasoningEvent(BaseModel):
    """Событие «мышления» агента (для панели Логи ИИ)"""
    workflow_id: str
    timestamp: datetime = Field(default_factory=datetime.now)
    stage: Literal["intent", "clarification", "planning", "step", "generation", "decision"]
    title: str
    content: str
    details: Optional[Dict[str, Any]] = None

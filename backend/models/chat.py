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
    "running",
    "result",
    "error"
]


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
    """Предложенный план — отправляется на согласование пользователю"""
    plan_id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    scenario_id: Optional[str] = None
    title: str
    steps: List[PlanStep]
    documents: List[str] = Field(default_factory=list)
    tools: List[str] = Field(default_factory=list)
    # Извлечённые сущности для прокидывания в инструменты
    parameters: Dict[str, Any] = Field(default_factory=dict)


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
    documents_created: List[Dict[str, Any]] = Field(default_factory=list)


class AgentReasoningEvent(BaseModel):
    """Событие «мышления» агента (для панели Логи ИИ)"""
    workflow_id: str
    timestamp: datetime = Field(default_factory=datetime.now)
    stage: Literal["intent", "clarification", "planning", "step", "generation", "decision"]
    title: str
    content: str
    details: Optional[Dict[str, Any]] = None

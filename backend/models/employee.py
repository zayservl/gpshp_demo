"""
Модели AI-сотрудников и сценариев
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Literal


class ToolInfo(BaseModel):
    """Инструмент AI-сотрудника"""
    name: str
    label: str
    icon: str = "🔧"


class PlanStep(BaseModel):
    """Шаг плана действий"""
    name: str
    tool: str
    source: str = "—"
    icon: str = "⚙️"


class PlanTemplate(BaseModel):
    """Шаблон плана действий сотрудника"""
    title: str
    steps: List[PlanStep]
    documents: List[str] = Field(default_factory=list)


class ClarifyingTemplate(BaseModel):
    """Шаблон уточняющего вопроса"""
    question: str
    suggestions: List[str] = Field(default_factory=list)


class ProactiveSuggestion(BaseModel):
    """Проактивное предложение следующего шага.

    - scenario_id: прямое указание, какой сценарий запустить (без classify).
    - target_employee_id: если задан → это handoff: задачу подхватит другой AI-сотрудник.
    """
    label: str
    request: str
    scenario_id: Optional[str] = None
    target_employee_id: Optional[str] = None


class Scenario(BaseModel):
    """Сценарий (пресет) сотрудника"""
    id: str
    title: str
    category: str = "general"
    request: str
    clarify: Optional[ClarifyingTemplate] = None
    plan: PlanTemplate
    proactive: List[ProactiveSuggestion] = Field(default_factory=list)


class Employee(BaseModel):
    """AI-сотрудник"""
    id: str
    name: str
    short_name: str
    role: str
    avatar: str = "🤖"
    color: str = "#00d4ff"
    status: Literal["active", "inactive"] = "active"
    description: str
    responsibilities: List[str] = Field(default_factory=list)
    tools: List[ToolInfo] = Field(default_factory=list)
    scenarios: List[Scenario] = Field(default_factory=list)

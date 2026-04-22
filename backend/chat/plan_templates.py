"""
In-memory реестр шаблонов планового графа.

Пользователь сохраняет согласованный (возможно, отредактированный) план как
шаблон → в следующий раз одним кликом подставляет его в текущую сессию.

MVP: хранится только в памяти процесса, без персистентности.
"""
from __future__ import annotations
from typing import Dict, List, Optional

from backend.models.chat import PlanTemplate


class PlanTemplateRegistry:
    def __init__(self) -> None:
        self._by_employee: Dict[str, List[PlanTemplate]] = {}

    def save(self, template: PlanTemplate) -> PlanTemplate:
        bucket = self._by_employee.setdefault(template.employee_id, [])
        # Если шаблон с таким именем уже есть — перезаписываем (по name).
        for i, existing in enumerate(bucket):
            if existing.name == template.name:
                bucket[i] = template
                return template
        bucket.insert(0, template)
        return template

    def list_for(self, employee_id: str) -> List[PlanTemplate]:
        return list(self._by_employee.get(employee_id, []))

    def get(self, employee_id: str, template_id: str) -> Optional[PlanTemplate]:
        for t in self._by_employee.get(employee_id, []):
            if t.id == template_id:
                return t
        return None

    def delete(self, employee_id: str, template_id: str) -> bool:
        bucket = self._by_employee.get(employee_id, [])
        before = len(bucket)
        self._by_employee[employee_id] = [t for t in bucket if t.id != template_id]
        return len(self._by_employee[employee_id]) < before


plan_template_registry = PlanTemplateRegistry()

"""
Реестр AI-сотрудников: загрузка из data/employees.json и доступ по id.
"""
import json
from pathlib import Path
from typing import Dict, List, Optional
from loguru import logger

from backend.models.employee import Employee


DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


class EmployeeRegistry:
    """In-memory реестр сотрудников"""

    def __init__(self) -> None:
        self._employees: Dict[str, Employee] = {}
        self._loaded = False

    def load(self) -> None:
        path = DATA_DIR / "employees.json"
        if not path.exists():
            logger.error(f"employees.json не найден по пути {path}")
            return
        with open(path, "r", encoding="utf-8") as f:
            raw = json.load(f)
        for item in raw.get("employees", []):
            emp = Employee(**item)
            self._employees[emp.id] = emp
        self._loaded = True
        logger.info(f"Загружено AI-сотрудников: {len(self._employees)}")

    def ensure_loaded(self) -> None:
        if not self._loaded:
            self.load()

    def list(self) -> List[Employee]:
        self.ensure_loaded()
        return list(self._employees.values())

    def get(self, employee_id: str) -> Optional[Employee]:
        self.ensure_loaded()
        return self._employees.get(employee_id)


employee_registry = EmployeeRegistry()

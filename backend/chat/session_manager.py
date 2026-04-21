"""
In-memory менеджер сессий чата: одна активная сессия на сотрудника.
"""
from typing import Dict, List, Optional

from backend.models.chat import ChatSession


class SessionManager:
    def __init__(self) -> None:
        # Одна активная сессия на сотрудника (для демо достаточно)
        self._sessions: Dict[str, ChatSession] = {}

    def get_or_create(self, employee_id: str) -> ChatSession:
        if employee_id not in self._sessions:
            self._sessions[employee_id] = ChatSession(employee_id=employee_id)
        return self._sessions[employee_id]

    def reset(self, employee_id: str) -> ChatSession:
        self._sessions[employee_id] = ChatSession(employee_id=employee_id)
        return self._sessions[employee_id]

    def list_employees_with_sessions(self) -> List[str]:
        return list(self._sessions.keys())

    def by_workflow(self, workflow_id: str) -> Optional[ChatSession]:
        for s in self._sessions.values():
            if s.last_workflow_id == workflow_id:
                return s
        return None


session_manager = SessionManager()

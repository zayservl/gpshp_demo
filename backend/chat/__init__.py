"""Пакет чата с AI-сотрудниками"""
from .session_manager import session_manager, SessionManager
from .chat_service import chat_service, ChatService

__all__ = ["session_manager", "SessionManager", "chat_service", "ChatService"]

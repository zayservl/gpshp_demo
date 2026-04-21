"""
WebSocket менеджер для real-time обновлений состояния агентов
"""
import json
from typing import Dict, List, Any, Optional
from fastapi import WebSocket
from loguru import logger
from datetime import datetime

from backend.models.workflow import WorkflowGraph, WorkflowNode, WorkflowMessage, NodeStatus


class ConnectionManager:
    """Менеджер WebSocket соединений"""
    
    def __init__(self):
        # Активные соединения по workflow_id
        self.active_connections: Dict[str, List[WebSocket]] = {}
        # Все соединения
        self.all_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket, workflow_id: Optional[str] = None):
        """Подключение нового клиента"""
        await websocket.accept()
        self.all_connections.append(websocket)
        
        if workflow_id:
            if workflow_id not in self.active_connections:
                self.active_connections[workflow_id] = []
            self.active_connections[workflow_id].append(websocket)
        
        logger.info(f"WebSocket connected. Total: {len(self.all_connections)}")
    
    def disconnect(self, websocket: WebSocket, workflow_id: Optional[str] = None):
        """Отключение клиента"""
        if websocket in self.all_connections:
            self.all_connections.remove(websocket)
        
        if workflow_id and workflow_id in self.active_connections:
            if websocket in self.active_connections[workflow_id]:
                self.active_connections[workflow_id].remove(websocket)
        
        logger.info(f"WebSocket disconnected. Total: {len(self.all_connections)}")
    
    async def send_personal(self, websocket: WebSocket, message: dict):
        """Отправка сообщения конкретному клиенту"""
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Error sending personal message: {e}")
    
    async def broadcast(self, message: dict, workflow_id: Optional[str] = None):
        """Широковещательная отправка"""
        connections = self.all_connections
        if workflow_id and workflow_id in self.active_connections:
            connections = self.active_connections[workflow_id]
        
        disconnected = []
        for connection in connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting: {e}")
                disconnected.append(connection)
        
        # Удаляем отключённые соединения
        for conn in disconnected:
            self.disconnect(conn, workflow_id)
    
    # ==================== Специализированные методы ====================
    
    async def send_workflow_update(self, workflow: WorkflowGraph):
        """Отправка обновления workflow"""
        message = {
            "type": "workflow_update",
            "timestamp": datetime.now().isoformat(),
            "data": {
                "workflow_id": workflow.id,
                "name": workflow.name,
                "description": workflow.description,
                "status": workflow.status.value,
                "nodes": [
                    {
                        "id": node.id,
                        "name": node.name,
                        "type": node.type.value,
                        "status": node.status.value,
                        "color": node.color,
                        "icon": node.icon,
                        "description": node.description,
                        "duration_ms": node.duration_ms,
                        "config": node.config  # Include full config
                    }
                    for node in workflow.nodes
                ],
                "edges": [
                    {
                        "id": edge.id,
                        "source": edge.source,
                        "target": edge.target,
                        "label": edge.label,
                        "type": edge.type
                    }
                    for edge in workflow.edges
                ]
            }
        }
        await self.broadcast(message, workflow.id)
    
    async def send_node_status_update(
        self, 
        workflow_id: str, 
        node_id: str, 
        status: NodeStatus,
        output_data: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
        duration_ms: Optional[int] = None
    ):
        """Отправка обновления статуса узла"""
        message = {
            "type": "node_status",
            "timestamp": datetime.now().isoformat(),
            "data": {
                "workflow_id": workflow_id,
                "node_id": node_id,
                "status": status.value,
                "output_data": output_data,
                "error": error,
                "duration_ms": duration_ms
            }
        }
        await self.broadcast(message, workflow_id)
    
    async def send_agent_message(self, message: WorkflowMessage):
        """Отправка сообщения между агентами для трассировки"""
        ws_message = {
            "type": "agent_message",
            "timestamp": message.timestamp.isoformat(),
            "data": {
                "message_id": message.id,
                "workflow_id": message.workflow_id,
                "source_agent": message.source_agent,
                "target_agent": message.target_agent,
                "message_type": message.message_type,
                "content": message.content
            }
        }
        await self.broadcast(ws_message, message.workflow_id)
    
    async def send_log_entry(
        self, 
        workflow_id: str,
        level: str,
        agent: str,
        message: str,
        data: Optional[Dict[str, Any]] = None
    ):
        """Отправка лог-записи"""
        log_message = {
            "type": "log",
            "timestamp": datetime.now().isoformat(),
            "data": {
                "workflow_id": workflow_id,
                "level": level,
                "agent": agent,
                "message": message,
                "data": data
            }
        }
        await self.broadcast(log_message, workflow_id)
    
    async def send_document_created(
        self,
        workflow_id: str,
        document_type: str,
        document_id: str,
        document_data: Dict[str, Any]
    ):
        """Отправка уведомления о созданном документе"""
        message = {
            "type": "document_created",
            "timestamp": datetime.now().isoformat(),
            "data": {
                "workflow_id": workflow_id,
                "document_type": document_type,
                "document_id": document_id,
                "document": document_data
            }
        }
        await self.broadcast(message, workflow_id)
    
    async def send_approval_update(
        self,
        workflow_id: str,
        approver_name: str,
        status: str,
        comment: Optional[str] = None
    ):
        """Отправка обновления статуса согласования"""
        message = {
            "type": "approval_update",
            "timestamp": datetime.now().isoformat(),
            "data": {
                "workflow_id": workflow_id,
                "approver_name": approver_name,
                "status": status,
                "comment": comment
            }
        }
        await self.broadcast(message, workflow_id)
    
    async def send_workflow_completed(
        self,
        workflow_id: str,
        success: bool,
        result: Dict[str, Any]
    ):
        """Отправка уведомления о завершении workflow"""
        message = {
            "type": "workflow_completed",
            "timestamp": datetime.now().isoformat(),
            "data": {
                "workflow_id": workflow_id,
                "success": success,
                "result": result
            }
        }
        await self.broadcast(message, workflow_id)
    
    async def send_integration_request(
        self,
        workflow_id: str,
        system: str,
        endpoint: str,
        request_data: Optional[Dict[str, Any]] = None
    ):
        """Отправка уведомления о запросе к внешней системе"""
        message = {
            "type": "integration_request",
            "timestamp": datetime.now().isoformat(),
            "data": {
                "workflow_id": workflow_id,
                "system": system,
                "endpoint": endpoint,
                "request_data": request_data
            }
        }
        await self.broadcast(message, workflow_id)
    
    async def send_integration_response(
        self,
        workflow_id: str,
        system: str,
        duration_ms: int,
        result: str,
        response_data: Optional[Dict[str, Any]] = None
    ):
        """Отправка уведомления об ответе от внешней системы"""
        message = {
            "type": "integration_response",
            "timestamp": datetime.now().isoformat(),
            "data": {
                "workflow_id": workflow_id,
                "system": system,
                "duration_ms": duration_ms,
                "result": result,
                "response_data": response_data
            }
        }
        await self.broadcast(message, workflow_id)
    
    async def send_context_update(
        self,
        workflow_id: str,
        context: Dict[str, Any]
    ):
        """Отправка обновления контекста выполнения"""
        # Фильтруем большие данные для передачи
        filtered_context = {}
        for key, value in context.items():
            if key == 'request':
                continue  # Пропускаем сырой запрос
            if isinstance(value, dict) and len(str(value)) > 5000:
                # Для больших объектов передаём только summary
                filtered_context[key] = {
                    "_type": "large_object",
                    "_keys": list(value.keys())[:10],
                    "_size": len(str(value))
                }
            else:
                filtered_context[key] = value
        
        message = {
            "type": "context_update",
            "timestamp": datetime.now().isoformat(),
            "data": filtered_context
        }
        await self.broadcast(message, workflow_id)


# Singleton instance
ws_manager = ConnectionManager()

"""
Модели для Workflow и графов выполнения
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Literal
from enum import Enum
from datetime import datetime
import uuid


class NodeStatus(str, Enum):
    """Статус узла в графе"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class NodeType(str, Enum):
    """Тип узла"""
    LLM_AGENT = "llm_agent"
    DATA_AGENT = "data_agent"
    EXECUTOR_AGENT = "executor_agent"
    ROUTER = "router"
    GUARDRAIL = "guardrail"
    DATA = "data"


class WorkflowNode(BaseModel):
    """Узел в графе выполнения"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    name: str
    type: NodeType
    description: str = ""
    status: NodeStatus = NodeStatus.PENDING
    
    # Визуальные параметры
    color: str = "gray"
    icon: str = "⚙️"
    
    # Параметры выполнения
    config: Dict[str, Any] = Field(default_factory=dict)
    
    # Результаты
    input_data: Optional[Dict[str, Any]] = None
    output_data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    
    # Время
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None


class WorkflowEdge(BaseModel):
    """Связь между узлами"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    source: str  # ID исходного узла
    target: str  # ID целевого узла
    label: str = ""
    type: Literal["data_flow", "control_flow", "context"] = "data_flow"
    condition: Optional[str] = None


class WorkflowGraph(BaseModel):
    """Граф выполнения workflow"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    
    nodes: List[WorkflowNode] = Field(default_factory=list)
    edges: List[WorkflowEdge] = Field(default_factory=list)
    
    # Метаданные
    created_at: datetime = Field(default_factory=datetime.now)
    status: NodeStatus = NodeStatus.PENDING
    
    # Контекст выполнения
    context: Dict[str, Any] = Field(default_factory=dict)
    
    def get_node(self, node_id: str) -> Optional[WorkflowNode]:
        """Получить узел по ID"""
        for node in self.nodes:
            if node.id == node_id:
                return node
        return None
    
    def get_next_nodes(self, node_id: str) -> List[WorkflowNode]:
        """Получить следующие узлы после данного"""
        next_ids = [edge.target for edge in self.edges if edge.source == node_id]
        return [node for node in self.nodes if node.id in next_ids]
    
    def get_root_nodes(self) -> List[WorkflowNode]:
        """Получить начальные узлы (без входящих связей)"""
        targets = {edge.target for edge in self.edges}
        return [node for node in self.nodes if node.id not in targets]


class WorkflowMessage(BaseModel):
    """Сообщение между агентами"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    timestamp: datetime = Field(default_factory=datetime.now)
    
    source_agent: str
    target_agent: str
    
    message_type: Literal["request", "response", "notification", "error"] = "request"
    content: Dict[str, Any] = Field(default_factory=dict)
    
    # Для трассировки
    workflow_id: str = ""
    trace_id: str = ""


class UserRequest(BaseModel):
    """Запрос пользователя"""
    text: str = Field(..., description="Текст запроса пользователя")
    contract_id: Optional[str] = Field(None, description="ID договора (если известен)")
    period: Optional[str] = Field(None, description="Отчётный период (например, 'январь 2025')")
    context: Dict[str, Any] = Field(default_factory=dict)


class WorkflowResult(BaseModel):
    """Результат выполнения workflow"""
    workflow_id: str
    status: NodeStatus
    
    # Результаты
    documents_created: List[str] = Field(default_factory=list)
    total_amount: Optional[float] = None
    
    # Статистика
    total_duration_ms: int = 0
    agents_executed: int = 0
    
    # Ошибки
    errors: List[str] = Field(default_factory=list)
    
    # Полный граф для отображения
    final_graph: Optional[WorkflowGraph] = None

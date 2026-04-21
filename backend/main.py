"""
FastAPI приложение — платформа AI-сотрудников ГШП.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from loguru import logger

from backend.config import settings
from backend.services.llm_service import llm_service
from backend.websocket.manager import ws_manager
from backend.employees import employee_registry
from backend.chat.orchestrator import plan_orchestrator
from backend.routers import employees as employees_router
from backend.routers import chat as chat_router
from backend.routers import documents as documents_router


# ==================== Lifespan ====================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Жизненный цикл приложения"""
    logger.info("🚀 Запуск платформы AI-сотрудников ГШП...")

    employee_registry.load()
    logger.info(f"👥 AI-сотрудников в реестре: {len(employee_registry.list())}")

    ollama_ok = await llm_service.check_connection()
    if ollama_ok:
        logger.info(f"✅ Ollama подключена (модель: {settings.ollama_model})")
    else:
        logger.warning(f"⚠️  Ollama недоступна или модель {settings.ollama_model} не найдена")

    logger.info("✅ Сервер готов к работе")
    yield
    logger.info("👋 Остановка сервера...")


# ==================== FastAPI App ====================

app = FastAPI(
    title="Платформа AI-сотрудников ГШП",
    description="Демонстрационная платформа AI-сотрудников АО «Газпром Шельфпроект»",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== Роутеры ====================

app.include_router(employees_router.router)
app.include_router(chat_router.router)
app.include_router(documents_router.router)


# ==================== Общие endpoint-ы ====================

class HealthResponse(BaseModel):
    status: str
    ollama_connected: bool
    model: str
    employees_loaded: int


@app.get("/")
async def root():
    return {
        "name": "Платформа AI-сотрудников ГШП",
        "version": "2.0.0",
        "status": "running",
        "docs": "/docs"
    }


@app.get("/health", response_model=HealthResponse)
async def health_check():
    ollama_ok = await llm_service.check_connection()
    return HealthResponse(
        status="healthy" if ollama_ok else "degraded",
        ollama_connected=ollama_ok,
        model=settings.ollama_model,
        employees_loaded=len(employee_registry.list()),
    )


@app.get("/api/workflow/{workflow_id}")
async def get_workflow(workflow_id: str):
    workflow = plan_orchestrator.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {
        "id": workflow.id,
        "name": workflow.name,
        "description": workflow.description,
        "status": workflow.status.value,
        "nodes": [
            {
                "id": node.id,
                "name": node.name,
                "type": node.type.value,
                "status": node.status.value,
                "duration_ms": node.duration_ms,
                "icon": node.icon,
                "color": node.color,
                "description": node.description,
                "config": node.config,
            }
            for node in workflow.nodes
        ],
        "edges": [
            {"id": e.id, "source": e.source, "target": e.target}
            for e in workflow.edges
        ]
    }


# ==================== WebSocket ====================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Единый WebSocket-канал для real-time событий платформы."""
    await ws_manager.connect(websocket)
    try:
        await ws_manager.send_personal(websocket, {
            "type": "connected",
            "message": "Подключено к платформе AI-сотрудников ГШП"
        })

        while True:
            try:
                data = await websocket.receive_json()

                if data.get("type") == "ping":
                    await ws_manager.send_personal(websocket, {"type": "pong"})
                elif data.get("type") == "pong":
                    pass
                elif data.get("type") == "subscribe":
                    workflow_id = data.get("workflow_id")
                    if workflow_id:
                        ws_manager.disconnect(websocket)
                        await ws_manager.connect(websocket, workflow_id)
                        await ws_manager.send_personal(websocket, {
                            "type": "subscribed",
                            "workflow_id": workflow_id
                        })
            except Exception as e:
                logger.debug(f"WebSocket receive error: {e}")
                break

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        ws_manager.disconnect(websocket)


# ==================== Entry Point ====================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=True,
        log_level="info"
    )

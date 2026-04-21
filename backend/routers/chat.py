"""
Роутер /api/chat — диалог с AI-сотрудником.
"""
from fastapi import APIRouter, HTTPException

from backend.chat import chat_service, session_manager
from backend.employees import employee_registry
from backend.models.chat import SendMessageRequest


router = APIRouter(prefix="/api/chat", tags=["chat"])


def _session_to_dict(session) -> dict:
    return {
        "id": session.id,
        "employee_id": session.employee_id,
        "created_at": session.created_at.isoformat(),
        "last_workflow_id": session.last_workflow_id,
        "pending_plan": session.pending_plan.model_dump() if session.pending_plan else None,
        "pending_clarify": session.pending_clarify.model_dump() if session.pending_clarify else None,
        "messages": [
            {
                "id": m.id,
                "timestamp": m.timestamp.isoformat(),
                "type": m.type,
                "author": m.author,
                "text": m.text,
                "payload": m.payload,
            }
            for m in session.messages
        ],
        "documents_created": session.documents_created,
    }


@router.post("/{employee_id}/init")
async def init_session(employee_id: str):
    if not employee_registry.get(employee_id):
        raise HTTPException(status_code=404, detail="Employee not found")
    session = chat_service.init_session(employee_id)
    return _session_to_dict(session)


@router.post("/{employee_id}/reset")
async def reset_session(employee_id: str):
    chat_service.reset_session(employee_id)
    session = chat_service.init_session(employee_id)
    return _session_to_dict(session)


@router.get("/{employee_id}")
async def get_session(employee_id: str):
    session = session_manager.get_or_create(employee_id)
    return _session_to_dict(session)


@router.post("/{employee_id}/message")
async def send_message(employee_id: str, req: SendMessageRequest):
    try:
        session = await chat_service.send_message(employee_id, req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _session_to_dict(session)


@router.post("/{employee_id}/approve")
async def approve_plan(employee_id: str):
    try:
        session = await chat_service.approve_plan(employee_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _session_to_dict(session)


@router.post("/{employee_id}/reject")
async def reject_plan(employee_id: str):
    session = await chat_service.reject_plan(employee_id)
    return _session_to_dict(session)

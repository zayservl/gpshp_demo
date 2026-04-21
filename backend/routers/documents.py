"""
Роутер /api/documents — реестр документов платформы.
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, Query

from backend.data_access import datastore


router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.get("")
async def list_documents(employee_id: Optional[str] = Query(default=None)):
    return {"documents": datastore.list_documents(employee_id=employee_id)}


@router.get("/{doc_id}")
async def get_document(doc_id: str):
    doc = datastore.get_document_with_content(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc

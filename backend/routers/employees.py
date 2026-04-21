"""
Роутер /api/employees — список сотрудников, профиль, сценарии.
"""
from fastapi import APIRouter, HTTPException

from backend.employees import employee_registry


router = APIRouter(prefix="/api/employees", tags=["employees"])


@router.get("")
async def list_employees():
    return {
        "employees": [
            {
                "id": e.id,
                "name": e.name,
                "short_name": e.short_name,
                "role": e.role,
                "avatar": e.avatar,
                "color": e.color,
                "status": e.status,
                "description": e.description,
                "responsibilities": e.responsibilities,
                "tools": [t.model_dump() for t in e.tools],
                "scenarios_count": len(e.scenarios),
            }
            for e in employee_registry.list()
        ]
    }


@router.get("/{employee_id}")
async def get_employee(employee_id: str):
    employee = employee_registry.get(employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    return {
        "id": employee.id,
        "name": employee.name,
        "short_name": employee.short_name,
        "role": employee.role,
        "avatar": employee.avatar,
        "color": employee.color,
        "status": employee.status,
        "description": employee.description,
        "responsibilities": employee.responsibilities,
        "tools": [t.model_dump() for t in employee.tools],
        "scenarios": [
            {
                "id": s.id,
                "title": s.title,
                "category": s.category,
                "request": s.request,
            }
            for s in employee.scenarios
        ],
    }

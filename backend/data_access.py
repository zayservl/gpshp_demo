"""
Доступ к моковым данным (заявки, договоры, КП, обращения, ЛНА и т.д.)
"""
import json
from pathlib import Path
from typing import Any, Dict, List, Optional
from loguru import logger


DATA_DIR = Path(__file__).resolve().parent.parent / "data"


class DataStore:
    """Все моки в памяти + генерируемые артефакты сессий"""

    def __init__(self) -> None:
        self._cache: Dict[str, Any] = {}
        self._artifacts: List[Dict[str, Any]] = []  # документы, созданные ИИ

    def _load(self, name: str) -> Any:
        if name in self._cache:
            return self._cache[name]
        path = DATA_DIR / f"{name}.json"
        if not path.exists():
            logger.warning(f"Data file {path} не найден")
            self._cache[name] = {}
            return {}
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        self._cache[name] = data
        return data

    # ---------- Заявки ----------
    def get_application(self, number: str) -> Optional[Dict[str, Any]]:
        data = self._load("applications")
        for app in data.get("applications", []):
            if str(app.get("number")) == str(number) or app.get("id") == f"app_{number}":
                return app
        return None

    def list_applications(self) -> List[Dict[str, Any]]:
        return self._load("applications").get("applications", [])

    # ---------- Договоры и письма ----------
    def get_contract(self, number: str) -> Optional[Dict[str, Any]]:
        data = self._load("contracts_v2")
        for c in data.get("contracts", []):
            if c.get("number") == number or c.get("id") == number:
                return c
        return None

    def list_contracts(self) -> List[Dict[str, Any]]:
        return self._load("contracts_v2").get("contracts", [])

    def get_letter(self, number: str) -> Optional[Dict[str, Any]]:
        data = self._load("contracts_v2")
        for letter in data.get("letters", []):
            if letter.get("number") == number or letter.get("id") == number:
                return letter
        return None

    # ---------- Закупки ----------
    def get_tender(self, tender_id: Optional[str] = None) -> Dict[str, Any]:
        """Вернуть тендер: по id (если задан), иначе тендер по умолчанию (первый
        активный крупный тендер из массива tenders либо поле `tender`)."""
        data = self._load("proposals")
        if tender_id:
            t = self.get_tender_by_id(tender_id)
            if t:
                return t
        tenders = data.get("tenders", [])
        if tenders:
            return tenders[0]
        return data.get("tender", {})

    def list_tenders(self) -> List[Dict[str, Any]]:
        data = self._load("proposals")
        tenders = list(data.get("tenders", []))
        single = data.get("tender")
        if single and not any(t.get("id") == single.get("id") for t in tenders):
            tenders.append(single)
        return tenders

    def get_tender_by_id(self, tender_id: str) -> Optional[Dict[str, Any]]:
        for t in self.list_tenders():
            if t.get("id") == tender_id or t.get("number") == tender_id:
                return t
        return None

    def list_proposals(self, tender_id: Optional[str] = None) -> List[Dict[str, Any]]:
        props = self._load("proposals").get("proposals", [])
        if tender_id:
            return [p for p in props if p.get("tender_id") == tender_id]
        return props

    def get_proposal(self, number: str) -> Optional[Dict[str, Any]]:
        for p in self.list_proposals():
            if p.get("number") == number or p.get("id") == number:
                return p
        return None

    def get_proposals_subset(self, numbers: List[str]) -> List[Dict[str, Any]]:
        normalized = {n.lower() for n in numbers}
        out = []
        for p in self.list_proposals():
            if (p.get("number", "").lower() in normalized
                    or p.get("id", "").lower() in normalized):
                out.append(p)
        return out

    def get_expected_recommendation(self, tender_id: Optional[str] = None) -> Dict[str, Any]:
        data = self._load("proposals")
        if tender_id:
            recs = data.get("expected_recommendations", {})
            if tender_id in recs:
                return recs[tender_id]
        return data.get("expected_recommendation", {})

    def get_suppliers_registry(self) -> List[Dict[str, Any]]:
        return self._load("proposals").get("suppliers_registry", [])

    def find_supplier(self, name_hint: str) -> Optional[Dict[str, Any]]:
        hint = name_hint.lower()
        for s in self.get_suppliers_registry():
            if hint in s.get("name", "").lower():
                return s
        return None

    # ---------- Обращения ----------
    def get_appeal(self, number: str) -> Optional[Dict[str, Any]]:
        for a in self._load("appeals").get("appeals", []):
            if a.get("number") == number or a.get("id") == f"appeal_{number}":
                return a
        return None

    def list_appeals(self) -> List[Dict[str, Any]]:
        return self._load("appeals").get("appeals", [])

    # ---------- ЛНА ----------
    def list_lna(self) -> List[Dict[str, Any]]:
        return self._load("lna").get("documents", [])

    def search_lna(self, query: str, top_k: int = 3) -> List[Dict[str, Any]]:
        """Простой keyword-поиск по ЛНА с ранжированием по совпадениям."""
        q = query.lower()
        results = []
        for doc in self.list_lna():
            for ex in doc.get("excerpts", []):
                score = 0
                text_l = ex.get("text", "").lower()
                for kw in ex.get("keywords", []):
                    if kw.lower() in q:
                        score += 3
                    if kw.lower() in text_l:
                        score += 1
                # fallback: прямое вхождение слов запроса в текст
                for token in q.split():
                    if len(token) > 3 and token in text_l:
                        score += 1
                if score > 0:
                    results.append({
                        "document": doc.get("title"),
                        "code": doc.get("code"),
                        "section": ex.get("section"),
                        "text": ex.get("text"),
                        "score": score
                    })
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_k]

    # ---------- Ежедневная сводка ----------
    def get_daily_ops(self) -> Dict[str, Any]:
        return self._load("daily_ops")

    # ---------- Документы (реестр) ----------
    def list_documents(self, employee_id: Optional[str] = None) -> List[Dict[str, Any]]:
        base = self._load("documents").get("documents", [])
        items = list(base) + list(self._artifacts)
        if employee_id:
            items = [d for d in items if d.get("employee_id") == employee_id]
        return items

    def get_document(self, doc_id: str) -> Optional[Dict[str, Any]]:
        for d in self.list_documents():
            if d.get("id") == doc_id:
                return d
        return None

    def get_document_with_content(self, doc_id: str) -> Optional[Dict[str, Any]]:
        """Вернуть документ вместе с исходным содержимым.

        Поддерживаются source_ref: app_N, contract_YYYY_NNN, letter_isx_NN_YYYY,
        appeal_NN_YYYY, kp_NNN, zkp_YYYY_NNN, daily_ops, и inline content.
        """
        doc = self.get_document(doc_id)
        if not doc:
            return None
        ref = str(doc.get("source_ref", ""))
        content: Dict[str, Any] = {}

        if doc.get("content"):
            content = doc["content"]
        elif ref.startswith("app_"):
            app = self.get_application(ref.removeprefix("app_"))
            if app:
                content = {"kind": "application", "data": app}
        elif ref.startswith("contract_"):
            # contract_2026_001 -> Д-2026-001
            parts = ref.split("_")
            num = f"Д-{parts[1]}-{parts[2]}" if len(parts) >= 3 else ""
            c = self.get_contract(num)
            if c:
                content = {"kind": "contract", "data": c}
        elif ref.startswith("letter_"):
            # letter_isx_45_2024 -> Исх-45-2024
            parts = ref.split("_")
            num = f"Исх-{parts[2]}-{parts[3]}" if len(parts) >= 4 else ""
            letter = self.get_letter(num) if num else None
            if letter:
                content = {"kind": "letter", "data": letter}
        elif ref.startswith("appeal_"):
            # appeal_45_2026 -> 45-2026
            parts = ref.split("_", 1)
            num = parts[1].replace("_", "-") if len(parts) == 2 else ""
            appeal = self.get_appeal(num)
            if appeal:
                content = {"kind": "appeal", "data": appeal}
        elif ref.startswith("kp_") or ref.startswith("proposal_"):
            # берём первое слово из заголовка: "КП-001 от ООО …"
            title_num = doc.get("title", "").split()[0]
            prop = self.get_proposal(title_num)
            if prop:
                content = {"kind": "proposal", "data": prop}
        elif ref.startswith("zkp_"):
            tender = self.get_tender_by_id(ref) or self.get_tender()
            content = {"kind": "tender", "data": tender}
        elif ref == "daily_ops" or ref.startswith("daily_") or doc.get("type") == "сводка":
            content = {"kind": "daily_ops", "data": self.get_daily_ops()}

        if not content and doc.get("type") in ("ЛНА", "положение", "инструкция"):
            for lna in self.list_lna():
                if lna.get("id") == ref or lna.get("code") == doc.get("title", "").split()[0]:
                    content = {"kind": "lna", "data": lna}
                    break

        return {**doc, "content_full": content}

    def add_artifact(self, artifact: Dict[str, Any]) -> None:
        """Добавить документ, сгенерированный сотрудником в ходе сессии."""
        self._artifacts.append(artifact)


datastore = DataStore()

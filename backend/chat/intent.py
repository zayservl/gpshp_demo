"""
Классификатор намерения пользователя внутри контекста одного сотрудника.

Стратегия: keyword-based с весами + извлечение сущностей (номера заявок/договоров/обращений).
Для MVP этого достаточно, LLM подключается уже на этапе финальной генерации текстов.
"""
from __future__ import annotations
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from backend.models.employee import Employee, Scenario


@dataclass
class IntentMatch:
    scenario: Scenario
    confidence: float
    extracted: Dict[str, str]


# Ключевые слова, характеризующие категории сценариев каждого сотрудника
CATEGORY_KEYWORDS: Dict[str, List[str]] = {
    # clerk
    "check": ["проверь", "проверить", "комплектность", "заявк", "оформлени"],
    "search": ["найд", "поищ", "поиск", "лна", "нормативн", "база знан", "узнай", "вахта", "отпуск"],
    # lawyer
    "analyze": ["анализ", "риск", "проверь договор", "проанализируй", "проверка договора"],
    # Юр. проверка КП перед подписанием — отдельная категория,
    # триггерится handoff'ом от закупщика ("Проверь юридические риски в КП…").
    "check_kp": [
        "юридическ", "юр.", "риск", "кп", "коммерческ", "предложени",
        "перед подписанием", "тендер",
    ],
    "proofread": ["опечатк", "орфогр", "стиль", "ошибк", "проверь письмо", "проверь текст"],
    "translate": ["перевед", "перевод", "английск", "russian to english", "ru->en"],
    # procurement
    "compare": ["сравни", "сравнение", "кп", "коммерческ", "предложени"],
    "supplier": ["поставщик", "благонадёжн", "благонадежн", "контрагент"],
    # assistant
    "answer": ["ответ", "обращени", "письмо", "жалоб"],
    "summary": ["сводка", "сводку", "ежедневн", "отчёт", "отчет"],
}


NUMBER_PATTERNS = [
    (re.compile(r"зая[а-я]+\s*(?:№)?\s*(\d+)", re.I), "application_number"),
    (re.compile(r"заявки?\s+(\d+)", re.I), "application_number"),
    (re.compile(r"(Д-\d{4}-\d{3})", re.I), "contract_number"),
    (re.compile(r"договор[а-я]*\s*(?:№)?\s*([А-ЯA-Z\d\-]+)", re.I), "contract_number"),
    (re.compile(r"(Исх-\d+-\d+)", re.I), "letter_number"),
    (re.compile(r"обращени[а-я]*\s*(?:№)?\s*(\d+-\d+)", re.I), "appeal_number"),
    (re.compile(r"(КП-\d+)", re.I), "proposal_number"),
    # Идентификатор тендера: "ЗКП-2026-028" / "zkp_2026_028" / "zkp-2026-028"
    (re.compile(r"(ЗКП-\d{4}-\d+)", re.I), "tender_number"),
    (re.compile(r"(zkp[_\-]\d{4}[_\-]\d+)", re.I), "tender_id"),
    (re.compile(r"тендер[ауеом]*\s+(zkp[_\-]\d{4}[_\-]\d+)", re.I), "tender_id"),
    (re.compile(r"тендер[ауеом]*\s+(ЗКП-\d{4}-\d+)", re.I), "tender_id"),
]


def extract_entities(text: str) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for pattern, key in NUMBER_PATTERNS:
        m = pattern.search(text)
        if m and key not in out:
            out[key] = m.group(1)
    return out


def _score_text(text: str, keywords: List[str]) -> int:
    t = text.lower()
    score = 0
    for kw in keywords:
        if kw in t:
            score += 2 if len(kw) > 5 else 1
    return score


# Порог уверенности. Ниже него считаем, что сценарий не подходит → идём в LLM-fallback.
MIN_CONFIDENT_SCORE = 4


def classify(employee: Employee, text: str) -> Optional[IntentMatch]:
    """
    Выбрать сценарий, максимально подходящий к тексту пользователя.
    Возвращает None, если никакой сценарий уверенно не подходит.
    """
    if not text.strip():
        return None

    extracted = extract_entities(text)

    best_scenario: Optional[Scenario] = None
    best_score = 0

    for scenario in employee.scenarios:
        category = scenario.category or "general"
        kws = CATEGORY_KEYWORDS.get(category, [])
        score = _score_text(text, kws)

        # bonus за совпадение сущности со сценарием
        if "application_number" in extracted and f"_{extracted['application_number']}" in scenario.id:
            score += 10
        if "contract_number" in extracted and "contract" in scenario.id:
            score += 6
        if "letter_number" in extracted and "letter" in scenario.id.lower():
            score += 8
        if "appeal_number" in extracted and "appeal" in scenario.id.lower():
            score += 8
        if scenario.category == "compare" and ("ноутбук" in text.lower() or "кп" in text.lower()):
            score += 4
        # Юр. проверка КП: ключевой сигнал — "юрид" + ("кп" или tender_id)
        if scenario.category == "check_kp":
            lower = text.lower()
            if "юрид" in lower and ("кп" in lower or "tender_id" in extracted
                                     or "tender_number" in extracted):
                score += 8
            if "tender_id" in extracted or "tender_number" in extracted:
                score += 4

        if score > best_score:
            best_score = score
            best_scenario = scenario

    # Требуем либо явную сущность (номер), либо достаточно высокий keyword-скор.
    has_entity = bool(extracted)
    strong_enough = best_score >= MIN_CONFIDENT_SCORE or (has_entity and best_score >= 2)

    if best_scenario is None or not strong_enough:
        return None

    confidence = min(1.0, best_score / 8.0)
    return IntentMatch(scenario=best_scenario, confidence=confidence, extracted=extracted)

# 🔄 Процесс генерации агентов под запрос пользователя

## 📋 Общая схема процесса

```
Пользователь → API → WorkflowEngine → Orchestrator → PlannerAgent → LLM → План → Граф → Выполнение
```

---

## 🎯 Этап 1: Получение запроса пользователя

**Файл:** `backend/main.py` → `POST /api/workflow/start`

Пользователь отправляет запрос через фронтенд:
```json
{
  "text": "Создать пакет документов для закрытия объёмов работ по договору ГПН-БС/2024-1847 за январь 2025 года",
  "contract_id": "CNT-2024-001",
  "period": "Январь 2025"
}
```

**Обработчик:**
```python
@app.post("/api/workflow/start")
async def start_workflow(request: WorkflowRequest):
    result = await workflow_engine.start_workflow(
        user_text=request.text,
        contract_id=request.contract_id,
        period=request.period
    )
```

---

## 🚀 Этап 2: Создание UserRequest и передача в Orchestrator

**Файл:** `backend/services/workflow_engine.py`

```python
request = UserRequest(
    text=user_text,
    contract_id=contract_id,
    period=period,
    context=context or {}
)

return await self.orchestrator.process_request(request)
```

**Структура UserRequest:**
- `text` - текст запроса пользователя
- `contract_id` - ID договора (опционально)
- `period` - период (опционально)
- `context` - дополнительный контекст

---

## 🎯 Этап 3: Orchestrator запускает планирование

**Файл:** `backend/agents/orchestrator.py` → `process_request()`

```python
# 1. Генерируем уникальный workflow_id
workflow_id = str(uuid.uuid4())

# 2. Отправляем уведомление о начале планирования
await ws_manager.send_log_entry(
    workflow_id=workflow_id,
    level="info",
    agent="Оркестратор",
    message="Анализ запроса и построение плана выполнения..."
)

# 3. Вызываем планировщик
plan = await planner_agent.analyze_request(
    user_request=request.text,
    context={
        "contract_id": request.contract_id,
        "period": request.period,
        **request.context
    }
)
```

---

## 🧠 Этап 4: PlannerAgent анализирует запрос

**Файл:** `backend/agents/planner_agent.py` → `analyze_request()`

### 4.1 Подготовка контекста

```python
# Извлекаем дополнительную информацию из запроса
context_info = ""
if context:
    if context.get('contract_id'):
        context_info += f"\nID договора: {context['contract_id']}"
    if context.get('period'):
        context_info += f"\nПериод: {context['period']}"

# Извлекаем номер договора из текста запроса (regex)
contract_match = re.search(r'[№N#]\s*([А-Яа-яA-Za-z0-9/\-]+)', user_request)
if contract_match:
    contract_number = contract_match.group(1).strip()
    context_info += f"\nНомер договора из запроса: {contract_number}"
```

### 4.2 Формирование промпта для LLM

```python
prompt = f"""Запрос пользователя: {user_request}
{context_info}

Проанализируй запрос и сгенерируй план выполнения. Будь кратким и точным."""
```

**Пример промпта:**
```
Запрос пользователя: Создать пакет документов для закрытия объёмов работ по договору ГПН-БС/2024-1847 за январь 2025 года
ID договора: CNT-2024-001
Период: Январь 2025
Номер договора из запроса: ГПН-БС/2024-1847

Проанализируй запрос и сгенерируй план выполнения. Будь кратким и точным.
```

### 4.3 Системный промпт (PLANNER_SYSTEM_PROMPT)

Системный промпт содержит:

1. **Описание сквозного бизнес-процесса:**
   ```
   СКВОЗНОЙ БИЗНЕС-ПРОЦЕСС "ЗАКРЫТИЕ РАБОТ ПОДРЯДЧИКА"
   
   1. Сбор данных договора → DATA_AGENT.collect_contract_data
   2. Сбор фактических работ → DATA_AGENT.collect_actual_works
   3. Формирование акта КС-2 → EXECUTOR_AGENT.generate_act
   4. Формирование счёта-фактуры → EXECUTOR_AGENT.generate_invoice
   5. Запуск согласования → APPROVAL_AGENT.start_approval
   6. Подписание документов → APPROVAL_AGENT.sign_documents
   7. Отправка в ERP → ERP_AGENT.send_to_erp
   ```

2. **Описание доступных агентов:**
   - DATA_AGENT (tool_agent) - сбор данных
   - EXECUTOR_AGENT (llm_agent) - формирование документов
   - APPROVAL_AGENT (tool_agent) - согласование
   - ERP_AGENT (tool_agent) - интеграция с ERP

3. **Доступные действия для каждого агента:**
   - DATA_AGENT: `collect_contract_data`, `collect_actual_works`
   - EXECUTOR_AGENT: `generate_act`, `generate_invoice`
   - APPROVAL_AGENT: `start_approval`, `sign_documents`
   - ERP_AGENT: `send_to_erp`

4. **Примеры сценариев:**
   - "Создать пакет документов" → 7 шагов (ПОЛНЫЙ ЦИКЛ)
   - "Только собрать данные" → 2-3 шага
   - "Сформировать акт" → 3 шага

5. **Формат ответа (JSON схема):**
   ```json
   {
     "request_understood": "string",
     "steps": [
       {
         "step_number": 1,
         "agent": "DATA_AGENT",
         "action": "collect_contract_data",
         "description": "string",
         "inputs": {},
         "integrations": ["contracts"]
       }
     ],
     "required_agents": ["DATA_AGENT"],
     "required_systems": ["contracts", "era"],
     "estimated_duration_sec": 30,
     "complexity": "high"
   }
   ```

---

## 🤖 Этап 5: Вызов LLM (Ollama)

**Файл:** `backend/services/llm_service.py` → `generate_json()`

### 5.1 Подготовка запроса к LLM

```python
# Добавляем schema hint для лучшего понимания формата
enhanced_prompt = prompt
if schema_hint:
    schema_json = json.dumps(schema_hint, ensure_ascii=False, indent=2)
    enhanced_prompt += f"\n\nОжидаемый формат JSON:\n```json\n{schema_json}\n```"

enhanced_prompt += "\n\nОтветь ТОЛЬКО валидным JSON без дополнительного текста."
```

### 5.2 Параметры запроса к LLM

```python
result = await self.client.chat(
    model="qwen3:8b",
    messages=[
        {"role": "system", "content": PLANNER_SYSTEM_PROMPT},
        {"role": "user", "content": enhanced_prompt}
    ],
    options={
        "temperature": 0.3,  # Низкая температура для структурированного вывода
        "num_predict": 2000
    },
    format="json"  # JSON режим
)
```

**Параметры:**
- `temperature: 0.3` - низкая температура для детерминированного вывода
- `format: "json"` - принудительный JSON режим
- `num_predict: 2000` - максимум токенов

### 5.3 Обработка ответа LLM

```python
# Очистка от markdown блоков (```json ... ```)
clean_result = result.strip()
if clean_result.startswith("```json"):
    clean_result = clean_result[7:]  # Убираем ```json
    if clean_result.endswith("```"):
        clean_result = clean_result[:-3]
    clean_result = clean_result.strip()

# Парсинг JSON
return json.loads(clean_result)
```

**Пример ответа LLM:**
```json
{
  "request_understood": "Полный цикл формирования пакета закрытия работ",
  "steps": [
    {
      "step_number": 1,
      "agent": "DATA_AGENT",
      "action": "collect_contract_data",
      "description": "Сбор данных о договоре из системы контрактов",
      "inputs": {"include_rates": true, "include_conditions": true},
      "integrations": ["contracts"]
    },
    {
      "step_number": 2,
      "agent": "DATA_AGENT",
      "action": "collect_actual_works",
      "description": "Сбор фактических работ из ЭРА и СМБ 2.0",
      "inputs": {"aggregate": true},
      "integrations": ["era", "smb"]
    },
    {
      "step_number": 3,
      "agent": "EXECUTOR_AGENT",
      "action": "generate_act",
      "description": "Формирование акта выполненных работ (КС-2)",
      "inputs": {"template": "KS-2", "calculate_vat": true},
      "integrations": ["sus"]
    },
    {
      "step_number": 4,
      "agent": "EXECUTOR_AGENT",
      "action": "generate_invoice",
      "description": "Создание счета-фактуры",
      "inputs": {"link_to_act": true},
      "integrations": ["sus"]
    },
    {
      "step_number": 5,
      "agent": "APPROVAL_AGENT",
      "action": "start_approval",
      "description": "Запуск маршрута согласования по службам ДО",
      "inputs": {"route": "closure_package", "parallel": false},
      "integrations": ["edo"]
    },
    {
      "step_number": 6,
      "agent": "APPROVAL_AGENT",
      "action": "sign_documents",
      "description": "Подписание документов ЭЦП подрядчика",
      "inputs": {"signature_type": "qualified"},
      "integrations": ["edo"]
    },
    {
      "step_number": 7,
      "agent": "ERP_AGENT",
      "action": "send_to_erp",
      "description": "Отправка в ERP-систему для принятия к учёту",
      "inputs": {"create_posting": true, "schedule_payment": true},
      "integrations": ["erp"]
    }
  ],
  "required_agents": ["DATA_AGENT", "EXECUTOR_AGENT", "APPROVAL_AGENT", "ERP_AGENT"],
  "required_systems": ["contracts", "era", "smb", "sus", "edo", "erp"],
  "estimated_duration_sec": 45,
  "complexity": "high"
}
```

---

## ✅ Этап 6: Валидация плана

**Файл:** `backend/agents/planner_agent.py` → `analyze_request()`

```python
# Проверяем, что результат валидный
if not result or 'steps' not in result:
    logger.warning("[Планировщик] LLM вернул неполный результат, используем fallback")
    return self._get_default_closure_plan(user_request)

steps = result.get('steps', [])
if len(steps) == 0:
    logger.warning("[Планировщик] LLM вернул пустой план, используем fallback")
    return self._get_default_closure_plan(user_request)

logger.info(f"[Планировщик] LLM сгенерировал план: {len(steps)} шагов")
return PlannerOutput(**result)
```

**Fallback план:**
Если LLM вернул невалидный результат, используется предопределённый план из `_get_default_closure_plan()` с полным циклом из 7 шагов.

---

## 🏗️ Этап 7: Построение графа выполнения

**Файл:** `backend/agents/planner_agent.py` → `build_workflow_graph()`

### 7.1 Создание узлов (WorkflowNode)

```python
# Цвета и иконки для разных агентов
agent_styles = {
    "DATA_AGENT": {"color": "#3b82f6", "icon": "📊"},      # Blue
    "EXECUTOR_AGENT": {"color": "#10b981", "icon": "📄"},  # Green
    "APPROVAL_AGENT": {"color": "#f59e0b", "icon": "✅"},  # Amber
    "ERP_AGENT": {"color": "#ef4444", "icon": "💰"}        # Red
}

# Создаём узлы из шагов плана
for step in plan.steps:
    agent = step.get('agent', 'UNKNOWN')
    style = agent_styles.get(agent, {"color": "#6b7280", "icon": "⚙️"})
    
    node = WorkflowNode(
        id=f"node_{step['step_number']}",
        name=step.get('description', f"Шаг {step['step_number']}"),
        type=NodeType.LLM_AGENT,
        description=f"{agent}: {step.get('action', 'execute')}",
        status=NodeStatus.PENDING,
        color=style['color'],
        icon=style['icon'],
        config={
            "agent": agent,
            "action": step.get('action'),
            "inputs": step.get('inputs', {}),
            "integrations": step.get('integrations', [])
        }
    )
    nodes.append(node)
```

**Структура узла:**
- `id` - уникальный идентификатор (node_1, node_2, ...)
- `name` - описание шага из плана
- `type` - тип узла (LLM_AGENT)
- `description` - "AGENT_NAME: action_name"
- `status` - PENDING (изначально)
- `color` - цвет в зависимости от агента
- `icon` - иконка в зависимости от агента
- `config` - конфигурация с агентом, действием, inputs и integrations

### 7.2 Создание связей (WorkflowEdge)

```python
# Создаём связи между последовательными шагами
for i in range(len(nodes) - 1):
    edge = WorkflowEdge(
        id=f"edge_{i+1}",
        source=nodes[i].id,
        target=nodes[i+1].id,
        label="",
        type="data_flow"
    )
    edges.append(edge)
```

**Структура связи:**
- `id` - уникальный идентификатор (edge_1, edge_2, ...)
- `source` - ID исходного узла
- `target` - ID целевого узла
- `type` - "data_flow" (поток данных)

### 7.3 Создание графа (WorkflowGraph)

```python
graph = WorkflowGraph(
    id=workflow_id,
    name=workflow_name,
    description=plan.request_understood,
    nodes=nodes,
    edges=edges,
    status=NodeStatus.PENDING,
    context={
        "plan": plan.model_dump(),
        "required_systems": plan.required_systems,
        "estimated_duration": plan.estimated_duration_sec
    }
)
```

**Пример графа для полного цикла:**
```
node_1 (DATA_AGENT.collect_contract_data)
  ↓
node_2 (DATA_AGENT.collect_actual_works)
  ↓
node_3 (EXECUTOR_AGENT.generate_act)
  ↓
node_4 (EXECUTOR_AGENT.generate_invoice)
  ↓
node_5 (APPROVAL_AGENT.start_approval)
  ↓
node_6 (APPROVAL_AGENT.sign_documents)
  ↓
node_7 (ERP_AGENT.send_to_erp)
```

---

## 📤 Этап 8: Отправка графа клиентам

**Файл:** `backend/agents/orchestrator.py` → `process_request()`

```python
# Сохраняем workflow
self.active_workflows[workflow_id] = workflow

# Отправляем граф клиентам через WebSocket
await ws_manager.send_workflow_update(workflow)

# Отправляем результат планировщика
await ws_manager.broadcast({
    "type": "planner_output",
    "timestamp": datetime.now().isoformat(),
    "data": plan.model_dump()
}, workflow_id)
```

**WebSocket сообщения:**
1. `workflow_update` - обновление графа (узлы и связи)
2. `planner_output` - план от LLM (для отображения в UI)

---

## 🎬 Этап 9: Выполнение графа

**Файл:** `backend/agents/orchestrator.py` → `_execute_workflow()`

```python
# Выполняем узлы последовательно
for node in workflow.nodes:
    await self._execute_node(workflow, node, execution_context)
```

**Процесс выполнения каждого узла:**
1. Обновление статуса узла на `RUNNING`
2. Получение агента из маппинга: `agent = self.agents.get(agent_name)`
3. Выполнение действия: `output = await agent.execute(...)`
4. Обновление контекста: `await self._update_context(...)`
5. Обновление статуса узла на `COMPLETED`
6. Отправка обновлений через WebSocket

---

## 📊 Итоговая схема потока данных

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Пользователь отправляет запрос                           │
│    "Создать пакет документов для закрытия..."               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. WorkflowEngine.start_workflow()                          │
│    Создаёт UserRequest с текстом и контекстом               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Orchestrator.process_request()                          │
│    Генерирует workflow_id, вызывает планировщика          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. PlannerAgent.analyze_request()                           │
│    - Подготавливает контекст                                │
│    - Формирует промпт для LLM                               │
│    - Вызывает llm_service.generate_json()                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. LLMService.generate_json()                               │
│    - Отправляет запрос в Ollama (qwen3:8b)                  │
│    - Парсит JSON ответ                                       │
│    - Возвращает структурированный план                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. PlannerAgent.validate_and_parse()                       │
│    - Валидирует план от LLM                                 │
│    - Если невалиден → использует fallback                   │
│    - Возвращает PlannerOutput                               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. PlannerAgent.build_workflow_graph()                     │
│    - Создаёт WorkflowNode для каждого шага                   │
│    - Создаёт WorkflowEdge между узлами                      │
│    - Возвращает WorkflowGraph                               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. Orchestrator отправляет граф через WebSocket             │
│    - workflow_update (граф)                                │
│    - planner_output (план)                                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 9. Orchestrator._execute_workflow()                         │
│    Последовательно выполняет каждый узел графа              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔑 Ключевые моменты

1. **LLM принимает решение** - именно LLM определяет, какие агенты и в какой последовательности нужны
2. **Системный промпт** - содержит описание бизнес-процесса и примеры, что помогает LLM правильно планировать
3. **Fallback план** - если LLM не справился, используется предопределённый план
4. **Последовательное выполнение** - узлы выполняются строго последовательно, один за другим
5. **Контекст передаётся** - данные между агентами передаются через `execution_context`

---

## 📝 Примеры для разных запросов

### Запрос: "Создать пакет документов для закрытия"
**Результат:** 7 шагов (полный цикл)
- DATA_AGENT → collect_contract_data
- DATA_AGENT → collect_actual_works
- EXECUTOR_AGENT → generate_act
- EXECUTOR_AGENT → generate_invoice
- APPROVAL_AGENT → start_approval
- APPROVAL_AGENT → sign_documents
- ERP_AGENT → send_to_erp

### Запрос: "Только собрать данные"
**Результат:** 2-3 шага
- DATA_AGENT → collect_contract_data
- DATA_AGENT → collect_actual_works

### Запрос: "Сформировать акт"
**Результат:** 3 шага
- DATA_AGENT → collect_contract_data
- DATA_AGENT → collect_actual_works
- EXECUTOR_AGENT → generate_act

---

*Документ создан: 2025-01-XX*
*Версия: 1.0*

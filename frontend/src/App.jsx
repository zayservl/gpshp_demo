import React, { useCallback, useEffect, useRef, useState } from 'react';
import Header from './components/Header';
import EmployeesScreen from './components/EmployeesScreen';
import EmployeeWorkspace from './components/EmployeeWorkspace';
import TasksDashboard from './components/TasksDashboard';
import useWebSocket from './hooks/useWebSocket';

function App() {
  const [activeEmployee, setActiveEmployee] = useState(null);
  const [view, setView] = useState('employees'); // employees | tasks
  // pendingHandoff: { target_employee_id, scenario_id, request, from_employee_id }
  // — передаётся при переключении на другого AI-сотрудника, чтобы workspace
  // автоматически запустил нужный сценарий с отметкой о handoff.
  const [pendingHandoff, setPendingHandoff] = useState(null);
  const [employeesById, setEmployeesById] = useState({});
  const [tasks, setTasks] = useState([]);

  const listenerRef = useRef(null);

  const pushTaskEvent = useCallback((taskId, ev) => {
    setTasks(prev => prev.map(t => t.id === taskId ? {
      ...t,
      updated_at: new Date().toISOString(),
      events: [...(t.events || []), ev],
    } : t));
  }, []);

  const upsertTask = useCallback((task) => {
    setTasks(prev => {
      const idx = prev.findIndex(t => t.id === task.id);
      if (idx === -1) return [task, ...prev];
      const next = prev.slice();
      next[idx] = { ...next[idx], ...task };
      return next;
    });
  }, []);

  const findLatestTaskForAssignee = useCallback((assigneeId, predicate) => {
    const list = tasks.filter(t => t.assignee_employee_id === assigneeId);
    const sorted = list.slice().sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''));
    return sorted.find(predicate || (() => true)) || null;
  }, [tasks]);

  const handleWsMessage = useCallback((msg) => {
    // --- tasks dashboard updates (frontend-only) ---
    try {
      if (msg?.type === 'chat_message' && msg?.data?.employee_id && msg?.data?.message) {
        const employeeId = msg.data.employee_id;
        const m = msg.data.message;
        const ts = m.timestamp || msg.timestamp || new Date().toISOString();

        if (m.type === 'running') {
          const existing = tasks
            .filter(t => t.assignee_employee_id === employeeId)
            .slice()
            .sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''))
            .find(t => t.status === 'in_progress' || t.status === 'paused');

          if (!existing) {
            const id = `task-${employeeId}-${Date.now()}`;
            upsertTask({
              id,
              title: m.payload?.title || m.text || 'Выполнение сценария',
              subtitle: m.payload?.scenario_id ? `scenario: ${m.payload.scenario_id}` : null,
              status: 'in_progress',
              assignee_employee_id: employeeId,
              requester_employee_id: null,
              created_at: ts,
              updated_at: ts,
              events: [{ at: ts, label: 'Старт', detail: m.payload?.title || m.text || null }],
            });
          }
        }

        if (m.type === 'plan_paused') {
          const latest = tasks
            .filter(t => t.assignee_employee_id === employeeId)
            .slice()
            .sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''))[0];
          if (latest && latest.status === 'in_progress') {
            upsertTask({
              ...latest,
              status: 'paused',
              updated_at: ts,
              events: [...(latest.events || []), { at: ts, label: 'Пауза', detail: 'Исполнение остановлено (pause_after)' }],
            });
          }
        }

        if (m.type === 'result' || m.type === 'error') {
          const latestInProgress = tasks
            .filter(t => t.assignee_employee_id === employeeId)
            .slice()
            .sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''))
            .find(t => t.status === 'in_progress' || t.status === 'paused');

          if (latestInProgress) {
            const docsCount = Array.isArray(m.payload?.documents_created) ? m.payload.documents_created.length : 0;
            upsertTask({
              ...latestInProgress,
              status: m.type === 'result' ? 'done' : 'blocked',
              updated_at: ts,
              events: [
                ...(latestInProgress.events || []),
                {
                  at: ts,
                  label: m.type === 'result' ? 'Завершено' : 'Ошибка',
                  detail: docsCount > 0 ? `Создано документов: ${docsCount}` : null,
                },
              ],
            });
          }
        }
      }

      if (msg?.type === 'workflow_completed' && msg?.data?.employee_id) {
        const employeeId = msg.data.employee_id;
        const ts = msg.timestamp || new Date().toISOString();
        const latest = tasks
          .filter(t => t.assignee_employee_id === employeeId)
          .slice()
          .sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''))[0];
        if (latest && (latest.status === 'in_progress' || latest.status === 'paused')) {
          upsertTask({
            ...latest,
            status: 'done',
            updated_at: ts,
            events: [...(latest.events || []), { at: ts, label: 'workflow_completed', detail: null }],
          });
        }
      }
    } catch {
      // ignore task updates
    }

    const fn = listenerRef.current;
    if (fn) fn(msg);
  }, [tasks, upsertTask]);

  const subscribe = useCallback((fn) => {
    listenerRef.current = fn;
    return () => {
      if (listenerRef.current === fn) listenerRef.current = null;
    };
  }, []);

  const { isConnected } = useWebSocket({ onMessage: handleWsMessage });

  useEffect(() => {
    fetch('/api/employees')
      .then(r => r.json())
      .then(data => {
        const map = {};
        (data.employees || []).forEach(e => { map[e.id] = e; });
        setEmployeesById(map);
      })
      .catch(() => { /* ignore */ });
  }, []);

  const handleSelect = useCallback((employee) => {
    setPendingHandoff(null);
    setActiveEmployee(employee);
    setView('employees');
  }, []);

  const handleBack = useCallback(() => {
    setPendingHandoff(null);
    setActiveEmployee(null);
    setView('employees');
  }, []);

  // Передача задачи на другого AI-сотрудника.
  const handleHandoff = useCallback(({ target_employee_id, scenario_id, request, from_employee_id }) => {
    const target = employeesById[target_employee_id];
    if (!target) {
      console.warn('Handoff target не найден:', target_employee_id);
      return;
    }

    const ts = new Date().toISOString();
    const id = `handoff-${from_employee_id}-${target_employee_id}-${Date.now()}`;
    upsertTask({
      id,
      title: request || 'Handoff задача',
      subtitle: scenario_id ? `scenario: ${scenario_id}` : 'handoff',
      status: 'todo',
      assignee_employee_id: target_employee_id,
      requester_employee_id: from_employee_id || null,
      created_at: ts,
      updated_at: ts,
      events: [
        { at: ts, label: 'Создана (handoff)', detail: from_employee_id ? `От: ${from_employee_id}` : null },
      ],
    });

    setPendingHandoff({ target_employee_id, scenario_id, request, from_employee_id });
    setActiveEmployee(target);
    setView('employees');
  }, [employeesById]);

  const handleHandoffConsumed = useCallback(() => {
    setPendingHandoff(null);
  }, []);

  const handleChangeView = useCallback((nextView) => {
    setView(nextView);
    if (nextView === 'tasks') {
      setPendingHandoff(null);
      setActiveEmployee(null);
    }
  }, []);

  const handleOpenEmployeeFromTasks = useCallback((employeeId) => {
    const emp = employeesById?.[employeeId];
    if (!emp) return;
    setPendingHandoff(null);
    setActiveEmployee(emp);
    setView('employees');
  }, [employeesById]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header
        isConnected={isConnected}
        activeEmployee={activeEmployee}
        onBack={handleBack}
        view={view}
        onChangeView={handleChangeView}
      />

      <div className="flex-1 flex min-h-0">
        {!activeEmployee && view === 'employees' && (
          <EmployeesScreen onSelectEmployee={handleSelect} />
        )}
        {!activeEmployee && view === 'tasks' && (
          <TasksDashboard
            tasks={tasks}
            employeesById={employeesById}
            onOpenEmployee={handleOpenEmployeeFromTasks}
          />
        )}
        {activeEmployee && view === 'employees' && (
          <EmployeeWorkspace
            key={activeEmployee.id}
            employee={activeEmployee}
            subscribe={subscribe}
            isConnected={isConnected}
            pendingHandoff={pendingHandoff && pendingHandoff.target_employee_id === activeEmployee.id ? pendingHandoff : null}
            onHandoffConsumed={handleHandoffConsumed}
            onHandoff={handleHandoff}
          />
        )}
      </div>
    </div>
  );
}

export default App;

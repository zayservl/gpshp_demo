import React, { useCallback, useEffect, useRef, useState } from 'react';
import Header from './components/Header';
import EmployeesScreen from './components/EmployeesScreen';
import EmployeeWorkspace from './components/EmployeeWorkspace';
import useWebSocket from './hooks/useWebSocket';

function App() {
  const [activeEmployee, setActiveEmployee] = useState(null);
  // pendingHandoff: { target_employee_id, scenario_id, request, from_employee_id }
  // — передаётся при переключении на другого AI-сотрудника, чтобы workspace
  // автоматически запустил нужный сценарий с отметкой о handoff.
  const [pendingHandoff, setPendingHandoff] = useState(null);
  const [employeesById, setEmployeesById] = useState({});

  const listenerRef = useRef(null);

  const handleWsMessage = useCallback((msg) => {
    const fn = listenerRef.current;
    if (fn) fn(msg);
  }, []);

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
  }, []);

  const handleBack = useCallback(() => {
    setPendingHandoff(null);
    setActiveEmployee(null);
  }, []);

  // Передача задачи на другого AI-сотрудника.
  const handleHandoff = useCallback(({ target_employee_id, scenario_id, request, from_employee_id }) => {
    const target = employeesById[target_employee_id];
    if (!target) {
      console.warn('Handoff target не найден:', target_employee_id);
      return;
    }
    setPendingHandoff({ target_employee_id, scenario_id, request, from_employee_id });
    setActiveEmployee(target);
  }, [employeesById]);

  const handleHandoffConsumed = useCallback(() => {
    setPendingHandoff(null);
  }, []);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header
        isConnected={isConnected}
        activeEmployee={activeEmployee}
        onBack={handleBack}
      />

      <div className="flex-1 flex min-h-0">
        {!activeEmployee && (
          <EmployeesScreen onSelectEmployee={handleSelect} />
        )}
        {activeEmployee && (
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

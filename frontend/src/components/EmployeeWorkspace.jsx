import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ReactFlowProvider } from 'reactflow';
import WorkflowGraph from './WorkflowGraph';
import PlanGraph from './PlanGraph';
import ChatPanel from './ChatPanel';
import DocumentsPanel from './DocumentsPanel';
import ToolsPanel from './ToolsPanel';
import ReasoningPanel from './ReasoningPanel';
import AgentDetailsModal from './AgentDetailsModal';
import DocumentViewerModal from './DocumentViewerModal';
import { FileText, Wrench, Brain } from 'lucide-react';

export default function EmployeeWorkspace({
  employee: initialEmployee,
  subscribe,
  isConnected,
  pendingHandoff,
  onHandoffConsumed,
  onHandoff,
}) {
  const [employee, setEmployee] = useState(initialEmployee);
  const [session, setSession] = useState(null);
  const [workflow, setWorkflow] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [logs, setLogs] = useState([]);
  const [reasoning, setReasoning] = useState([]);
  const [documentsCreated, setDocumentsCreated] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [viewDocId, setViewDocId] = useState(null);
  const [tab, setTab] = useState('documents');
  const [templates, setTemplates] = useState([]);

  // Ширина левой колонки (чат + действия) — resizable. Храним в localStorage,
  // чтобы ширина переживала reload и переключение сотрудников.
  const LEFT_MIN = 340;
  const LEFT_MAX = 720;
  const LEFT_DEFAULT = 480;
  const [leftWidth, setLeftWidth] = useState(() => {
    if (typeof window === 'undefined') return LEFT_DEFAULT;
    const raw = Number(window.localStorage.getItem('aurora.leftPanelWidth'));
    if (!Number.isFinite(raw) || raw <= 0) return LEFT_DEFAULT;
    return Math.min(LEFT_MAX, Math.max(LEFT_MIN, raw));
  });
  useEffect(() => {
    try { window.localStorage.setItem('aurora.leftPanelWidth', String(leftWidth)); } catch {}
  }, [leftWidth]);

  const executingRef = useRef(false);
  useEffect(() => { executingRef.current = isExecuting; }, [isExecuting]);

  // Pointer-based drag для ручки ресайза между левой колонкой и центром.
  const draggingRef = useRef(false);
  const onResizeStart = useCallback((e) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.classList.add('aurora-col-resizing');
    const onMove = (ev) => {
      if (!draggingRef.current) return;
      const x = ev.clientX;
      const clamped = Math.min(LEFT_MAX, Math.max(LEFT_MIN, x));
      setLeftWidth(clamped);
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.classList.remove('aurora-col-resizing');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, []);

  const onResizeDoubleClick = useCallback(() => {
    setLeftWidth(LEFT_DEFAULT);
  }, []);

  const refreshTemplates = useCallback(async () => {
    try {
      const r = await fetch(`/api/chat/${initialEmployee.id}/plan/templates`);
      if (r.ok) {
        const list = await r.json();
        setTemplates(Array.isArray(list) ? list : []);
      }
    } catch {/* ignore */}
  }, [initialEmployee.id]);

  // ---- Initial load ----
  useEffect(() => {
    let ignore = false;
    setEmployee(initialEmployee);
    setSession(null);
    setWorkflow(null);
    setIsExecuting(false);
    setLogs([]);
    setReasoning([]);
    setDocumentsCreated([]);

    Promise.all([
      fetch(`/api/employees/${initialEmployee.id}`).then(r => r.json()),
      fetch(`/api/chat/${initialEmployee.id}/init`, { method: 'POST' }).then(r => r.json()),
      fetch(`/api/chat/${initialEmployee.id}/plan/templates`)
        .then(r => r.ok ? r.json() : [])
        .catch(() => []),
    ]).then(([empFull, sessionData, tplList]) => {
      if (ignore) return;
      setEmployee(empFull);
      setSession(sessionData);
      setTemplates(Array.isArray(tplList) ? tplList : []);
    });

    return () => { ignore = true; };
  }, [initialEmployee]);

  // ---- WebSocket subscription (синхронный listener, без потерь) ----
  useEffect(() => {
    if (!subscribe) return;
    const unsub = subscribe((wsMessage) => {
      const { type, data, timestamp } = wsMessage;

      if (type === 'chat_message' && data?.employee_id === employee.id) {
        const msg = data.message;
        setSession(prev => {
          if (!prev) return prev;
          if (prev.messages.some(m => m.id === msg.id)) return prev;
          let filtered = prev.messages.filter(m =>
            !(m.id?.startsWith('temp-') && m.text === msg.text && m.author === msg.author)
          );
          // «thinking»-плейсхолдер заменяется финальным ответом (answer/result/error)
          if (['answer', 'result', 'error'].includes(msg.type)) {
            filtered = filtered.filter(m => m.type !== 'thinking');
          }
          return { ...prev, messages: [...filtered, msg] };
        });
        if (['result', 'error'].includes(msg?.type)) setIsExecuting(false);
        if (msg?.type === 'running') setIsExecuting(true);
        if (msg?.type === 'result') {
          const docs = msg.payload?.documents_created || [];
          if (docs.length) setDocumentsCreated(prev => [...prev, ...docs]);
        }
      }

      if (type === 'workflow_update') setWorkflow(data);

      if (type === 'node_status') {
        setWorkflow(prev => {
          if (!prev || prev.workflow_id !== data.workflow_id) return prev;
          return {
            ...prev,
            nodes: prev.nodes.map(n =>
              n.id === data.node_id
                ? { ...n, status: data.status, duration_ms: data.duration_ms, output_data: data.output_data }
                : n
            ),
          };
        });
      }

      if (type === 'log') {
        setLogs(prev => [...prev, {
          id: `log-${timestamp}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp,
          ...data,
        }]);
      }

      if (type === 'agent_reasoning') {
        setReasoning(prev => [...prev, {
          id: `rsn-${timestamp}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp,
          ...data,
        }]);
      }

      if (type === 'document_created') {
        setDocumentsCreated(prev => [...prev, data.document]);
      }

      if (type === 'workflow_completed') {
        setIsExecuting(false);
      }
    });
    return unsub;
  }, [subscribe, employee.id]);

  // ---- Safety net: poll сессию, пока идёт выполнение (на случай, если WS проспал событие) ----
  useEffect(() => {
    if (!isExecuting) return;
    const interval = setInterval(async () => {
      if (!executingRef.current) return;
      try {
        const r = await fetch(`/api/chat/${employee.id}`);
        if (!r.ok) return;
        const data = await r.json();
        const hasResult = data.messages.some(m => m.type === 'result' || m.type === 'error');
        setSession(prev => {
          if (!prev) return data;
          const knownIds = new Set(prev.messages.map(m => m.id));
          const merged = [...prev.messages];
          for (const m of data.messages) {
            if (!knownIds.has(m.id)) merged.push(m);
          }
          return { ...prev, messages: merged, pending_plan: data.pending_plan, pending_clarify: data.pending_clarify };
        });
        if (hasResult) setIsExecuting(false);
      } catch {/* ignore */}
    }, 2500);
    return () => clearInterval(interval);
  }, [isExecuting, employee.id]);

  // ---- Actions ----
  const handleSend = useCallback(async ({ text, scenario_id, handoff_from, target_employee_id }) => {
    // Если проактив идёт на другого сотрудника — выполняем handoff (переключаем AI-сотрудника).
    if (target_employee_id && target_employee_id !== employee.id) {
      onHandoff?.({
        target_employee_id,
        scenario_id,
        request: text,
        from_employee_id: employee.id,
      });
      return;
    }

    setSession(prev => prev ? {
      ...prev,
      messages: [
        ...prev.messages,
        {
          id: `temp-${Date.now()}`,
          type: 'user',
          author: 'user',
          text,
          timestamp: new Date().toISOString(),
        },
      ],
    } : prev);

    const r = await fetch(`/api/chat/${employee.id}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        scenario_id: scenario_id || null,
        handoff_from: handoff_from || null,
      }),
    });
    const data = await r.json();
    setSession(data);
  }, [employee.id, onHandoff]);

  const handleApprove = useCallback(async () => {
    setIsExecuting(true);
    setWorkflow(null);
    setLogs([]);
    setReasoning([]);
    const r = await fetch(`/api/chat/${employee.id}/approve`, { method: 'POST' });
    const data = await r.json();
    setSession(data);
  }, [employee.id]);

  const handleReject = useCallback(async () => {
    const r = await fetch(`/api/chat/${employee.id}/reject`, { method: 'POST' });
    const data = await r.json();
    setSession(data);
  }, [employee.id]);

  const handlePlanUpdate = useCallback(async (graphNodes, graphEdges) => {
    // Оптимистично обновляем session.pending_plan, чтобы не было лагов.
    setSession(prev => prev && prev.pending_plan ? {
      ...prev,
      pending_plan: { ...prev.pending_plan, graph_nodes: graphNodes, graph_edges: graphEdges },
    } : prev);
    try {
      const r = await fetch(`/api/chat/${employee.id}/plan/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph_nodes: graphNodes, graph_edges: graphEdges }),
      });
      if (r.ok) {
        const data = await r.json();
        setSession(data);
      }
    } catch {/* ignore */}
  }, [employee.id]);

  const handleResume = useCallback(async () => {
    try {
      const r = await fetch(`/api/chat/${employee.id}/plan/resume`, { method: 'POST' });
      if (r.ok) setSession(await r.json());
    } catch {/* ignore */}
  }, [employee.id]);

  const handleSaveTemplate = useCallback(async (name) => {
    try {
      const r = await fetch(`/api/chat/${employee.id}/plan/template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (r.ok) {
        await refreshTemplates();
      }
    } catch {/* ignore */}
  }, [employee.id, refreshTemplates]);

  const handleLoadTemplate = useCallback(async (templateId) => {
    try {
      const r = await fetch(`/api/chat/${employee.id}/plan/template/${templateId}/apply`, {
        method: 'POST',
      });
      if (r.ok) setSession(await r.json());
    } catch {/* ignore */}
  }, [employee.id]);

  const handleReset = useCallback(async () => {
    setWorkflow(null);
    setLogs([]);
    setReasoning([]);
    setDocumentsCreated([]);
    setIsExecuting(false);
    const r = await fetch(`/api/chat/${employee.id}/reset`, { method: 'POST' });
    const data = await r.json();
    setSession(data);
  }, [employee.id]);

  // Авто-отправка сценария при handoff: когда сессия уже загружена и есть pendingHandoff —
  // отправляем запрос с отметкой handoff_from, чтобы AI поздоровался по-особенному.
  const handoffFiredRef = useRef(false);
  useEffect(() => {
    if (!session || !pendingHandoff || handoffFiredRef.current) return;
    if (pendingHandoff.target_employee_id !== employee.id) return;
    handoffFiredRef.current = true;
    handleSend({
      text: pendingHandoff.request,
      scenario_id: pendingHandoff.scenario_id || null,
      handoff_from: pendingHandoff.from_employee_id || null,
    });
    onHandoffConsumed?.();
  }, [session, pendingHandoff, employee.id, handleSend, onHandoffConsumed]);

  if (!session) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/50">
        Загрузка сотрудника…
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0">
      <div
        className="border-r border-white/10 flex flex-col shrink-0"
        style={{ width: `${leftWidth}px` }}
      >
        <ChatPanel
          employee={employee}
          session={session}
          onSendMessage={handleSend}
          onApprove={handleApprove}
          onReject={handleReject}
          onResume={handleResume}
          onReset={handleReset}
          isExecuting={isExecuting}
          onOpenDocument={setViewDocId}
          planInCenter={Boolean(session?.pending_plan?.graph_nodes?.length)}
        />
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Изменить ширину колонки чата"
        onPointerDown={onResizeStart}
        onDoubleClick={onResizeDoubleClick}
        title="Потяните, чтобы изменить ширину · двойной клик — сброс"
        className="group relative w-1.5 shrink-0 cursor-col-resize bg-transparent hover:bg-cyan-400/25 transition-colors"
      >
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-white/10 group-hover:bg-cyan-400/60" />
      </div>

      <div className="flex-1 relative grid-pattern min-w-0">
        <ReactFlowProvider>
          {session?.pending_plan && session.pending_plan.graph_nodes?.length > 0 ? (
            <PlanGraph
              pendingPlan={session.pending_plan}
              employee={employee}
              templates={templates}
              onApprove={handleApprove}
              onReject={handleReject}
              onUpdate={handlePlanUpdate}
              onSaveTemplate={handleSaveTemplate}
              onLoadTemplate={handleLoadTemplate}
              disabled={isExecuting}
            />
          ) : (
            <WorkflowGraph
              workflow={workflow}
              employee={employee}
              onNodeClick={setSelectedAgent}
              emptyTitle="Граф выполнения задачи"
            />
          )}
        </ReactFlowProvider>
      </div>

      <div className="w-[380px] border-l border-white/10 flex flex-col shrink-0">
        <div className="flex border-b border-white/10">
          <TabButton active={tab === 'documents'} onClick={() => setTab('documents')}
            icon={<FileText className="w-3.5 h-3.5" />} label="Документы" count={documentsCreated.length} />
          <TabButton active={tab === 'tools'} onClick={() => setTab('tools')}
            icon={<Wrench className="w-3.5 h-3.5" />} label="Профиль" />
          <TabButton active={tab === 'reasoning'} onClick={() => setTab('reasoning')}
            icon={<Brain className="w-3.5 h-3.5" />} label="Логи ИИ" count={reasoning.length} pulseOnCount />
        </div>
        <div className="flex-1 overflow-hidden">
          {tab === 'documents' && (
            <DocumentsPanel
              employeeId={employee.id}
              newlyCreated={documentsCreated}
              onOpen={setViewDocId}
            />
          )}
          {tab === 'tools' && <ToolsPanel employee={employee} />}
          {tab === 'reasoning' && <ReasoningPanel reasoning={reasoning} logs={logs} />}
        </div>
      </div>

      <AgentDetailsModal agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
      <DocumentViewerModal docId={viewDocId} onClose={() => setViewDocId(null)} />
    </div>
  );
}

function TabButton({ active, onClick, icon, label, count, pulseOnCount }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
        active ? 'text-cyan-300 border-b-2 border-cyan-400 bg-cyan-400/5' : 'text-white/50 hover:text-white/80'
      }`}
    >
      {icon} {label}
      {count > 0 && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
          active ? 'bg-cyan-500/20 text-cyan-300' : 'bg-white/10 text-white/60'
        } ${pulseOnCount ? 'animate-pulse' : ''}`}>
          {count}
        </span>
      )}
    </button>
  );
}

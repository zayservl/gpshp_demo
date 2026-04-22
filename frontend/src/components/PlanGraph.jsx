import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background, Controls, MarkerType, useEdgesState, useNodesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { motion } from 'framer-motion';
import {
  Play, XCircle, Save, BookmarkPlus, Sparkles, ChevronDown, ChevronUp,
} from 'lucide-react';
import PlanNode from './PlanNode';
import NodeParamEditor from './NodeParamEditor';

const nodeTypes = { plan: PlanNode };

/**
 * PlanGraph — центральная панель согласования плана (до запуска).
 *
 * Источник истины — prop `pendingPlan` с бэка (в нём graph_nodes/graph_edges).
 * Локальное состояние `draft` для оптимистичных правок; синкается наверх
 * через debounced `onUpdate(draftNodes, draftEdges)`.
 */
export default function PlanGraph({
  pendingPlan,
  employee,
  onApprove,
  onReject,
  onUpdate,
  onSaveTemplate,
  onLoadTemplate,
  templates = [],
  disabled = false,
}) {
  const [draftNodes, setDraftNodes] = useState(() => pendingPlan?.graph_nodes || []);
  const [draftEdges, setDraftEdges] = useState(() => pendingPlan?.graph_edges || []);
  const [paramEditor, setParamEditor] = useState({ open: false, nodeId: null });
  const [saveOpen, setSaveOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');

  // Синхронизация с входящим pendingPlan (новый план пришёл с бэка).
  const lastPlanIdRef = useRef(null);
  useEffect(() => {
    if (!pendingPlan) return;
    if (pendingPlan.plan_id !== lastPlanIdRef.current) {
      setDraftNodes(pendingPlan.graph_nodes || []);
      setDraftEdges(pendingPlan.graph_edges || []);
      lastPlanIdRef.current = pendingPlan.plan_id;
    }
  }, [pendingPlan]);

  // Debounced push изменений наверх.
  const debounceRef = useRef(null);
  const pushUpdate = useCallback((nextNodes, nextEdges) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onUpdate?.(nextNodes, nextEdges);
    }, 350);
  }, [onUpdate]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  // --- Мутаторы ---
  const toggleRemove = useCallback((nodeId) => {
    setDraftNodes(prev => {
      const next = prev.map(n => n.id === nodeId ? { ...n, removed: !n.removed } : n);
      pushUpdate(next, draftEdges);
      return next;
    });
  }, [draftEdges, pushUpdate]);

  const togglePause = useCallback((nodeId) => {
    setDraftNodes(prev => {
      const next = prev.map(n => n.id === nodeId ? { ...n, pause_after: !n.pause_after } : n);
      pushUpdate(next, draftEdges);
      return next;
    });
  }, [draftEdges, pushUpdate]);

  const openParamEditor = useCallback((nodeId) => {
    setParamEditor({ open: true, nodeId });
  }, []);

  const applyParams = useCallback((nodeId, params) => {
    setDraftNodes(prev => {
      const next = prev.map(n => n.id === nodeId ? { ...n, editable_params: params } : n);
      pushUpdate(next, draftEdges);
      return next;
    });
    setParamEditor({ open: false, nodeId: null });
  }, [draftEdges, pushUpdate]);

  // --- Сборка ReactFlow-узлов ---
  const [rfNodes, setRfNodes, onRfNodesChange] = useNodesState([]);
  const [rfEdges, setRfEdges, onRfEdgesChange] = useEdgesState([]);

  useEffect(() => {
    const nodeWidth = 320;
    const nodeHeight = 180;
    const gap = 32;
    const startX = 400;
    const startY = 40;

    const flowNodes = draftNodes.map((n, i) => ({
      id: n.id,
      type: 'plan',
      position: { x: startX - nodeWidth / 2, y: startY + i * (nodeHeight + gap) },
      data: {
        id: n.id,
        label: n.name,
        icon: n.icon,
        tool: n.tool,
        source: n.source,
        kind: n.kind,
        editableParams: n.editable_params,
        pauseAfter: n.pause_after,
        removed: n.removed,
        handoffTo: n.handoff_to_employee_id,
        employeeColor: employee?.color,
        onToggleRemove: toggleRemove,
        onTogglePause: togglePause,
        onEditParams: openParamEditor,
      },
    }));

    const flowEdges = draftEdges.map((e) => {
      const src = draftNodes.find(n => n.id === e.source);
      const tgt = draftNodes.find(n => n.id === e.target);
      const isInactive = src?.removed || tgt?.removed;
      const color = isInactive ? '#ffffff20' : (tgt?.kind === 'handoff' ? '#fbbf2488' : '#00d4ff88');
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'smoothstep',
        style: {
          stroke: color,
          strokeWidth: 2,
          strokeDasharray: isInactive ? '4 4' : undefined,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color },
      };
    });

    setRfNodes(flowNodes);
    setRfEdges(flowEdges);
  }, [draftNodes, draftEdges, employee, toggleRemove, togglePause, openParamEditor, setRfNodes, setRfEdges]);

  const activeStats = useMemo(() => {
    const active = draftNodes.filter(n => !n.removed);
    const tools = active.filter(n => n.kind === 'tool').length;
    const pauses = active.filter(n => n.pause_after).length;
    const handoffs = active.filter(n => n.kind === 'handoff').length;
    return { tools, pauses, handoffs };
  }, [draftNodes]);

  const editingNode = useMemo(
    () => draftNodes.find(n => n.id === paramEditor.nodeId) || null,
    [draftNodes, paramEditor.nodeId]
  );

  const submitSaveTemplate = () => {
    const name = templateName.trim();
    if (!name) return;
    onSaveTemplate?.(name);
    setTemplateName('');
    setSaveOpen(false);
  };

  if (!pendingPlan) return null;

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onRfNodesChange}
        onEdgesChange={onRfEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.5}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
      >
        <Background color="rgba(251, 191, 36, 0.05)" gap={50} size={1} />
        <Controls className="!bg-gpn-dark/80 !border-white/10 !rounded-xl overflow-hidden" showInteractive={false} />
      </ReactFlow>

      {/* Верхняя панель: название и статистика */}
      <div className="absolute top-4 left-4 bg-gpn-dark/85 backdrop-blur-xl rounded-xl border border-amber-400/25 p-4 max-w-sm">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-amber-300/90 mb-1">
          <Sparkles className="w-3 h-3" /> План на согласовании
        </div>
        <h3 className="text-white font-semibold text-sm mb-1.5 leading-tight">{pendingPlan.title}</h3>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-white/70">{activeStats.tools} шагов</span>
          {activeStats.pauses > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-400/30 text-amber-300">
              {activeStats.pauses} пауз
            </span>
          )}
          {activeStats.handoffs > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-400/30 text-amber-300">
              handoff
            </span>
          )}
        </div>
        <div className="mt-2 text-[10px] text-white/40 leading-snug">
          Убирайте шаги, ставьте паузы или правьте параметры — и согласуйте план одной кнопкой.
        </div>
      </div>

      {/* Нижняя тулбар-панель: действия */}
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-gpn-dark/90 backdrop-blur-xl rounded-2xl border border-white/10 px-3 py-2.5 flex items-center gap-2 shadow-xl"
      >
        <button
          onClick={onApprove}
          disabled={disabled || activeStats.tools === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Play className="w-4 h-4" />
          Согласовать и выполнить
        </button>

        <button
          onClick={onReject}
          disabled={disabled}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-xs disabled:opacity-40 transition-colors"
        >
          <XCircle className="w-3.5 h-3.5" /> Отклонить
        </button>

        <div className="w-px h-7 bg-white/10 mx-1" />

        <div className="relative">
          <button
            onClick={() => setSaveOpen(v => !v)}
            disabled={disabled}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-xs disabled:opacity-40 transition-colors"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            Сохранить как шаблон
          </button>
          {saveOpen && (
            <div className="absolute bottom-full mb-2 right-0 bg-gpn-dark/95 backdrop-blur-xl border border-white/10 rounded-xl p-3 w-64 shadow-xl">
              <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1.5">Название шаблона</div>
              <input
                type="text"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitSaveTemplate()}
                placeholder="Напр. «Сравнение КП с юр. проверкой»"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-cyan-400/40"
                autoFocus
              />
              <div className="flex items-center gap-1.5 mt-2">
                <button
                  onClick={submitSaveTemplate}
                  disabled={!templateName.trim()}
                  className="flex-1 px-2 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black text-[11px] font-semibold disabled:opacity-40"
                >
                  <Save className="w-3 h-3 inline-block mr-1" />
                  Сохранить
                </button>
                <button
                  onClick={() => setSaveOpen(false)}
                  className="px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 text-[11px]"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>

        {templates.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setTemplatesOpen(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-xs transition-colors"
            >
              Шаблоны ({templates.length})
              {templatesOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
            </button>
            {templatesOpen && (
              <div className="absolute bottom-full mb-2 right-0 bg-gpn-dark/95 backdrop-blur-xl border border-white/10 rounded-xl p-1.5 w-72 shadow-xl max-h-64 overflow-y-auto">
                {templates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { onLoadTemplate?.(t.id); setTemplatesOpen(false); }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/5 text-xs text-white/80 hover:text-white"
                  >
                    <div className="font-medium truncate">{t.name}</div>
                    <div className="text-[10px] text-white/40 truncate">{t.title}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </motion.div>

      {paramEditor.open && editingNode && (
        <NodeParamEditor
          node={editingNode}
          onApply={(params) => applyParams(editingNode.id, params)}
          onClose={() => setParamEditor({ open: false, nodeId: null })}
        />
      )}
    </div>
  );
}

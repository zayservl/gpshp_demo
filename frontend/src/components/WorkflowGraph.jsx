import React, { useEffect } from 'react';
import ReactFlow, {
  Background, Controls, useNodesState, useEdgesState, MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { motion } from 'framer-motion';
import AgentNode from './AgentNode';

const nodeTypes = { agent: AgentNode };

const STATUS_COLORS = {
  pending: '#6b7280',
  running: '#00d4ff',
  completed: '#10b981',
  failed: '#ef4444',
};

export default function WorkflowGraph({ workflow, employee, onNodeClick, emptyTitle = 'Граф выполнения задачи' }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    if (!workflow) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const nodeWidth = 320;
    const nodeHeight = 140;
    const verticalGap = 30;
    const startX = 400;
    const startY = 50;

    const flowNodes = workflow.nodes.map((node, index) => ({
      id: node.id,
      type: 'agent',
      position: { x: startX - nodeWidth / 2, y: startY + index * (nodeHeight + verticalGap) },
      data: {
        id: node.id,
        label: node.name,
        icon: node.icon,
        status: node.status,
        color: node.color,
        description: node.description,
        duration: node.duration_ms,
        config: node.config || {},
        onNodeClick: onNodeClick,
      },
    }));

    const flowEdges = workflow.edges.map((edge) => {
      const sourceNode = workflow.nodes.find(n => n.id === edge.source);
      const edgeColor = sourceNode?.status === 'completed'
        ? STATUS_COLORS.completed
        : sourceNode?.status === 'running'
          ? STATUS_COLORS.running
          : STATUS_COLORS.pending;

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        animated: sourceNode?.status === 'running',
        style: { stroke: edgeColor, strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
      };
    });

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [workflow, setNodes, setEdges, onNodeClick]);

  useEffect(() => {
    if (!workflow) return;
    setEdges((eds) =>
      eds.map((edge) => {
        const sourceNode = workflow.nodes.find(n => n.id === edge.source);
        const edgeColor = sourceNode?.status === 'completed'
          ? STATUS_COLORS.completed
          : sourceNode?.status === 'running'
            ? STATUS_COLORS.running
            : STATUS_COLORS.pending;
        return {
          ...edge,
          animated: sourceNode?.status === 'running',
          style: { ...edge.style, stroke: edgeColor },
          markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
        };
      })
    );
  }, [workflow?.nodes, setEdges]);

  if (!workflow) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center max-w-md px-6">
          <div
            className="w-24 h-24 mx-auto mb-6 rounded-2xl flex items-center justify-center border"
            style={{
              background: `${employee?.color || '#00d4ff'}1a`,
              borderColor: `${employee?.color || '#00d4ff'}55`,
            }}
          >
            <span className="text-5xl">{employee?.avatar || '🤖'}</span>
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">{emptyTitle}</h3>
          <p className="text-white/50 text-sm">
            Поставьте задачу {employee?.short_name || 'сотруднику'} в левой панели — и здесь вы увидите живой ход
            выполнения: какие инструменты задействованы, к каким системам подключается и как формируется результат.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.5}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="rgba(0, 212, 255, 0.05)" gap={50} size={1} />
        <Controls className="!bg-gpn-dark/80 !border-white/10 !rounded-xl overflow-hidden" showInteractive={false} />
      </ReactFlow>

      <div className="absolute top-4 left-4 bg-gpn-dark/80 backdrop-blur-xl rounded-xl border border-white/10 p-4 max-w-xs">
        <h3 className="text-white font-semibold text-sm mb-1">{workflow.name}</h3>
        <p className="text-white/50 text-xs mb-2">{workflow.description}</p>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
            workflow.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400'
            : workflow.status === 'running' ? 'bg-cyan-500/20 text-cyan-400'
            : workflow.status === 'failed' ? 'bg-red-500/20 text-red-400'
            : 'bg-gray-500/20 text-gray-400'
          }`}>
            <span className={`w-2 h-2 rounded-full ${workflow.status === 'running' ? 'animate-pulse' : ''} ${
              workflow.status === 'completed' ? 'bg-emerald-400'
              : workflow.status === 'running' ? 'bg-cyan-400'
              : workflow.status === 'failed' ? 'bg-red-400' : 'bg-gray-400'
            }`} />
            {workflow.status === 'completed' ? 'Завершён'
             : workflow.status === 'running' ? 'Выполняется'
             : workflow.status === 'failed' ? 'Ошибка' : 'Ожидание'}
          </span>
          <span className="text-white/40 text-xs">{workflow.nodes.length} шагов</span>
        </div>
      </div>
    </div>
  );
}

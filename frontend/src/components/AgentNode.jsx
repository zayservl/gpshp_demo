import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { motion } from 'framer-motion';
import { CheckCircle, Loader2, Clock, XCircle, ChevronRight } from 'lucide-react';

const STATUS_STYLES = {
  pending: { border: 'border-gray-500/50', bg: 'bg-gray-500/10', glow: '', icon: Clock, iconColor: 'text-gray-400' },
  running: { border: 'border-cyan-400', bg: 'bg-cyan-400/10', glow: 'shadow-[0_0_20px_rgba(0,212,255,0.3)]', icon: Loader2, iconColor: 'text-cyan-400' },
  completed: { border: 'border-emerald-400', bg: 'bg-emerald-400/10', glow: '', icon: CheckCircle, iconColor: 'text-emerald-400' },
  failed: { border: 'border-red-400', bg: 'bg-red-400/10', glow: '', icon: XCircle, iconColor: 'text-red-400' },
};

function AgentNode({ data, isConnectable }) {
  const { label, icon, status, color, description, duration, config, onNodeClick } = data;
  const styles = STATUS_STYLES[status] || STATUS_STYLES.pending;
  const StatusIcon = styles.icon;

  const tool = config?.tool;
  const source = config?.source;

  const handleClick = () => {
    onNodeClick?.({
      id: data.id,
      name: label,
      tool,
      source,
      status,
      duration,
      description,
      icon,
      color,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={handleClick}
      className={`relative w-[320px] rounded-xl border-2 backdrop-blur-xl cursor-pointer hover:scale-[1.02] transition-transform ${styles.border} ${styles.bg} ${styles.glow}`}
    >
      <Handle type="target" position={Position.Top} isConnectable={isConnectable} className="!w-3 !h-3 !bg-gpn-accent !border-2 !border-gpn-dark" />

      <div className="p-4">
        <div className="flex items-start gap-3 mb-2">
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl flex-shrink-0"
            style={{ backgroundColor: `${color}22` }}
          >
            {icon || '⚙️'}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-medium text-sm leading-tight line-clamp-2">{label}</h3>
            {tool && (
              <p className="text-cyan-300 text-xs mt-1 font-mono truncate" title={tool}>
                {tool}
              </p>
            )}
          </div>
          <div className={`flex-shrink-0 ${styles.iconColor}`}>
            <StatusIcon className={`w-5 h-5 ${status === 'running' ? 'animate-spin' : ''}`} />
          </div>
        </div>

        {source && source !== '—' && (
          <div className="text-[11px] text-white/50 truncate" title={source}>
            Источник: {source}
          </div>
        )}

        {status === 'running' && (
          <div className="h-1 bg-white/10 rounded-full overflow-hidden mt-2">
            <motion.div
              className="h-full bg-cyan-400"
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 3, ease: 'linear', repeat: Infinity }}
            />
          </div>
        )}

        <div className="flex items-center justify-between mt-2">
          {status === 'completed' && duration && (
            <div className="text-xs text-white/40 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {(duration / 1000).toFixed(1)}s
            </div>
          )}
          <div className="text-xs text-white/30 flex items-center gap-1 ml-auto">
            Подробнее <ChevronRight className="w-3 h-3" />
          </div>
        </div>
      </div>

      {status === 'running' && (
        <motion.div
          className="absolute inset-0 rounded-xl border-2 border-cyan-400 pointer-events-none"
          initial={{ opacity: 1, scale: 1 }}
          animate={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}

      <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} className="!w-3 !h-3 !bg-gpn-accent !border-2 !border-gpn-dark" />
    </motion.div>
  );
}

export default memo(AgentNode);

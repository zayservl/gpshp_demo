import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { motion } from 'framer-motion';
import { Pause, Pencil, Trash2, RotateCcw, ArrowRight, Link2 } from 'lucide-react';

/**
 * Узел планового графа (editable). Отличается от AgentNode тем, что
 * показывает текущие правки пользователя (removed, pause_after) и даёт
 * кнопки: удалить/восстановить, поставить паузу, открыть редактор параметров.
 */
function PlanNode({ data, isConnectable }) {
  const {
    id,
    label,
    icon,
    tool,
    source,
    kind,
    editableParams,
    pauseAfter,
    removed,
    handoffTo,
    employeeColor,
    onToggleRemove,
    onTogglePause,
    onEditParams,
  } = data;

  const isHandoff = kind === 'handoff';
  const hasEditable = editableParams && Object.keys(editableParams).length > 0;

  const borderColor = removed
    ? 'border-white/10'
    : isHandoff
      ? 'border-amber-400/60'
      : 'border-cyan-400/50';

  const bgColor = removed
    ? 'bg-gpn-dark/40 opacity-50'
    : isHandoff
      ? 'bg-amber-500/5'
      : 'bg-gpn-dark/80';

  const accentColor = isHandoff ? '#fbbf24' : (employeeColor || '#00d4ff');

  const stopClick = (e) => { e.stopPropagation(); };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`relative w-[320px] rounded-xl border-2 backdrop-blur-xl ${borderColor} ${bgColor} transition-all`}
    >
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className="!w-2.5 !h-2.5 !bg-white/30 !border-2 !border-gpn-dark"
      />

      <div className="p-3">
        <div className="flex items-start gap-2.5 mb-2">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0"
            style={{ backgroundColor: `${accentColor}22` }}
          >
            {icon || (isHandoff ? '🤝' : '⚙️')}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`text-sm leading-tight ${
              removed ? 'text-white/40 line-through' : 'text-white font-medium'
            }`}>
              {label}
            </h3>
            {tool && !isHandoff && (
              <p className="text-[11px] mt-0.5 font-mono truncate text-cyan-300/80" title={tool}>
                {tool}
              </p>
            )}
            {isHandoff && handoffTo && (
              <p className="text-[11px] mt-0.5 text-amber-300/90 flex items-center gap-1">
                <Link2 className="w-3 h-3" /> {handoffTo}
              </p>
            )}
          </div>
        </div>

        {source && source !== '—' && (
          <div className="text-[10px] text-white/50 truncate mb-2" title={source}>
            {isHandoff ? source : `Источник: ${source}`}
          </div>
        )}

        {hasEditable && !removed && (
          <div className="flex flex-wrap gap-1 mb-2">
            {Object.entries(editableParams).map(([k, v]) => (
              <span
                key={k}
                className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-400/20 text-cyan-200 font-mono"
                title={`${k}=${v}`}
              >
                {k}: {String(v)}
              </span>
            ))}
          </div>
        )}

        {/* Нижняя панель управления: pause / edit / remove */}
        <div className="flex items-center gap-1 mt-1 pt-2 border-t border-white/5">
          {!removed && !isHandoff && (
            <button
              onClick={(e) => { stopClick(e); onTogglePause?.(id); }}
              className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                pauseAfter
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                  : 'text-white/40 hover:text-amber-300 hover:bg-amber-500/10 border border-transparent'
              }`}
              title={pauseAfter ? 'Снять паузу' : 'Пауза после шага'}
            >
              <Pause className="w-2.5 h-2.5" />
              {pauseAfter ? 'пауза ON' : 'пауза'}
            </button>
          )}

          {!removed && hasEditable && !isHandoff && (
            <button
              onClick={(e) => { stopClick(e); onEditParams?.(id); }}
              className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded text-white/40 hover:text-cyan-300 hover:bg-cyan-500/10 border border-transparent"
              title="Редактировать параметры"
            >
              <Pencil className="w-2.5 h-2.5" /> параметры
            </button>
          )}

          <div className="flex-1" />

          <button
            onClick={(e) => { stopClick(e); onToggleRemove?.(id); }}
            className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors ${
              removed
                ? 'text-emerald-300 hover:bg-emerald-500/10'
                : 'text-white/40 hover:text-red-300 hover:bg-red-500/10'
            } border border-transparent`}
            title={removed ? 'Вернуть шаг' : (isHandoff ? 'Убрать handoff' : 'Удалить шаг')}
          >
            {removed ? <RotateCcw className="w-2.5 h-2.5" /> : <Trash2 className="w-2.5 h-2.5" />}
            {removed ? 'вернуть' : (isHandoff ? 'не нужен' : 'убрать')}
          </button>
        </div>

        {isHandoff && !removed && (
          <div className="mt-2 text-[10px] text-amber-300/70 flex items-center gap-1">
            <ArrowRight className="w-2.5 h-2.5" />
            после завершения передам задачу следующему сотруднику
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className="!w-2.5 !h-2.5 !bg-white/30 !border-2 !border-gpn-dark"
      />
    </motion.div>
  );
}

export default memo(PlanNode);

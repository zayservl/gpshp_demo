import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, CheckCircle, Loader2, Wrench, BookOpen } from 'lucide-react';

const STATUS_LABEL = {
  pending: 'Ожидает',
  running: 'Выполняется',
  completed: 'Завершён',
  failed: 'Ошибка',
};

export default function AgentDetailsModal({ agent, onClose }) {
  return (
    <AnimatePresence>
      {agent && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-center justify-center p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
            onClick={e => e.stopPropagation()}
            className="bg-gpn-dark border border-white/10 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden"
          >
            <div className="p-5 border-b border-white/10 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                  style={{ backgroundColor: `${agent.color}22`, border: `1px solid ${agent.color}66` }}
                >
                  {agent.icon}
                </div>
                <div>
                  <div className="text-white font-semibold text-lg">{agent.name}</div>
                  <div className="text-xs text-white/50">Шаг выполнения плана</div>
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-sm">
              {agent.description && (
                <div className="text-white/70">{agent.description}</div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {agent.tool && (
                  <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/40 mb-1">
                      <Wrench className="w-3 h-3" /> Инструмент
                    </div>
                    <div className="text-white font-mono text-[13px]">{agent.tool}</div>
                  </div>
                )}
                {agent.source && agent.source !== '—' && (
                  <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/40 mb-1">
                      <BookOpen className="w-3 h-3" /> Источник
                    </div>
                    <div className="text-white text-[13px]">{agent.source}</div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-white/70">
                  {agent.status === 'completed' && <CheckCircle className="w-4 h-4 text-emerald-400" />}
                  {agent.status === 'running' && <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />}
                  <span>{STATUS_LABEL[agent.status] || agent.status}</span>
                </div>
                {agent.duration && (
                  <div className="flex items-center gap-1.5 text-white/50">
                    <Clock className="w-4 h-4" />
                    {(agent.duration / 1000).toFixed(1)}с
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

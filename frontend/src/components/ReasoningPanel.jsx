import React from 'react';
import { Brain, Clock, CheckCircle2, XCircle, Cog, Lightbulb, Terminal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const STAGE_MAP = {
  intent: { icon: Lightbulb, color: 'text-amber-300' },
  clarification: { icon: Cog, color: 'text-amber-300' },
  planning: { icon: Brain, color: 'text-purple-300' },
  step: { icon: Cog, color: 'text-cyan-300' },
  generation: { icon: Brain, color: 'text-violet-300' },
  decision: { icon: CheckCircle2, color: 'text-emerald-300' },
};

const LEVEL_STYLES = {
  INFO: 'text-white/70',
  DEBUG: 'text-white/50',
  ERROR: 'text-red-300',
  WARNING: 'text-amber-300',
  SUCCESS: 'text-emerald-300',
  success: 'text-emerald-300',
};

export default function ReasoningPanel({ reasoning = [], logs = [] }) {
  const merged = [...reasoning, ...logs]
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(-120);

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-white/10">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-300" />
          Логи ИИ
        </h2>
        <p className="text-xs text-white/50 mt-0.5">
          Прозрачный ход рассуждения: какие решения принимал сотрудник и какие инструменты вызывал.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {merged.length === 0 && (
          <div className="text-white/30 text-center py-8 text-sm">
            Логи появятся во время выполнения задачи.
          </div>
        )}
        <AnimatePresence initial={false}>
          {merged.map((entry, i) => (
            <motion.div
              key={`${entry.id || entry.timestamp}-${i}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-lg p-2.5 border text-[12px] ${
                entry.stage
                  ? 'bg-purple-500/[0.06] border-purple-400/20'
                  : 'bg-white/[0.03] border-white/10'
              }`}
            >
              {entry.stage ? (
                <ReasoningItem entry={entry} />
              ) : (
                <LogItem entry={entry} />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ReasoningItem({ entry }) {
  const meta = STAGE_MAP[entry.stage] || STAGE_MAP.step;
  const Icon = meta.icon;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
        <span className={`text-[10px] uppercase tracking-wider ${meta.color}`}>
          {entry.stage}
        </span>
        <span className="ml-auto text-[10px] text-white/30">
          {fmtTime(entry.timestamp)}
        </span>
      </div>
      <div className="text-white font-medium">{entry.title}</div>
      <div className="text-white/70 leading-snug">{entry.content}</div>
    </div>
  );
}

function LogItem({ entry }) {
  const cls = LEVEL_STYLES[entry.level] || 'text-white/70';
  return (
    <div className="flex items-start gap-2">
      <Terminal className="w-3 h-3 text-white/30 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="text-white/40">{fmtTime(entry.timestamp)}</span>
          <span className="text-white/50 font-mono truncate">{entry.agent}</span>
        </div>
        <div className={`leading-snug ${cls}`}>{entry.message}</div>
      </div>
    </div>
  );
}

function fmtTime(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('ru-RU', { hour12: false });
  } catch {
    return '';
  }
}

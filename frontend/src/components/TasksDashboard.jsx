import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, Clock, Filter, KanbanSquare, PauseCircle, User, XCircle } from 'lucide-react';

const STATUS_META = {
  todo: { label: 'Todo', icon: Circle, className: 'bg-white/5 border-white/10 text-white/70' },
  in_progress: { label: 'In progress', icon: Clock, className: 'bg-cyan-500/10 border-cyan-400/25 text-cyan-200' },
  done: { label: 'Done', icon: CheckCircle2, className: 'bg-emerald-500/10 border-emerald-400/25 text-emerald-200' },
  blocked: { label: 'Blocked', icon: XCircle, className: 'bg-amber-500/10 border-amber-400/25 text-amber-200' },
  paused: { label: 'Paused', icon: PauseCircle, className: 'bg-amber-500/10 border-amber-400/25 text-amber-200' },
};

function formatTs(ts) {
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  } catch {
    return '';
  }
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.todo;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border ${meta.className}`}>
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  );
}

export default function TasksDashboard({ tasks = [], employeesById = {}, onOpenEmployee }) {
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [selectedId, setSelectedId] = useState(null);

  const filtered = useMemo(() => {
    return (tasks || [])
      .filter(t => filterStatus === 'all' ? true : t.status === filterStatus)
      .filter(t => filterAssignee === 'all' ? true : t.assignee_employee_id === filterAssignee)
      .sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''));
  }, [tasks, filterStatus, filterAssignee]);

  const selected = useMemo(() => filtered.find(t => t.id === selectedId) || null, [filtered, selectedId]);

  const employees = useMemo(() => {
    const arr = Object.values(employeesById || {});
    return arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [employeesById]);

  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      <div className="h-full flex">
        {/* Left: list */}
        <div className="w-[520px] border-r border-white/10 bg-gpn-dark/60 flex flex-col min-h-0">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KanbanSquare className="w-5 h-5 text-cyan-300" />
              <div>
                <div className="text-white font-semibold">Задачи</div>
                <div className="text-[11px] text-white/50">Jira-лайт: распределение между AI-сотрудниками</div>
              </div>
            </div>
            <div className="text-[11px] text-white/40">{filtered.length} шт.</div>
          </div>

          <div className="px-6 py-3 border-b border-white/10 flex items-center gap-2">
            <Filter className="w-4 h-4 text-white/40" />
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setSelectedId(null); }}
              className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/80 focus:outline-none"
            >
              <option value="all">Все статусы</option>
              <option value="todo">Todo</option>
              <option value="in_progress">In progress</option>
              <option value="paused">Paused</option>
              <option value="blocked">Blocked</option>
              <option value="done">Done</option>
            </select>
            <select
              value={filterAssignee}
              onChange={(e) => { setFilterAssignee(e.target.value); setSelectedId(null); }}
              className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/80 focus:outline-none"
            >
              <option value="all">Все исполнители</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-2">
              {filtered.length === 0 && (
                <div className="text-white/50 text-sm px-2 py-6 text-center">
                  Пока нет задач. Они появятся при запуске сценариев и handoff между сотрудниками.
                </div>
              )}
              {filtered.map(t => {
                const assignee = employeesById?.[t.assignee_employee_id];
                const requester = employeesById?.[t.requester_employee_id];
                const isSelected = selectedId === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className={`w-full text-left rounded-xl border p-3 transition-colors ${
                      isSelected ? 'bg-cyan-500/10 border-cyan-400/30' : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm text-white font-semibold truncate">{t.title}</div>
                        {t.subtitle && (
                          <div className="text-[11px] text-white/50 truncate mt-0.5">{t.subtitle}</div>
                        )}
                      </div>
                      <StatusPill status={t.status} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-white/40">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <User className="w-3.5 h-3.5" />
                        <span className="truncate">
                          {assignee?.name || t.assignee_employee_id || '—'}
                          {requester?.name ? ` · от ${requester.name}` : ''}
                        </span>
                      </div>
                      <div className="shrink-0">{formatTs(t.updated_at || t.created_at)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: details */}
        <div className="flex-1 min-w-0 bg-gpn-dark/40 flex flex-col min-h-0">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KanbanSquare className="w-5 h-5 text-white/40" />
              <div className="text-white/80 font-medium">Детали</div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <AnimatePresence mode="wait">
              {!selected ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="text-white/50 text-sm"
                >
                  Выберите задачу слева, чтобы увидеть детали.
                </motion.div>
              ) : (
                <motion.div
                  key={selected.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xl font-semibold text-white">{selected.title}</div>
                      {selected.subtitle && <div className="text-sm text-white/60 mt-1">{selected.subtitle}</div>}
                    </div>
                    <StatusPill status={selected.status} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-[10px] uppercase tracking-wider text-white/40">Исполнитель</div>
                      <div className="text-sm text-white mt-1">
                        {employeesById?.[selected.assignee_employee_id]?.name || selected.assignee_employee_id || '—'}
                      </div>
                      {selected.assignee_employee_id && onOpenEmployee && (
                        <button
                          onClick={() => onOpenEmployee(selected.assignee_employee_id)}
                          className="mt-2 text-[11px] px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-400/20 text-cyan-200 hover:bg-cyan-500/20"
                        >
                          Открыть сотрудника
                        </button>
                      )}
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-[10px] uppercase tracking-wider text-white/40">Временные метки</div>
                      <div className="text-[12px] text-white/70 mt-1 space-y-0.5">
                        <div>Создана: <span className="text-white/90">{formatTs(selected.created_at)}</span></div>
                        <div>Обновлена: <span className="text-white/90">{formatTs(selected.updated_at || selected.created_at)}</span></div>
                      </div>
                    </div>
                  </div>

                  {selected.events?.length > 0 && (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
                      <div className="px-3 py-2 border-b border-white/10 text-[10px] uppercase tracking-wider text-white/40 flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5" />
                        Лента событий
                      </div>
                      <div className="p-3 space-y-2">
                        {selected.events.slice().reverse().slice(0, 12).map((ev, idx) => (
                          <div key={idx} className="text-[12px] text-white/75 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-white/90">{ev.label}</div>
                              {ev.detail && <div className="text-[11px] text-white/50 truncate">{ev.detail}</div>}
                            </div>
                            <div className="text-[11px] text-white/40 shrink-0">{formatTs(ev.at)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}


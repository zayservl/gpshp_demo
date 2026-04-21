import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, CircleDot } from 'lucide-react';

export default function EmployeesScreen({ onSelectEmployee }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let ignore = false;
    fetch('/api/employees')
      .then(r => r.json())
      .then(data => {
        if (ignore) return;
        setEmployees(data.employees || []);
        setLoading(false);
      })
      .catch(e => {
        if (ignore) return;
        setError(e.message);
        setLoading(false);
      });
    return () => { ignore = true; };
  }, []);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-8 py-12">
        <div className="mb-10">
          <div className="text-xs uppercase tracking-widest text-cyan-400/80 mb-2">
            AI-сотрудники АО «Газпром Шельфпроект»
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">
            Команда цифровых сотрудников
          </h1>
          <p className="text-white/60 max-w-3xl">
            Взаимодействуйте с AI-сотрудниками как с коллегами: поставьте задачу, утвердите план и получите
            результат с прозрачным обоснованием. Каждый сотрудник специализирован на своём направлении и
            подключён к ключевым системам ГШП.
          </p>
        </div>

        {loading && (
          <div className="text-white/50">Загрузка сотрудников…</div>
        )}
        {error && (
          <div className="text-red-400">Не удалось загрузить сотрудников: {error}</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {employees.map((emp, i) => (
            <motion.button
              key={emp.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              onClick={() => onSelectEmployee(emp)}
              className="text-left bg-white/5 hover:bg-white/[0.07] border border-white/10 hover:border-cyan-400/40 rounded-2xl p-6 transition-all group"
              style={{ boxShadow: `0 0 0 1px ${emp.color}10` }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
                    style={{ background: `${emp.color}18`, border: `1px solid ${emp.color}55` }}
                  >
                    {emp.avatar}
                  </div>
                  <div>
                    <div className="text-white font-semibold text-lg">{emp.name}</div>
                    <div className="text-white/50 text-sm">{emp.role}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full">
                  <CircleDot className="w-3 h-3" />
                  Активен
                </div>
              </div>

              <p className="text-white/70 text-sm mb-4 line-clamp-3">
                {emp.description}
              </p>

              <div className="mb-4">
                <div className="text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
                  Инструменты
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {emp.tools.slice(0, 4).map(t => (
                    <span
                      key={t.name}
                      className="text-[11px] px-2 py-1 rounded-md bg-white/[0.06] border border-white/10 text-white/70"
                    >
                      {t.icon} {t.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-white/10">
                <div className="text-xs text-white/50">
                  {emp.scenarios_count || 0} готовых сценариев
                </div>
                <div
                  className="flex items-center gap-1.5 text-sm font-medium"
                  style={{ color: emp.color }}
                >
                  Начать диалог
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}

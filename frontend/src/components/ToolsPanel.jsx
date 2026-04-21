import React from 'react';
import { Wrench, Database, Users } from 'lucide-react';

export default function ToolsPanel({ employee }) {
  if (!employee) return null;
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-white/10">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <Wrench className="w-4 h-4 text-cyan-400" />
          Профиль сотрудника
        </h2>
        <p className="text-xs text-white/50 mt-0.5">
          Обязанности, инструменты и доступ к системам.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-white/40 mb-2 flex items-center gap-1.5">
            <Users className="w-3 h-3" /> Должностные обязанности
          </div>
          <ul className="space-y-1.5">
            {employee.responsibilities?.map((r, i) => (
              <li key={i} className="text-[13px] text-white/80 leading-snug flex gap-2">
                <span className="text-cyan-400 mt-0.5">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wider text-white/40 mb-2 flex items-center gap-1.5">
            <Wrench className="w-3 h-3" /> Инструменты
          </div>
          <div className="flex flex-col gap-1.5">
            {employee.tools?.map(t => (
              <div
                key={t.name}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white/[0.04] border border-white/10"
              >
                <div className="text-lg">{t.icon}</div>
                <div className="flex-1">
                  <div className="text-[13px] text-white font-medium leading-tight">{t.label}</div>
                  <div className="text-[10px] text-white/40 font-mono">{t.name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wider text-white/40 mb-2 flex items-center gap-1.5">
            <Database className="w-3 h-3" /> Системы и базы
          </div>
          <div className="grid grid-cols-2 gap-2">
            {['СЭД ГШП', 'ERP / 1C', 'База ЛНА', 'Реестр поставщиков'].map(s => (
              <div
                key={s}
                className="text-[12px] text-white/70 px-2 py-1.5 rounded-md bg-white/[0.04] border border-white/10 text-center"
              >
                {s}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

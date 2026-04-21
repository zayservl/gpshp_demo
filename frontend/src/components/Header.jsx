import React from 'react';
import { Wifi, WifiOff, Users, ArrowLeft } from 'lucide-react';

const GSPLogo = () => (
  <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="gspGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#0066cc" />
        <stop offset="100%" stopColor="#00d4ff" />
      </linearGradient>
    </defs>
    <circle cx="26" cy="26" r="26" fill="url(#gspGrad)" />
    <text x="26" y="23" textAnchor="middle" fontFamily="Inter, Arial, sans-serif" fontSize="14" fontWeight="800" fill="white" letterSpacing="0.5">
      ГШП
    </text>
    <text x="26" y="38" textAnchor="middle" fontFamily="Inter, Arial, sans-serif" fontSize="7" fontWeight="700" fill="#e0f2fe" letterSpacing="2">
      AI STAFF
    </text>
  </svg>
);

export default function Header({ isConnected, activeEmployee, onBack }) {
  return (
    <header className="h-16 bg-gpn-dark/80 backdrop-blur-xl border-b border-white/10 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center shadow-lg shadow-cyan-500/20 border-2 border-cyan-400/30">
          <GSPLogo />
        </div>
        <div className="h-8 w-px bg-white/20"></div>
        <div>
          <h1 className="text-lg font-semibold text-white">
            Платформа AI-сотрудников
          </h1>
          <p className="text-xs text-white/50">
            АО «Газпром Шельфпроект» · прототип v2.0
          </p>
        </div>

        {activeEmployee && (
          <>
            <div className="h-8 w-px bg-white/10 ml-2"></div>
            <button
              onClick={onBack}
              className="ml-1 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
              title="Вернуться к списку сотрудников"
            >
              <ArrowLeft className="w-4 h-4" />
              <Users className="w-4 h-4" />
              <span className="text-sm">Сотрудники</span>
            </button>
            <div className="ml-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
              <span className="text-xl leading-none">{activeEmployee.avatar}</span>
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-semibold text-white">{activeEmployee.name}</span>
                <span className="text-[11px] text-white/50">{activeEmployee.role}</span>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-6">
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${
          isConnected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
        }`}>
          {isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
          <span className="text-sm font-medium">{isConnected ? 'Подключено' : 'Отключено'}</span>
        </div>
        <div className="text-white/30 text-sm border-l border-white/10 pl-6">
          qwen3.5:2b · local
        </div>
      </div>
    </header>
  );
}

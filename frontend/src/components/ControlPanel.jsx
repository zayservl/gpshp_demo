import React, { useState } from 'react';
import { Play, Loader2, CheckCircle, XCircle, FileText, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PRESET_REQUESTS = [
  {
    id: 1,
    title: "📋 Полный пакет закрытия",
    text: "Создать пакет документов для закрытия объёмов работ по договору ГПН-БС/2024-1847 за январь 2025 года",
    contract_id: "CNT-2024-001",
    period: "Январь 2025",
    category: "complex"
  },
  {
    id: 2,
    title: "🔍 Только сбор данных",
    text: "Собрать информацию о выполненных работах из всех производственных систем за январь 2025 без формирования документов",
    contract_id: "CNT-2024-001",
    period: "Январь 2025",
    category: "simple"
  },
  {
    id: 3,
    title: "📄 Формирование акта",
    text: "Сформировать только акт выполненных работ КС-2 по имеющимся данным договора",
    contract_id: "CNT-2024-001",
    period: "Январь 2025",
    category: "simple"
  },
  {
    id: 4,
    title: "✅ Запуск согласования",
    text: "Запустить маршрут согласования для готовых документов и отправить в ERP после подписания",
    contract_id: "CNT-2024-001",
    period: "Январь 2025",
    category: "simple"
  },
  {
    id: 5,
    title: "🚛 Транспортные услуги",
    text: "Сформировать акты по договору транспортных услуг ГПН-ТС/2024-2156 за январь 2025",
    contract_id: "CNT-2024-002",
    period: "Январь 2025",
    category: "complex"
  },
  {
    id: 6,
    title: "🔧 Капитальный ремонт скважин",
    text: "Создать пакет документов для закрытия работ по капитальному ремонту скважины №1845 за январь 2025",
    contract_id: "CNT-2024-003",
    period: "Январь 2025",
    category: "complex"
  },
  {
    id: 7,
    title: "📊 Геофизические исследования",
    text: "Сформировать акты выполненных работ по геофизическим исследованиям скважин за январь 2025",
    contract_id: "CNT-2024-004",
    period: "Январь 2025",
    category: "complex"
  }
];

export default function ControlPanel({ onStart, isRunning, result }) {
  const [selectedPreset, setSelectedPreset] = useState(PRESET_REQUESTS[0]);
  const [customText, setCustomText] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  const handleStart = () => {
    if (isRunning) return;
    
    const request = useCustom 
      ? { text: customText }
      : { 
          text: selectedPreset.text,
          contract_id: selectedPreset.contract_id,
          period: selectedPreset.period
        };
    
    onStart(request);
  };

  return (
    <div className="p-4 border-b border-white/10">
      {/* Title */}
      <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <FileText className="w-5 h-5 text-gpn-accent" />
        Запрос подрядчика
      </h2>

      {/* Preset Selection */}
      <div className="space-y-2 mb-4 max-h-[280px] overflow-y-auto pr-1">
        {/* Complex scenarios */}
        <div className="text-xs text-white/40 uppercase tracking-wide mb-1">Комплексные сценарии</div>
        {PRESET_REQUESTS.filter(p => p.category === 'complex').map((preset) => (
          <button
            key={preset.id}
            onClick={() => {
              setSelectedPreset(preset);
              setUseCustom(false);
            }}
            disabled={isRunning}
            className={`w-full text-left p-3 rounded-lg border transition-all ${
              !useCustom && selectedPreset.id === preset.id
                ? 'border-gpn-accent bg-gpn-accent/10 text-white'
                : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
            } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="font-medium text-sm">{preset.title}</div>
            <div className="text-xs text-white/50 mt-1 line-clamp-2">
              {preset.text}
            </div>
          </button>
        ))}
        
        {/* Simple scenarios */}
        <div className="text-xs text-white/40 uppercase tracking-wide mb-1 mt-3">Простые сценарии</div>
        {PRESET_REQUESTS.filter(p => p.category === 'simple').map((preset) => (
          <button
            key={preset.id}
            onClick={() => {
              setSelectedPreset(preset);
              setUseCustom(false);
            }}
            disabled={isRunning}
            className={`w-full text-left p-3 rounded-lg border transition-all ${
              !useCustom && selectedPreset.id === preset.id
                ? 'border-emerald-400 bg-emerald-400/10 text-white'
                : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
            } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="font-medium text-sm flex items-center justify-between">
              {preset.title}
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                {preset.category === 'simple' ? 'быстрый' : ''}
              </span>
            </div>
            <div className="text-xs text-white/50 mt-1 line-clamp-2">
              {preset.text}
            </div>
          </button>
        ))}
      </div>

      {/* Custom Input */}
      <div className="mb-4">
        <button
          onClick={() => setUseCustom(!useCustom)}
          className="text-sm text-gpn-accent hover:text-gpn-accent/80 mb-2"
        >
          {useCustom ? '← Выбрать из списка' : 'Свой запрос →'}
        </button>
        
        <AnimatePresence>
          {useCustom && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
            >
              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Введите запрос..."
                disabled={isRunning}
                className="w-full h-24 bg-white/5 border border-white/10 rounded-lg p-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-gpn-accent resize-none"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Start Button */}
      <button
        onClick={handleStart}
        disabled={isRunning || (useCustom && !customText.trim())}
        className={`w-full py-3 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all ${
          isRunning
            ? 'bg-gpn-accent/50 cursor-wait'
            : 'bg-gradient-to-r from-gpn-accent to-gpn-blue hover:opacity-90 glow-cyan'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {isRunning ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Выполнение...
          </>
        ) : (
          <>
            <Play className="w-5 h-5" />
            Запустить агентов
          </>
        )}
      </button>

      {/* Result */}
      <AnimatePresence>
        {result && !isRunning && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`mt-4 p-4 rounded-xl border ${
              result.success
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-red-500/10 border-red-500/30'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              {result.success ? (
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              ) : (
                <XCircle className="w-5 h-5 text-red-400" />
              )}
              <span className={`font-medium ${
                result.success ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {result.success ? 'Выполнено успешно' : 'Ошибка выполнения'}
              </span>
            </div>
            
            {result.success && (
              <div className="text-sm text-white/70 space-y-1">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Время: {(result.duration_ms / 1000).toFixed(1)} сек
                </div>
                <div>Документов создано: {result.documents_created?.length || 0}</div>
                {result.total_amount && (
                  <div className="text-gpn-accent font-semibold">
                    Сумма: {result.total_amount.toLocaleString('ru-RU', { 
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })} ₽
                  </div>
                )}
              </div>
            )}
            
            {result.errors?.length > 0 && (
              <div className="text-sm text-red-400 mt-2">
                {result.errors.join(', ')}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

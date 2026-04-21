import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Brain, 
  Code, 
  ChevronDown, 
  ChevronUp, 
  Sparkles, 
  Server,
  MessageSquare,
  Lightbulb,
  Copy,
  Check,
  Eye,
  EyeOff
} from 'lucide-react';

// API endpoints для отображения
const SYSTEM_ENDPOINTS = {
  era: 'GET /api/v1/era/drilling-data',
  smb: 'GET /api/v1/smb/actual-works',
  contracts: 'GET /api/v1/contracts/{id}',
  sus: 'POST /api/v1/documents/generate',
  edo: 'POST /api/v1/edo/routes',
  erp: 'POST /api/v1/erp/accounting',
};

// Описание почему выбран каждый агент
const AGENT_REASONING = {
  DATA_AGENT: {
    collect_contract_data: 'Необходимо получить условия договора и расценки для расчёта стоимости работ',
    collect_actual_works: 'Сбор фактических данных из производственных систем для формирования акта'
  },
  EXECUTOR_AGENT: {
    generate_act: 'Формирование акта КС-2 на основании собранных данных и расценок договора',
    generate_invoice: 'Создание счёта-фактуры на основании сформированного акта'
  },
  APPROVAL_AGENT: {
    start_approval: 'Запуск маршрута согласования для получения одобрения всех служб',
    sign_documents: 'Подписание документов электронной подписью для юридической значимости'
  },
  ERP_AGENT: {
    send_to_erp: 'Передача документов в ERP для учёта и планирования оплаты'
  }
};

// Компонент копирования
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <button
      onClick={handleCopy}
      className="p-1 hover:bg-white/10 rounded transition-colors"
      title="Копировать"
    >
      {copied ? (
        <Check className="w-3 h-3 text-emerald-400" />
      ) : (
        <Copy className="w-3 h-3 text-white/40" />
      )}
    </button>
  );
}

export default function LLMOutputPanel({ plannerOutput, yamlSpec, systemPrompt, rawResponse }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState('plan'); // 'plan' | 'prompt' | 'reasoning' | 'yaml' | 'raw'
  const [showFullPrompt, setShowFullPrompt] = useState(false);

  if (!plannerOutput && !yamlSpec) return null;

  // Создаём системный промпт для отображения (сокращённая версия)
  const displayPrompt = systemPrompt || `Ты - интеллектуальный планировщик агентской системы для автоматизации документооборота в нефтегазовой отрасли.

## Доступные агенты:
1. DATA_AGENT - Сбор данных из систем (ЭРА, СМБ)
2. EXECUTOR_AGENT - Формирование документов (КС-2, счета-фактуры)
3. APPROVAL_AGENT - Согласование и подписание
4. ERP_AGENT - Интеграция с ERP

## Задача:
Проанализируй запрос и сформируй план выполнения с указанием:
- Последовательности агентов
- Действий для каждого агента
- Используемых интеграций`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gpn-dark/90 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden"
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-400" />
          <span className="text-white font-medium text-sm">
            LLM Планировщик (qwen3:8b)
          </span>
          <Sparkles className="w-4 h-4 text-purple-400/60" />
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-white/40" />
        ) : (
          <ChevronDown className="w-4 h-4 text-white/40" />
        )}
      </button>

      {/* Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            {/* Tabs */}
            <div className="flex border-t border-b border-white/10 overflow-x-auto">
              <button
                onClick={() => setActiveTab('plan')}
                className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'plan' 
                    ? 'text-gpn-accent border-b-2 border-gpn-accent bg-gpn-accent/5' 
                    : 'text-white/50 hover:text-white/80'
                }`}
              >
                📋 План
              </button>
              <button
                onClick={() => setActiveTab('prompt')}
                className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'prompt' 
                    ? 'text-gpn-accent border-b-2 border-gpn-accent bg-gpn-accent/5' 
                    : 'text-white/50 hover:text-white/80'
                }`}
              >
                <MessageSquare className="w-4 h-4 inline mr-1" />
                Промпт
              </button>
              <button
                onClick={() => setActiveTab('reasoning')}
                className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'reasoning' 
                    ? 'text-gpn-accent border-b-2 border-gpn-accent bg-gpn-accent/5' 
                    : 'text-white/50 hover:text-white/80'
                }`}
              >
                <Lightbulb className="w-4 h-4 inline mr-1" />
                Reasoning
              </button>
              <button
                onClick={() => setActiveTab('yaml')}
                className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'yaml' 
                    ? 'text-gpn-accent border-b-2 border-gpn-accent bg-gpn-accent/5' 
                    : 'text-white/50 hover:text-white/80'
                }`}
              >
                <Code className="w-4 h-4 inline mr-1" />
                YAML
              </button>
              {rawResponse && (
                <button
                  onClick={() => setActiveTab('raw')}
                  className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                    activeTab === 'raw' 
                      ? 'text-gpn-accent border-b-2 border-gpn-accent bg-gpn-accent/5' 
                      : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  {'{ }'} Raw JSON
                </button>
              )}
            </div>

            {/* Tab Content */}
            <div className="p-4 max-h-[350px] overflow-y-auto">
              {/* Plan Tab */}
              {activeTab === 'plan' && plannerOutput && (
                <div className="space-y-3">
                  {/* Understanding */}
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
                    <div className="text-purple-400 text-xs font-medium mb-1">
                      💭 Понимание запроса
                    </div>
                    <div className="text-white/80 text-sm">
                      {plannerOutput.request_understood}
                    </div>
                  </div>

                  {/* Steps */}
                  <div>
                    <div className="text-white/60 text-xs font-medium mb-2">
                      📋 Сгенерированные агенты ({plannerOutput.steps?.length || 0})
                    </div>
                    <div className="space-y-3">
                      {plannerOutput.steps?.map((step, i) => (
                        <div 
                          key={i}
                          className="text-sm bg-white/5 rounded-lg p-3 border border-white/10"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-gpn-accent font-mono text-xs bg-gpn-accent/20 px-2 py-0.5 rounded">
                              #{step.step_number || i + 1}
                            </span>
                            <span className="text-purple-400 font-mono text-xs">
                              {step.agent}
                            </span>
                          </div>
                          <div className="text-white/90 text-sm mb-2">{step.description}</div>
                          
                          {/* Action & Inputs */}
                          <div className="flex flex-wrap gap-2 mb-2">
                            <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
                              action: {step.action}
                            </span>
                            {step.inputs && Object.keys(step.inputs).length > 0 && (
                              Object.entries(step.inputs).map(([k, v]) => (
                                <span key={k} className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">
                                  {k}: {String(v)}
                                </span>
                              ))
                            )}
                          </div>
                          
                          {/* Integrations with API */}
                          {step.integrations?.length > 0 && (
                            <div className="mt-2 border-t border-white/5 pt-2">
                              <div className="flex items-center gap-1 text-[10px] text-white/50 mb-1">
                                <Server className="w-3 h-3" />
                                API интеграции:
                              </div>
                              <div className="space-y-1">
                                {step.integrations.map((sys, j) => (
                                  <div key={j} className="flex items-center gap-2">
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px]">
                                      {sys.toUpperCase()}
                                    </span>
                                    <span className="text-[10px] text-white/40 font-mono">
                                      {SYSTEM_ENDPOINTS[sys] || `GET /api/v1/${sys}`}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="flex items-center gap-4 text-xs text-white/40">
                    <span>⏱️ ~{plannerOutput.estimated_duration_sec || 30}с</span>
                    <span>📊 {plannerOutput.complexity || 'medium'}</span>
                    <span>🔧 {plannerOutput.required_systems?.length || 0} систем</span>
                  </div>
                </div>
              )}

              {/* Prompt Tab */}
              {activeTab === 'prompt' && (
                <div className="space-y-3">
                  {/* System Prompt */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-white/60 text-xs font-medium">
                        🤖 Системный промпт
                      </div>
                      <div className="flex items-center gap-2">
                        <CopyButton text={displayPrompt} />
                        <button
                          onClick={() => setShowFullPrompt(!showFullPrompt)}
                          className="p-1 hover:bg-white/10 rounded transition-colors"
                          title={showFullPrompt ? "Скрыть" : "Показать полностью"}
                        >
                          {showFullPrompt ? (
                            <EyeOff className="w-3 h-3 text-white/40" />
                          ) : (
                            <Eye className="w-3 h-3 text-white/40" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="bg-black/30 rounded-lg p-3 border border-white/10">
                      <pre className={`text-xs text-white/70 font-mono whitespace-pre-wrap ${
                        !showFullPrompt ? 'max-h-32 overflow-hidden' : ''
                      }`}>
                        {displayPrompt}
                      </pre>
                      {!showFullPrompt && (
                        <div className="text-center mt-2">
                          <button
                            onClick={() => setShowFullPrompt(true)}
                            className="text-[10px] text-gpn-accent hover:underline"
                          >
                            Показать полностью...
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* User Request */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-white/60 text-xs font-medium">
                        👤 Запрос пользователя
                      </div>
                    </div>
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                      <div className="text-white/80 text-sm">
                        {plannerOutput?.request_understood || "Создать пакет документов для закрытия..."}
                      </div>
                    </div>
                  </div>
                  
                </div>
              )}

              {/* Reasoning Tab */}
              {activeTab === 'reasoning' && plannerOutput && (
                <div className="space-y-3">
                  {plannerOutput.steps?.map((step, i) => {
                    const reasoning = AGENT_REASONING[step.agent]?.[step.action] || 
                      `Агент ${step.agent} выбран для выполнения действия "${step.action}"`;
                    
                    return (
                      <div 
                        key={i}
                        className="bg-white/5 rounded-lg p-3 border border-white/10"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-gpn-accent font-mono text-xs bg-gpn-accent/20 px-2 py-0.5 rounded">
                            #{i + 1}
                          </span>
                          <span className="text-purple-400 font-mono text-xs">
                            {step.agent}
                          </span>
                          <span className="text-white/30">→</span>
                          <span className="text-blue-400 text-xs">
                            {step.action}
                          </span>
                        </div>
                        
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-2">
                          <div className="flex items-start gap-2">
                            <Lightbulb className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                            <p className="text-[11px] text-white/80">
                              {reasoning}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Decision Summary */}
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
                    <div className="text-purple-400 text-xs font-medium mb-2">
                      📊 Итог анализа
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-white/40">Сложность:</span>
                        <span className="text-white/80 ml-1">
                          {plannerOutput.complexity === 'high' ? 'Высокая' :
                           plannerOutput.complexity === 'medium' ? 'Средняя' : 'Низкая'}
                        </span>
                      </div>
                      <div>
                        <span className="text-white/40">Агентов:</span>
                        <span className="text-white/80 ml-1">{plannerOutput.steps?.length || 0}</span>
                      </div>
                      <div>
                        <span className="text-white/40">Систем:</span>
                        <span className="text-white/80 ml-1">{plannerOutput.required_systems?.length || 0}</span>
                      </div>
                      <div>
                        <span className="text-white/40">Время:</span>
                        <span className="text-white/80 ml-1">~{plannerOutput.estimated_duration_sec || 30}с</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* YAML Tab */}
              {activeTab === 'yaml' && yamlSpec && (
                <div className="relative">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-white/60 text-xs font-medium">
                      AWN v2.0 спецификация
                    </div>
                    <CopyButton text={yamlSpec} />
                  </div>
                  <pre className="text-xs text-white/80 font-mono bg-black/30 rounded-lg p-3 overflow-x-auto border border-white/10">
                    <code>{yamlSpec}</code>
                  </pre>
                  <div className="absolute top-2 right-2 text-[10px] text-white/30 bg-white/10 px-2 py-0.5 rounded">
                    AWN v2.0
                  </div>
                </div>
              )}

              {/* Raw JSON Tab */}
              {activeTab === 'raw' && (rawResponse || plannerOutput) && (
                <div className="relative">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-white/60 text-xs font-medium">
                      Ответ LLM (JSON)
                    </div>
                    <CopyButton text={JSON.stringify(rawResponse || plannerOutput, null, 2)} />
                  </div>
                  <pre className="text-xs text-white/80 font-mono bg-black/30 rounded-lg p-3 overflow-x-auto border border-white/10">
                    <code>{JSON.stringify(rawResponse || plannerOutput, null, 2)}</code>
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

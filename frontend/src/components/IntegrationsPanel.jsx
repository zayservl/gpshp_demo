import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Server, 
  Database, 
  FileCheck, 
  Building2, 
  Loader2, 
  CheckCircle, 
  Clock,
  ChevronDown,
  ChevronUp,
  Activity
} from 'lucide-react';

// Конфигурация систем
const SYSTEMS_CONFIG = {
  era: {
    name: 'ЭРА.Бурение',
    icon: Database,
    color: 'blue',
    description: 'Система мониторинга буровых работ',
    endpoint: 'GET /api/v1/era/drilling-data',
    mockData: {
      request: '{ "contract_id": "CNT-2024-001", "period": "2025-01" }',
      response: '{ "items": [...], "total": 15, "source": "era" }'
    }
  },
  smb: {
    name: 'СМБ 2.0',
    icon: Activity,
    color: 'cyan',
    description: 'Система мониторинга бурения',
    endpoint: 'GET /api/v1/smb/actual-works',
    mockData: {
      request: '{ "contract_id": "CNT-2024-001", "date_range": "2025-01" }',
      response: '{ "works": [...], "count": 23, "status": "ok" }'
    }
  },
  contracts: {
    name: 'Договоры',
    icon: FileCheck,
    color: 'purple',
    description: 'Система управления договорами',
    endpoint: 'GET /api/v1/contracts/{id}',
    mockData: {
      request: '{ "id": "CNT-2024-001" }',
      response: '{ "number": "ГПН-БС/2024-1847", "rates": [...] }'
    }
  },
  sus: {
    name: 'СУС',
    icon: FileCheck,
    color: 'amber',
    description: 'Система учётных документов',
    endpoint: 'POST /api/v1/sus/documents/generate',
    mockData: {
      request: '{ "type": "act_ks2", "data": {...} }',
      response: '{ "doc_id": "ACT-2025-001", "status": "created" }'
    }
  },
  edo: {
    name: 'ЭДО',
    icon: CheckCircle,
    color: 'emerald',
    description: 'Электронный документооборот',
    endpoint: 'POST /api/v1/edo/routes',
    mockData: {
      request: '{ "document_id": "ACT-001", "route_type": "approval" }',
      response: '{ "route_id": "R-001", "steps": [...] }'
    }
  },
  erp: {
    name: 'ERP (SAP)',
    icon: Building2,
    color: 'red',
    description: 'SAP ERP - учёт и финансы',
    endpoint: 'POST /api/v1/erp/accounting',
    mockData: {
      request: '{ "document": {...}, "action": "post" }',
      response: '{ "erp_id": "SAP-2025-0001", "posted": true }'
    }
  }
};

const COLOR_CLASSES = {
  blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  cyan: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  amber: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  emerald: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  red: 'bg-red-500/20 text-red-400 border-red-500/30',
};

function SystemCard({ systemKey, requests, isActive }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const config = SYSTEMS_CONFIG[systemKey];
  
  if (!config) return null;
  
  const Icon = config.icon;
  const colorClass = COLOR_CLASSES[config.color];
  const systemRequests = requests?.filter(r => r.system === systemKey) || [];
  const lastRequest = systemRequests[systemRequests.length - 1];
  
  return (
    <motion.div
      layout
      className={`border rounded-lg overflow-hidden transition-all ${
        isActive 
          ? `${colorClass} border-opacity-100` 
          : 'bg-white/5 border-white/10'
      }`}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded ${isActive ? colorClass : 'bg-white/10'}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-white">{config.name}</div>
            <div className="text-[10px] text-white/40">{config.description}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isActive && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="flex items-center gap-1"
            >
              <Loader2 className="w-3 h-3 animate-spin text-gpn-accent" />
              <span className="text-[10px] text-gpn-accent">активен</span>
            </motion.div>
          )}
          {lastRequest?.status === 'completed' && (
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          )}
          {systemRequests.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">
              {systemRequests.length}
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-white/40" />
          ) : (
            <ChevronDown className="w-4 h-4 text-white/40" />
          )}
        </div>
      </button>
      
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-3 border-t border-white/10 space-y-2">
              {/* Endpoint */}
              <div>
                <div className="text-[10px] text-white/40 mb-1">API Endpoint</div>
                <code className="text-[11px] text-gpn-accent font-mono bg-black/30 px-2 py-1 rounded block">
                  {config.endpoint}
                </code>
              </div>
              
              {/* Request History */}
              {systemRequests.length > 0 ? (
                <div>
                  <div className="text-[10px] text-white/40 mb-1">Последние запросы</div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {systemRequests.slice(-3).map((req, i) => (
                      <div 
                        key={i} 
                        className="text-[10px] bg-black/20 rounded p-2 border border-white/5"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`px-1 py-0.5 rounded ${
                            req.status === 'completed' 
                              ? 'bg-emerald-500/20 text-emerald-400' 
                              : req.status === 'pending'
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-red-500/20 text-red-400'
                          }`}>
                            {req.status === 'completed' ? '✓' : req.status === 'pending' ? '⏳' : '✗'} {req.status}
                          </span>
                          <span className="text-white/30 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {req.duration_ms}ms
                          </span>
                        </div>
                        {req.result && (
                          <div className="text-white/60 truncate">
                            {req.result}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-[10px] text-white/40 mb-1">Пример запроса/ответа</div>
                  <div className="space-y-1">
                    <div className="text-[10px] bg-black/20 rounded p-2">
                      <span className="text-blue-400">→</span>
                      <code className="text-white/60 ml-1">{config.mockData.request}</code>
                    </div>
                    <div className="text-[10px] bg-black/20 rounded p-2">
                      <span className="text-emerald-400">←</span>
                      <code className="text-white/60 ml-1">{config.mockData.response}</code>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function IntegrationsPanel({ integrations = [], activeSystem = null }) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  // Группируем запросы по системам
  const requestsBySystem = integrations.reduce((acc, req) => {
    if (!acc[req.system]) acc[req.system] = [];
    acc[req.system].push(req);
    return acc;
  }, {});
  
  // Определяем используемые системы
  const usedSystems = Object.keys(SYSTEMS_CONFIG);
  
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-4 border-b border-white/10 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-gpn-accent" />
          <h2 className="text-lg font-semibold text-white">Интеграции</h2>
          {activeSystem && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="text-[10px] px-2 py-0.5 rounded-full bg-gpn-accent/20 text-gpn-accent flex items-center gap-1"
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              {SYSTEMS_CONFIG[activeSystem]?.name || activeSystem}
            </motion.span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40">
            {integrations.length} запросов
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-white/40" />
          ) : (
            <ChevronDown className="w-4 h-4 text-white/40" />
          )}
        </div>
      </button>
      
      {/* Systems List */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 overflow-y-auto p-4 space-y-2"
          >
            {/* Active indicator */}
            {activeSystem && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gpn-accent/10 border border-gpn-accent/30 rounded-lg p-3 mb-3"
              >
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-gpn-accent" />
                  <span className="text-sm text-gpn-accent">
                    Запрос к {SYSTEMS_CONFIG[activeSystem]?.name || activeSystem}...
                  </span>
                </div>
              </motion.div>
            )}
            
            {/* System Cards */}
            {usedSystems.map((systemKey) => (
              <SystemCard
                key={systemKey}
                systemKey={systemKey}
                requests={requestsBySystem[systemKey]}
                isActive={activeSystem === systemKey}
              />
            ))}
            
            {/* Legend */}
            <div className="mt-4 pt-4 border-t border-white/10">
              <div className="text-[10px] text-white/30 mb-2">Статус подключения</div>
              <div className="flex flex-wrap gap-2">
                <span className="text-[10px] px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  ● Mock-режим
                </span>
                <span className="text-[10px] px-2 py-1 rounded bg-white/10 text-white/40">
                  Готов к интеграции
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

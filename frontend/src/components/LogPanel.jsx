import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, CheckCircle, AlertCircle, Info, XCircle } from 'lucide-react';

const LOG_ICONS = {
  info: Info,
  success: CheckCircle,
  warning: AlertCircle,
  error: XCircle,
};

const LOG_COLORS = {
  info: 'text-blue-400',
  success: 'text-emerald-400',
  warning: 'text-amber-400',
  error: 'text-red-400',
};

export default function LogPanel({ logs }) {
  const containerRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="flex-1 flex flex-col min-h-0 max-h-[400px]">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center gap-2">
        <Terminal className="w-5 h-5 text-gpn-accent" />
        <h2 className="text-lg font-semibold text-white">Трассировка</h2>
        <span className="ml-auto text-xs text-white/50 bg-white/10 px-2 py-1 rounded-full">
          {logs.length} записей
        </span>
      </div>

      {/* Logs Container */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-sm"
      >
        <AnimatePresence initial={false}>
          {logs.length === 0 ? (
            <div className="text-white/30 text-center py-8">
              Запустите workflow для отображения логов
            </div>
          ) : (
            logs.map((log, index) => {
              const Icon = LOG_ICONS[log.level] || Info;
              const colorClass = LOG_COLORS[log.level] || 'text-white/70';
              
              return (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-start gap-2 text-white/80"
                >
                  {/* Icon */}
                  <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${colorClass}`} />
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Agent & Time */}
                    <div className="flex items-center gap-2 text-xs text-white/40 mb-0.5">
                      <span className="font-semibold text-gpn-accent">
                        [{log.agent}]
                      </span>
                      <span>
                        {new Date(log.timestamp).toLocaleTimeString('ru-RU')}
                      </span>
                    </div>
                    
                    {/* Message */}
                    <div className="text-white/80 break-words">
                      {log.message}
                    </div>
                    
                    {/* Data */}
                    {log.data && (
                      <div className="mt-1 text-xs text-white/40 bg-white/5 rounded p-2">
                        {Object.entries(log.data).map(([key, value]) => (
                          <div key={key}>
                            <span className="text-white/50">{key}:</span>{' '}
                            <span className="text-gpn-accent">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

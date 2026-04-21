import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, CheckCircle, Sparkles } from 'lucide-react';

const STATUS_STYLES = {
  'готово': 'bg-emerald-500/10 text-emerald-300 border-emerald-400/30',
  'в работе': 'bg-cyan-500/10 text-cyan-300 border-cyan-400/30',
  'анализ': 'bg-cyan-500/10 text-cyan-300 border-cyan-400/30',
  'рассмотрение': 'bg-amber-500/10 text-amber-300 border-amber-400/30',
  'активно': 'bg-emerald-500/10 text-emerald-300 border-emerald-400/30',
};

const TYPE_ICONS = {
  'заявка': '📋',
  'договор': '📑',
  'письмо': '✉️',
  'ТЗ': '📐',
  'КП': '💼',
  'обращение': '✉️',
  'сводка': '📅',
  'отчёт': '📊',
  'анализ': '📊',
  'заключение': '⚖️',
};

export default function DocumentsPanel({ employeeId, newlyCreated = [], onOpen }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    const load = () => {
      fetch(`/api/documents?employee_id=${employeeId}`)
        .then(r => r.json())
        .then(data => {
          if (ignore) return;
          setDocuments(data.documents || []);
          setLoading(false);
        })
        .catch(() => !ignore && setLoading(false));
    };
    load();
    return () => { ignore = true; };
  }, [employeeId, newlyCreated.length]);

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-white/10">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <FileText className="w-4 h-4 text-cyan-400" />
          Документы сотрудника
        </h2>
        <p className="text-xs text-white/50 mt-0.5">
          Все документы, над которыми работает сотрудник. Новые — подсвечены.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading && <div className="text-white/30 text-center py-6 text-sm">Загрузка…</div>}
        {!loading && documents.length === 0 && (
          <div className="text-white/30 text-center py-6 text-sm">Документов пока нет.</div>
        )}
        <AnimatePresence>
          {documents.map((doc, index) => {
            const icon = TYPE_ICONS[doc.type] || '📄';
            const statusCls = STATUS_STYLES[doc.status] || 'bg-white/5 text-white/60 border-white/10';
            const isNew = !!doc.generated;
            return (
              <motion.button
                key={doc.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.03, 0.3) }}
                onClick={() => onOpen?.(doc.id)}
                className={`w-full text-left rounded-xl p-3 border transition-colors ${
                  isNew
                    ? 'bg-emerald-500/10 border-emerald-400/30 shadow-[0_0_0_1px_rgba(16,185,129,0.2)] hover:bg-emerald-500/15'
                    : 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08] hover:border-cyan-400/30'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="text-xl leading-none mt-0.5">{icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-white font-medium leading-tight">
                      {doc.title}
                      {isNew && (
                        <span className="inline-flex items-center gap-0.5 ml-1 text-[10px] text-emerald-300 bg-emerald-500/15 px-1 rounded">
                          <Sparkles className="w-2.5 h-2.5" /> new
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded border ${statusCls}`}>
                        {doc.status}
                      </span>
                      <span className="text-[10px] text-white/40">{doc.type}</span>
                    </div>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

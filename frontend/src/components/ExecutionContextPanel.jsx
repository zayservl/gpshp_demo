import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Database, 
  ChevronDown, 
  ChevronUp, 
  ArrowRight,
  FileJson,
  Maximize2,
  X
} from 'lucide-react';

// Форматирование размера данных
function formatDataSize(data) {
  const str = JSON.stringify(data);
  const bytes = new Blob([str]).size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Превью JSON
function JsonPreview({ data, maxLength = 150 }) {
  if (!data) return <span className="text-white/30">null</span>;
  
  const str = JSON.stringify(data, null, 2);
  const truncated = str.length > maxLength ? str.slice(0, maxLength) + '...' : str;
  
  return (
    <pre className="text-[10px] font-mono text-white/70 whitespace-pre-wrap">
      {truncated}
    </pre>
  );
}

// Модальное окно с полным JSON
function JsonModal({ title, data, onClose }) {
  if (!data) return null;
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-gpn-dark border border-white/20 rounded-xl max-w-2xl max-h-[80vh] w-full mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <FileJson className="w-5 h-5 text-gpn-accent" />
            <span className="text-white font-medium">{title}</span>
            <span className="text-xs text-white/40 ml-2">
              {formatDataSize(data)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded transition-colors"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>
        <div className="p-4 max-h-[60vh] overflow-auto">
          <pre className="text-xs font-mono text-white/80 whitespace-pre-wrap">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Карточка контекста
function ContextCard({ title, icon: Icon, data, color, onExpand }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasData = data && (Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0);
  
  return (
    <div className={`border rounded-lg overflow-hidden transition-all ${
      hasData 
        ? `bg-${color}-500/10 border-${color}-500/30` 
        : 'bg-white/5 border-white/10 opacity-50'
    }`}>
      <button
        onClick={() => hasData && setIsExpanded(!isExpanded)}
        disabled={!hasData}
        className="w-full p-2 flex items-center justify-between hover:bg-white/5 transition-colors disabled:cursor-not-allowed"
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${hasData ? `text-${color}-400` : 'text-white/30'}`} />
          <span className={`text-sm font-medium ${hasData ? 'text-white' : 'text-white/40'}`}>
            {title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasData && (
            <>
              <span className="text-[10px] text-white/40">
                {formatDataSize(data)}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onExpand && onExpand({ title, data });
                }}
                className="p-1 hover:bg-white/10 rounded transition-colors"
              >
                <Maximize2 className="w-3 h-3 text-white/40" />
              </button>
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-white/40" />
              ) : (
                <ChevronDown className="w-4 h-4 text-white/40" />
              )}
            </>
          )}
        </div>
      </button>
      
      <AnimatePresence>
        {isExpanded && hasData && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-2 border-t border-white/10 bg-black/20">
              <JsonPreview data={data} maxLength={300} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ExecutionContextPanel({ context = {}, workflow }) {
  const [modalData, setModalData] = useState(null);
  
  // Извлекаем данные из контекста
  const contractData = context.contract_data;
  const worksData = context.works_data;
  const actData = context.act_data;
  const invoiceData = context.invoice_data;
  const documents = context.documents || [];
  
  // Определяем текущий этап по workflow
  const currentNodeIndex = workflow?.nodes?.findIndex(n => n.status === 'running') ?? -1;
  const completedNodes = workflow?.nodes?.filter(n => n.status === 'completed') || [];
  
  return (
    <>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-gpn-accent" />
            <h2 className="text-lg font-semibold text-white">Контекст выполнения</h2>
          </div>
          <p className="text-xs text-white/40 mt-1">
            Данные, передаваемые между агентами
          </p>
        </div>
        
        {/* Progress */}
        {workflow?.nodes && (
          <div className="px-4 py-3 border-b border-white/10 bg-white/5">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-white/40">Прогресс:</span>
              <div className="flex-1 flex items-center gap-1">
                {workflow.nodes.map((node, i) => (
                  <React.Fragment key={node.id}>
                    <div 
                      className={`w-2 h-2 rounded-full transition-all ${
                        node.status === 'completed' ? 'bg-emerald-400' :
                        node.status === 'running' ? 'bg-gpn-accent animate-pulse' :
                        'bg-white/20'
                      }`}
                      title={node.name}
                    />
                    {i < workflow.nodes.length - 1 && (
                      <ArrowRight className="w-3 h-3 text-white/20" />
                    )}
                  </React.Fragment>
                ))}
              </div>
              <span className="text-white/60">
                {completedNodes.length}/{workflow.nodes.length}
              </span>
            </div>
          </div>
        )}
        
        {/* Context Data */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <ContextCard
            title="Данные договора"
            icon={FileJson}
            data={contractData}
            color="blue"
            onExpand={setModalData}
          />
          
          <ContextCard
            title="Фактические работы"
            icon={FileJson}
            data={worksData}
            color="cyan"
            onExpand={setModalData}
          />
          
          <ContextCard
            title="Акт КС-2"
            icon={FileJson}
            data={actData}
            color="emerald"
            onExpand={setModalData}
          />
          
          <ContextCard
            title="Счёт-фактура"
            icon={FileJson}
            data={invoiceData}
            color="amber"
            onExpand={setModalData}
          />
          
          {documents.length > 0 && (
            <ContextCard
              title={`Документы (${documents.length})`}
              icon={FileJson}
              data={documents}
              color="purple"
              onExpand={setModalData}
            />
          )}
          
          {/* Data Flow Visualization */}
          {completedNodes.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <div className="text-xs text-white/40 mb-2">Поток данных</div>
              <div className="space-y-1">
                {completedNodes.map((node, i) => (
                  <div 
                    key={node.id}
                    className="flex items-center gap-2 text-[10px]"
                  >
                    <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="text-white/60">{node.name}</span>
                    <ArrowRight className="w-3 h-3 text-white/20" />
                    <span className="text-gpn-accent">
                      {node.output_data ? formatDataSize(node.output_data) : 'OK'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* JSON Modal */}
      <AnimatePresence>
        {modalData && (
          <JsonModal
            title={modalData.title}
            data={modalData.data}
            onClose={() => setModalData(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

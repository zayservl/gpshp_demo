import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';

/**
 * Модалка правки editable_params у узла плана.
 * Простые текстовые поля по ключам из `node.editable_params`.
 */
export default function NodeParamEditor({ node, onApply, onClose }) {
  const [values, setValues] = useState(() => ({ ...(node?.editable_params || {}) }));

  useEffect(() => {
    setValues({ ...(node?.editable_params || {}) });
  }, [node]);

  if (!node) return null;
  const keys = Object.keys(values);

  const submit = (e) => {
    e?.preventDefault?.();
    onApply?.(values);
  };

  const prettyLabel = (k) => PARAM_LABELS[k] || k;

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
        onClick={onClose}
      >
        <motion.form
          key="dialog"
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          className="w-[480px] max-w-full bg-gpn-dark border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          onSubmit={submit}
        >
          <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-400/25 flex items-center justify-center text-xl">
              {node.icon || '⚙️'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-white/40">Параметры шага</div>
              <div className="text-white font-semibold text-sm truncate">{node.name}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-white/40 hover:text-white/80 p-1.5 rounded-lg hover:bg-white/5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-3">
            {keys.length === 0 ? (
              <div className="text-sm text-white/50">У этого шага нет настраиваемых параметров.</div>
            ) : (
              keys.map((k) => (
                <div key={k}>
                  <label className="text-[11px] uppercase tracking-wider text-white/50 block mb-1">
                    {prettyLabel(k)}
                    <span className="ml-1 text-white/30 font-mono normal-case tracking-normal">({k})</span>
                  </label>
                  <input
                    type="text"
                    value={values[k] ?? ''}
                    onChange={(e) => setValues(prev => ({ ...prev, [k]: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-cyan-400/40"
                  />
                </div>
              ))
            )}
          </div>

          <div className="px-5 py-3 border-t border-white/10 bg-black/30 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 text-xs"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={keys.length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-semibold disabled:opacity-40"
            >
              <Check className="w-3.5 h-3.5" /> Применить
            </button>
          </div>
        </motion.form>
      </motion.div>
    </AnimatePresence>
  );
}

const PARAM_LABELS = {
  application_number: 'Номер заявки',
  contract_number: 'Номер договора',
  tender_id: 'Тендер',
  supplier: 'Поставщик / подрядчик',
  letter_number: 'Номер письма',
  appeal_number: 'Номер обращения',
  period: 'Период',
  filter_type: 'Тип фильтра',
  day_a: 'День A',
  day_b: 'День B',
};

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, Loader2, ExternalLink, Download } from 'lucide-react';

const KIND_LABELS = {
  application: 'Заявка',
  contract: 'Договор',
  letter: 'Письмо',
  appeal: 'Обращение',
  proposal: 'Коммерческое предложение',
  tender: 'Техническое задание',
  daily_ops: 'Ежедневная сводка',
  lna: 'Локальный нормативный акт',
};

export default function DocumentViewerModal({ docId, onClose }) {
  const [loading, setLoading] = useState(false);
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!docId) return;
    let ignore = false;
    setLoading(true);
    setError(null);
    setDoc(null);
    fetch(`/api/documents/${encodeURIComponent(docId)}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => { if (!ignore) { setDoc(data); setLoading(false); } })
      .catch(e => { if (!ignore) { setError(e.message); setLoading(false); } });
    return () => { ignore = true; };
  }, [docId]);

  if (!docId) return null;

  const content = doc?.content_full || {};
  const kindLabel = KIND_LABELS[content.kind] || doc?.type || 'Документ';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-3xl max-h-[85vh] bg-gpn-dark/95 border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        >
          <div className="flex items-start gap-3 p-5 border-b border-white/10">
            <div className="w-11 h-11 rounded-xl bg-cyan-400/15 border border-cyan-400/30 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-cyan-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-cyan-300/80 mb-0.5">
                {kindLabel}
                {doc?.status && <span className="ml-2 text-white/50">· {doc.status}</span>}
              </div>
              <h3 className="text-white font-semibold text-lg leading-tight truncate">
                {doc?.title || 'Документ'}
              </h3>
              {doc?.created_at && (
                <div className="text-xs text-white/40 mt-0.5">
                  Создан: {new Date(doc.created_at).toLocaleString('ru-RU')}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {loading && (
              <div className="flex items-center gap-2 text-white/50">
                <Loader2 className="w-4 h-4 animate-spin" /> Загрузка документа…
              </div>
            )}
            {error && (
              <div className="text-red-400 text-sm">Не удалось открыть документ: {error}</div>
            )}
            {doc && !loading && !error && (
              <DocumentBody doc={doc} />
            )}
          </div>

          <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between text-xs text-white/40">
            <span>id: {doc?.id}</span>
            <div className="flex items-center gap-2">
              <button
                disabled
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/40 flex items-center gap-1.5 cursor-not-allowed"
                title="Demo: скачивание отключено"
              >
                <Download className="w-3 h-3" /> Скачать PDF
              </button>
              <button
                disabled
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/40 flex items-center gap-1.5 cursor-not-allowed"
                title="Demo: открытие в системе отключено"
              >
                <ExternalLink className="w-3 h-3" /> Открыть в СЭД
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Body renderers per content kind
// ---------------------------------------------------------------------------

function DocumentBody({ doc }) {
  const content = doc.content_full || {};
  const kind = content.kind;
  const data = content.data || {};

  if (!kind) {
    return (
      <div className="text-white/50 text-sm">
        Для этого документа нет расширенного содержимого. Ниже — метаданные.
        <Metadata doc={doc} />
      </div>
    );
  }

  if (kind === 'application') return <ApplicationView a={data} />;
  if (kind === 'contract') return <ContractView c={data} />;
  if (kind === 'letter') return <LetterView l={data} />;
  if (kind === 'appeal') return <AppealView a={data} />;
  if (kind === 'proposal') return <ProposalView p={data} />;
  if (kind === 'tender') return <TenderView t={data} />;
  if (kind === 'daily_ops') return <DailyOpsView o={data} />;
  if (kind === 'lna') return <LnaView l={data} />;
  return <Metadata doc={doc} />;
}

const Row = ({ label, children }) => (
  <div className="grid grid-cols-[160px_1fr] gap-3 py-1.5 text-sm border-b border-white/5 last:border-0">
    <div className="text-white/50">{label}</div>
    <div className="text-white/90">{children}</div>
  </div>
);

const Section = ({ title, children }) => (
  <div className="mb-5">
    <div className="text-xs uppercase tracking-wider text-cyan-300/80 mb-2">{title}</div>
    {children}
  </div>
);

function Metadata({ doc }) {
  return (
    <div className="mt-4">
      <Row label="Тип">{doc.type}</Row>
      <Row label="Статус">{doc.status}</Row>
      <Row label="Сотрудник">{doc.employee_id}</Row>
      {doc.source_ref && <Row label="Источник">{doc.source_ref}</Row>}
    </div>
  );
}

function ApplicationView({ a }) {
  return (
    <div>
      <Section title="Основное">
        <Row label="Номер">№{a.number}</Row>
        <Row label="Тема">{a.title}</Row>
        <Row label="Инициатор">{a.initiator}</Row>
        <Row label="Подразделение">{a.department}</Row>
        <Row label="Сумма">{(a.amount || 0).toLocaleString('ru-RU')} ₽</Row>
        <Row label="Обоснование">{a.rationale}</Row>
        <Row label="Дата">{a.date}</Row>
      </Section>
      {a.items?.length > 0 && (
        <Section title="Позиции">
          <div className="rounded-lg border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-white/60 text-xs">
                <tr>
                  <th className="text-left px-3 py-2">Наименование</th>
                  <th className="text-right px-3 py-2">Кол-во</th>
                  <th className="text-right px-3 py-2">Цена</th>
                  <th className="text-right px-3 py-2">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {a.items.map((it, i) => (
                  <tr key={i} className="border-t border-white/5 text-white/80">
                    <td className="px-3 py-2">{it.name}</td>
                    <td className="px-3 py-2 text-right">{it.qty} {it.unit || ''}</td>
                    <td className="px-3 py-2 text-right">{(it.price || 0).toLocaleString('ru-RU')}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {(it.amount || it.price * it.qty || 0).toLocaleString('ru-RU')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
      {a.approvals?.length > 0 && (
        <Section title="Согласования">
          {a.approvals.map((ap, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0 text-sm">
              <span className="text-white/80">{ap.role}</span>
              <span className={ap.status === 'согласовано' ? 'text-emerald-300' : 'text-amber-300'}>
                {ap.status}
              </span>
            </div>
          ))}
        </Section>
      )}
      {a.attachments?.length > 0 && (
        <Section title="Вложения">
          <ul className="space-y-1">
            {a.attachments.map((at, i) => (
              <li key={i} className="text-sm text-white/70">📎 {at.name || at}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function ContractView({ c }) {
  return (
    <div>
      <Section title="Реквизиты">
        <Row label="Номер">{c.number}</Row>
        <Row label="Тема">{c.title}</Row>
        <Row label="Дата">{c.date}</Row>
        <Row label="Подрядчик">{c.contractor?.name} (ИНН {c.contractor?.inn})</Row>
        <Row label="Сумма">{(c.amount || 0).toLocaleString('ru-RU')} ₽</Row>
        <Row label="Срок">{c.term}</Row>
      </Section>
      {c.clauses?.length > 0 && (
        <Section title="Ключевые пункты">
          {c.clauses.map((cl, i) => (
            <div key={i} className="py-2 border-b border-white/5 last:border-0">
              <div className="text-xs text-cyan-300 font-medium">{cl.number} — {cl.title}</div>
              <div className="text-sm text-white/80 mt-0.5 leading-snug">{cl.text}</div>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function LetterView({ l }) {
  const body = l.body || l.body_with_errors || '';
  return (
    <div>
      <Section title="Реквизиты">
        <Row label="Номер">{l.number}</Row>
        <Row label="Дата">{l.date}</Row>
        <Row label="Тема">{l.subject}</Row>
        {l.from && <Row label="Отправитель">{l.from}</Row>}
        {l.to && <Row label="Адресат">{l.to}</Row>}
      </Section>
      <Section title="Текст">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-white/85 whitespace-pre-line leading-relaxed">
          {body || 'Текст отсутствует'}
        </div>
      </Section>
      {l.expected_issues?.length > 0 && (
        <Section title="Найденные замечания">
          {l.expected_issues.map((is, i) => (
            <div key={i} className="py-2 border-b border-white/5 last:border-0 text-sm">
              <span className="text-amber-300 text-xs uppercase mr-2">{is.type}</span>
              <span className="text-white/90">«{is.text}»</span>
              <span className="text-white/50"> → </span>
              <span className="text-emerald-300">«{is.correction}»</span>
              <div className="text-xs text-white/50 mt-0.5">{is.explanation}</div>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function AppealView({ a }) {
  const from = a.from || {};
  const fromLine = [from.name, from.email, from.position].filter(Boolean).join(' · ');
  return (
    <div>
      <Section title="Реквизиты">
        <Row label="Номер">№{a.number}</Row>
        <Row label="Дата">{a.received_at || a.date}</Row>
        <Row label="От">{fromLine || '—'}</Row>
        <Row label="Категория">{a.category}</Row>
        {a.subject && <Row label="Тема">{a.subject}</Row>}
      </Section>
      <Section title="Суть обращения">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-white/85 whitespace-pre-line leading-relaxed">
          {a.body || a.text || '—'}
        </div>
      </Section>
      {a.questions?.length > 0 && (
        <Section title="Вопросы">
          <ol className="list-decimal pl-5 space-y-1 text-sm text-white/80">
            {a.questions.map((q, i) => <li key={i}>{q}</li>)}
          </ol>
        </Section>
      )}
    </div>
  );
}

function ProposalView({ p }) {
  return (
    <div>
      <Section title="Реквизиты КП">
        <Row label="Номер">{p.number}</Row>
        <Row label="Поставщик">{p.supplier?.name} (ИНН {p.supplier?.inn})</Row>
        <Row label="Цена">{(p.price_rub || 0).toLocaleString('ru-RU')} ₽</Row>
        <Row label="Модель/товар">{p.model}</Row>
        <Row label="Срок поставки">{p.delivery_days} дней</Row>
        <Row label="Гарантия">{p.warranty_years} г</Row>
        <Row label="Оплата">{p.payment}</Row>
        <Row label="Соответствие ТЗ">{p.overall_compliance}</Row>
      </Section>
      {p.specs && (
        <Section title="Характеристики">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(p.specs).map(([k, v]) => (
              <div key={k} className="rounded-md bg-white/[0.04] border border-white/10 px-2.5 py-1.5 text-xs">
                <div className="text-white/50">{k}</div>
                <div className="text-white/90">{String(v)}</div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function TenderView({ t }) {
  return (
    <div>
      <Section title="Реквизиты ТЗ">
        <Row label="Номер">{t.number}</Row>
        <Row label="Предмет">{t.subject}</Row>
        <Row label="Способ закупки">{t.procurement_method}</Row>
        <Row label="Срок">{t.deadline}</Row>
      </Section>
      {t.requirements && (
        <Section title="Требования">
          <pre className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-white/80 overflow-auto whitespace-pre-wrap">
{JSON.stringify(t.requirements, null, 2)}
          </pre>
        </Section>
      )}
    </div>
  );
}

function DailyOpsView({ o }) {
  const k = o.kpi || {};
  const f = o.fuel || {};
  return (
    <div>
      <Section title="KPI дня">
        <Row label="Uptime платформы">{k.platform_uptime_percent}%</Row>
        <Row label="Выполнение плана">{k.works_completion_vs_plan_percent}%</Row>
        <Row label="HSE-инциденты">{k.hse_incidents ?? 0}</Row>
      </Section>
      <Section title="Топливо">
        <Row label="Остаток">{f.closing_stock_t} т</Row>
        <Row label="Расход">{f.consumption_t} т</Row>
      </Section>
      {o.vessels?.length > 0 && (
        <Section title="Суда">
          {o.vessels.map((v, i) => (
            <div key={i} className="py-1 text-sm text-white/80 border-b border-white/5 last:border-0">
              <span className="text-white">{v.name}</span>
              <span className="text-white/50"> — {v.status}</span>
            </div>
          ))}
        </Section>
      )}
      {o.incidents?.length > 0 && (
        <Section title="Инциденты">
          {o.incidents.map((inc, i) => (
            <div key={i} className="text-sm text-white/80 py-1">
              <span className="text-amber-300">{inc.time}</span> · {inc.vessel}: {inc.description}
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function LnaView({ l }) {
  return (
    <div>
      <Section title="Реквизиты">
        <Row label="Код">{l.code}</Row>
        <Row label="Название">{l.title}</Row>
        <Row label="Дата">{l.date}</Row>
      </Section>
      {l.excerpts?.length > 0 && (
        <Section title="Извлечения">
          {l.excerpts.map((ex, i) => (
            <div key={i} className="py-2 border-b border-white/5 last:border-0">
              <div className="text-xs text-cyan-300 font-medium">{ex.section}</div>
              <div className="text-sm text-white/85 mt-0.5 leading-relaxed">{ex.text}</div>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

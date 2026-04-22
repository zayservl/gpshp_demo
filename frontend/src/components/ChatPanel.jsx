import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Sparkles, CheckCircle2, XCircle, Loader2, Check, Play, RotateCcw, ArrowRight, Pause
} from 'lucide-react';

/**
 * Чат-панель с AI-сотрудником: 5 этапов диалога
 * 1. Делегирование 2. Уточнение 3. План 4. Исполнение 5. Результат + проактив
 */
export default function ChatPanel({ employee, session, onSendMessage, onApprove, onReject, onResume, onReset, isExecuting, onOpenDocument, planInCenter = false }) {
  const [text, setText] = useState('');
  const scrollRef = useRef(null);

  const quickActions = useMemo(() => {
    if (!employee || !session) return [];
    return employee.scenarios.map(s => ({ id: s.id, title: s.title, request: s.request }));
  }, [employee, session]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session?.messages?.length]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSendMessage({ text: t });
    setText('');
  };

  const sendScenario = (scenario) => {
    onSendMessage({ text: scenario.request, scenario_id: scenario.id });
  };

  return (
    <div className="flex flex-col h-full bg-gpn-dark/60">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-xl"
            style={{ background: `${employee.color}18`, border: `1px solid ${employee.color}55` }}
          >
            {employee.avatar}
          </div>
          <div>
            <div className="text-white font-semibold text-sm leading-tight">{employee.name}</div>
            <div className="text-[11px] text-white/50">{employee.role}</div>
          </div>
        </div>
        <button
          onClick={onReset}
          className="text-white/40 hover:text-white/80 p-1.5 rounded-lg hover:bg-white/5"
          title="Новая сессия"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
      >
        <AnimatePresence initial={false}>
          {(session?.messages || []).map(m => (
            <MessageBubble
              key={m.id}
              message={m}
              employee={employee}
              onApprove={onApprove}
              onReject={onReject}
              onResume={onResume}
              isExecuting={isExecuting}
              planInCenter={planInCenter}
              onProactive={(item) => onSendMessage({
                text: item.request,
                scenario_id: item.scenario_id || null,
                target_employee_id: item.target_employee_id || null,
              })}
              onClarifySuggest={(s) => onSendMessage({ text: s })}
              onOpenDocument={onOpenDocument}
            />
          ))}
        </AnimatePresence>

        {isExecuting && (
          <div className="text-[11px] text-cyan-300/80 flex items-center gap-1.5 pl-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> сотрудник работает над задачей…
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="px-3 pt-2 pb-1 border-t border-white/10">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40 mb-1.5">
          <Sparkles className="w-3 h-3" />
          Быстрые сценарии
        </div>
        <div className="flex flex-wrap gap-1.5">
          {quickActions.map(qa => (
            <button
              key={qa.id}
              onClick={() => sendScenario(qa)}
              disabled={isExecuting}
              className="text-[11px] px-2 py-1 rounded-md bg-white/[0.05] hover:bg-white/10 border border-white/10 text-white/80 disabled:opacity-40"
              title={qa.request}
            >
              {qa.title}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-white/10 flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Напишите задачу сотруднику…"
          disabled={isExecuting}
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-cyan-400/40 disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={isExecuting || !text.trim()}
          className="p-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black disabled:bg-white/10 disabled:text-white/30 transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bubble
// ---------------------------------------------------------------------------

function MessageBubble({ message, employee, onApprove, onReject, onResume, isExecuting, planInCenter, onProactive, onClarifySuggest, onOpenDocument }) {
  const isUser = message.author === 'user';
  const common = "rounded-2xl px-3.5 py-2.5 text-sm max-w-[95%]";

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-end"
      >
        <div className={`${common} bg-cyan-500/20 border border-cyan-400/30 text-white`}>
          {message.text}
        </div>
      </motion.div>
    );
  }

  const isThinking = message.type === 'thinking';

  // system / assistant
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-2 items-start"
    >
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center text-base shrink-0"
        style={{ background: `${employee.color}18`, border: `1px solid ${employee.color}55` }}
      >
        {employee.avatar}
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className={`${common} ${
          isThinking
            ? 'bg-cyan-500/[0.08] border border-cyan-400/20 text-cyan-200/90'
            : 'bg-white/[0.05] border border-white/10 text-white/90'
        } whitespace-pre-wrap`}>
          {isThinking ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {message.text}
            </span>
          ) : message.text}
        </div>

        {message.type === 'answer' && message.payload?.freeform && message.payload?.quick_actions?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.payload.quick_actions.slice(0, 3).map(qa => (
              <button
                key={qa.id}
                onClick={() => onProactive({ request: qa.request, scenario_id: qa.id })}
                className="text-[11px] px-2 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-white/80 hover:text-white transition-colors"
              >
                → {qa.title}
              </button>
            ))}
          </div>
        )}

        {message.type === 'clarifying_question' && (
          <ClarifyBlock payload={message.payload} onPick={onClarifySuggest} />
        )}
        {message.type === 'plan_proposal' && (
          <PlanBlock
            payload={message.payload}
            color={employee.color}
            onApprove={onApprove}
            onReject={onReject}
            disabled={isExecuting}
            compact={planInCenter}
          />
        )}
        {message.type === 'plan_paused' && (
          <PausedBlock
            payload={message.payload}
            onResume={onResume}
          />
        )}
        {message.type === 'result' && (
          <ResultBlock
            payload={message.payload}
            color={employee.color}
            onProactive={onProactive}
            onOpenDocument={onOpenDocument}
          />
        )}
      </div>
    </motion.div>
  );
}

function ClarifyBlock({ payload, onPick }) {
  if (!payload?.suggestions?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {payload.suggestions.map(s => (
        <button
          key={s}
          onClick={() => onPick(s)}
          className="text-[11px] px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-400/30 text-cyan-200 hover:bg-cyan-500/20"
        >
          {s}
        </button>
      ))}
    </div>
  );
}

function PlanBlock({ payload, color, onApprove, onReject, disabled, compact }) {
  if (!payload) return null;

  // Компактный вид: когда полноценный план открыт в центральной панели —
  // чат-бабл даёт только краткий статус и дубликат кнопок approve/reject.
  if (compact) {
    const nodes = payload.graph_nodes || [];
    const activeSteps = nodes.filter(n => n.kind === 'tool' && !n.removed).length
                        || payload.steps?.length || 0;
    const activeHandoff = nodes.some(n => n.kind === 'handoff' && !n.removed);
    const pausesCount = nodes.filter(n => !n.removed && n.pause_after).length;

    return (
      <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.04] overflow-hidden">
        <div className="px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-white min-w-0">
            <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color }} />
            <span className="truncate">План: {payload.title}</span>
          </div>
          <div className="text-[10px] text-amber-200/80 whitespace-nowrap flex items-center gap-1">
            Открыт в центре <ArrowRight className="w-3 h-3" />
          </div>
        </div>
        <div className="px-3 pb-2 text-[11px] text-white/60 flex flex-wrap gap-1.5">
          <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{activeSteps} шагов</span>
          {pausesCount > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-400/30 text-amber-300">
              {pausesCount} пауз
            </span>
          )}
          {activeHandoff && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-400/30 text-amber-300">
              handoff
            </span>
          )}
        </div>
        <div className="px-3 py-2 border-t border-white/10 bg-black/20 flex items-center gap-2">
          <button
            onClick={onApprove}
            disabled={disabled}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold disabled:opacity-40"
          >
            <Play className="w-3.5 h-3.5" /> Согласовать
          </button>
          <button
            onClick={onReject}
            disabled={disabled}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 text-xs disabled:opacity-40"
          >
            <XCircle className="w-3.5 h-3.5" /> Отклонить
          </button>
        </div>
      </div>
    );
  }

  // Fallback полного плана в чате (если по каким-то причинам графа нет).
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <div className="px-3 py-2 border-b border-white/10 bg-white/[0.03] flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
          <Sparkles className="w-3.5 h-3.5" style={{ color }} />
          План: {payload.title}
        </div>
        <div className="text-[11px] text-white/40">{payload.steps?.length || 0} шагов</div>
      </div>
      <ol className="px-3 py-2 space-y-1">
        {(payload.steps || []).map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-[12px] text-white/80">
            <span className="mt-0.5 text-xs w-5 h-5 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-white/60 shrink-0">
              {i + 1}
            </span>
            <span className="leading-snug">
              <span className="text-base mr-1">{s.icon}</span>
              <span className="font-medium text-white">{s.name}</span>
              <span className="text-white/40"> · {s.source}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="px-3 py-2 border-t border-white/10 bg-black/20 flex items-center gap-2">
        <button
          onClick={onApprove}
          disabled={disabled}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold disabled:opacity-40"
        >
          <Play className="w-3.5 h-3.5" /> Согласовать и выполнить
        </button>
        <button
          onClick={onReject}
          disabled={disabled}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 text-xs disabled:opacity-40"
        >
          <XCircle className="w-3.5 h-3.5" /> Отклонить
        </button>
      </div>
    </div>
  );
}

function PausedBlock({ payload, onResume }) {
  return (
    <div className="rounded-xl border border-amber-400/35 bg-amber-500/[0.08] overflow-hidden">
      <div className="px-3 py-2 flex items-center gap-2">
        <Pause className="w-4 h-4 text-amber-300 shrink-0" />
        <div className="text-[12px] text-amber-100 flex-1">
          Остановка после шага <b>{payload?.step_index}</b>. Проверьте промежуточный результат — и продолжите, когда будете готовы.
        </div>
      </div>
      <div className="px-3 py-2 border-t border-amber-400/20 bg-black/20">
        <button
          onClick={onResume}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold"
        >
          <Play className="w-3.5 h-3.5" /> Продолжить
        </button>
      </div>
    </div>
  );
}

function ResultBlock({ payload, color, onProactive, onOpenDocument }) {
  if (!payload) return null;
  const artifact = payload.artifact || {};

  return (
    <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.05] overflow-hidden">
      <div className="px-3 py-2 border-b border-white/10 flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        <div className="text-xs font-semibold text-white truncate">{payload.title || 'Результат'}</div>
      </div>

      {artifact?.kind && <ArtifactPreview artifact={artifact} />}

      {payload.sources?.length > 0 && (
        <div className="px-3 py-2 border-t border-white/5">
          <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Источники</div>
          <div className="flex flex-wrap gap-1">
            {payload.sources.map((s, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/60">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {payload.documents_created?.length > 0 && (
        <div className="px-3 py-2 border-t border-white/5">
          <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Создано документов</div>
          <div className="space-y-1">
            {payload.documents_created.map((d, i) => (
              <button
                key={i}
                onClick={() => onOpenDocument?.(d.id)}
                disabled={!onOpenDocument || !d.id}
                className="w-full text-left text-[11px] text-white/80 hover:text-white flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-white/5 disabled:hover:bg-transparent transition-colors"
              >
                <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="truncate">{d.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {payload.proactive?.length > 0 && (
        <div className="px-3 py-2 border-t border-white/10 bg-black/20">
          <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3" style={{ color }} /> Следующие шаги
          </div>
          <div className="flex flex-col gap-1.5">
            {payload.proactive.map((p, i) => (
              <button
                key={i}
                onClick={() => onProactive(p)}
                className={`text-[11px] text-left px-2.5 py-1.5 rounded-lg border transition-colors ${
                  p.target_employee_id
                    ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-100 hover:text-white'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/80 hover:text-white'
                }`}
                title={p.target_employee_id ? `Передать задачу: ${p.target_employee_id}` : undefined}
              >
                {p.target_employee_id ? '↪' : '→'} {p.label}
                {p.target_employee_id && (
                  <span className="ml-1 text-[10px] uppercase tracking-wider opacity-70">
                    · handoff
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Artifact preview per kind
// ---------------------------------------------------------------------------

function ArtifactPreview({ artifact }) {
  const K = artifact.kind;
  if (K === 'application_check') return <ApplicationCheck a={artifact} />;
  if (K === 'semantic_search') return <SemanticSearch a={artifact} />;
  if (K === 'contract_risks') return <ContractRisks a={artifact} />;
  if (K === 'proofread') return <Proofread a={artifact} />;
  if (K === 'translation') return <Translation a={artifact} />;
  if (K === 'kp_comparison') return <KpComparison a={artifact} />;
  if (K === 'supplier_assessment') return <SupplierAssessment a={artifact} />;
  if (K === 'appeal_response') return <AppealResponse a={artifact} />;
  if (K === 'daily_summary') return <DailySummary a={artifact} />;
  return null;
}

const severityClass = (sev) => ({
  critical: 'bg-red-500/15 text-red-300 border-red-500/30',
  high: 'bg-red-500/15 text-red-300 border-red-500/30',
  major: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  minor: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  low: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
}[sev] || 'bg-white/10 text-white/70 border-white/20');

function ApplicationCheck({ a }) {
  return (
    <div className="px-3 py-2 space-y-2">
      {a.issues?.length > 0 ? (
        <>
          <div className="text-[11px] uppercase tracking-wider text-white/40">Замечания</div>
          {a.issues.map((issue, i) => (
            <div key={i} className="rounded-lg p-2 border border-white/10 bg-white/[0.03]">
              <div className="flex items-start gap-2 mb-1">
                <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded border ${severityClass(issue.severity)}`}>
                  {issue.severity}
                </span>
                <span className="text-[11px] text-white/60">{issue.field}</span>
              </div>
              <div className="text-[12px] text-white/90 mb-1">{issue.description}</div>
              <div className="text-[11px] text-emerald-300/80">→ {issue.recommendation}</div>
            </div>
          ))}
        </>
      ) : null}
      {a.passed?.length > 0 && (
        <details className="text-[11px] text-white/60">
          <summary className="cursor-pointer hover:text-white/80">Что в порядке ({a.passed.length})</summary>
          <ul className="mt-1 space-y-0.5 pl-3">
            {a.passed.map((p, i) => (
              <li key={i} className="text-[11px]">✓ {p}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function SemanticSearch({ a }) {
  return (
    <div className="px-3 py-2 space-y-2">
      {(a.hits || []).map((h, i) => (
        <div key={i} className="rounded-lg p-2 border border-white/10 bg-white/[0.03]">
          <div className="text-[11px] text-cyan-300 font-medium mb-0.5">
            {h.document} · {h.section}
          </div>
          <div className="text-[12px] text-white/80 leading-snug">«{h.text}»</div>
        </div>
      ))}
    </div>
  );
}

function ContractRisks({ a }) {
  return (
    <div className="px-3 py-2 space-y-2">
      {(a.risks || []).map((r, i) => (
        <div key={i} className="rounded-lg p-2 border border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded border ${severityClass(r.severity)}`}>
              {r.severity}
            </span>
            <span className="text-[12px] font-semibold text-white">{r.title}</span>
            {r.clause && <span className="text-[11px] text-white/40">· {r.clause}</span>}
          </div>
          <div className="text-[11px] text-white/70 mb-1">{r.rationale}</div>
          <div className="text-[11px] text-emerald-300/80">→ {r.recommendation}</div>
          {r.reference && <div className="text-[10px] text-white/40 mt-1">{r.reference}</div>}
        </div>
      ))}
    </div>
  );
}

function Proofread({ a }) {
  return (
    <div className="px-3 py-2 space-y-1.5">
      {(a.issues || []).map((it, i) => (
        <div key={i} className="text-[12px] flex items-baseline gap-2">
          <span className="text-red-300 line-through">{it.text}</span>
          <span className="text-white/30">→</span>
          <span className="text-emerald-300">{it.correction}</span>
          <span className="text-[10px] text-white/40 ml-1">{it.type}</span>
        </div>
      ))}
    </div>
  );
}

function Translation({ a }) {
  return (
    <div className="px-3 py-2 space-y-2">
      <div className="text-[11px] uppercase tracking-wider text-white/40">RU</div>
      <div className="text-[12px] text-white/80">{a.ru}</div>
      <div className="text-[11px] uppercase tracking-wider text-white/40">EN</div>
      <div className="text-[12px] text-white/80">{a.en}</div>
      {a.glossary?.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Глоссарий</div>
          <div className="flex flex-wrap gap-1">
            {a.glossary.map((g, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/70">
                {g.ru} → {g.en}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KpComparison({ a }) {
  return (
    <div className="px-3 py-2 space-y-2">
      {(a.proposals || []).map(p => {
        const isWinner = p.id === a.winner_id;
        return (
          <div
            key={p.id}
            className={`rounded-lg p-2 border ${
              isWinner ? 'border-emerald-400/50 bg-emerald-500/10' : 'border-white/10 bg-white/[0.03]'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="text-[12px] font-semibold text-white">
                {isWinner && '🏆 '}{p.number} · {p.supplier.name}
              </div>
              <div className="text-[11px] text-white/60">
                {(p.price_rub || 0).toLocaleString('ru-RU')} ₽
              </div>
            </div>
            <div className="text-[11px] text-white/70 leading-snug">
              {p.model} · {p.delivery_days} дн · гарантия {p.warranty_years} г · {p.payment}
            </div>
            <div className="text-[11px] mt-0.5">
              Соответствие ТЗ:{' '}
              <span className={p.overall_compliance === 'полное' ? 'text-emerald-300' : 'text-amber-300'}>
                {p.overall_compliance}
              </span>
              {' · '}Рейтинг {p.supplier.rating}
            </div>
          </div>
        );
      })}
      {a.rationale && (
        <div className="text-[11px] text-white/70 italic mt-1">{a.rationale}</div>
      )}
    </div>
  );
}

function SupplierAssessment({ a }) {
  const s = a.supplier || {};
  return (
    <div className="px-3 py-2 space-y-1 text-[12px] text-white/80">
      <div><b>{s.name}</b> · ИНН {s.inn}</div>
      <div>Рейтинг: <b>{s.rating}</b> · Надёжность: <b>{s.reliability}</b></div>
      <div>Контрактов: {s.contracts_count} · Нарушений: {s.breaches_count}</div>
      <div className="text-[11px] text-emerald-300/80 italic">{s.verdict}</div>
    </div>
  );
}

function AppealResponse({ a }) {
  const r = a.response || {};
  return (
    <div className="px-3 py-2 space-y-1.5 text-[12px] text-white/85 leading-relaxed">
      <div><b>{r.greeting}</b></div>
      <div>{r.opening}</div>
      {(r.sections || []).map((s, i) => (
        <div key={i}>
          <div className="text-cyan-300 text-[11px] font-semibold mt-1">{s.title}</div>
          <div>{s.content}</div>
        </div>
      ))}
      <div>{r.closing}</div>
      <div className="text-white/50 whitespace-pre-line">{r.signature}</div>
    </div>
  );
}

function DailySummary({ a }) {
  const o = a.ops || {};
  const k = o.kpi || {};
  const f = o.fuel || {};
  return (
    <div className="px-3 py-2 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Uptime" value={`${k.platform_uptime_percent}%`} color="emerald" />
        <Stat label="План работ" value={`${k.works_completion_vs_plan_percent}%`} color="cyan" />
        <Stat label="Топливо" value={`${f.closing_stock_t} т`} color="amber" />
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-white/40 mb-1">Суда</div>
        {(o.vessels || []).map((v, i) => (
          <div key={i} className="text-[11px] text-white/80">
            • {v.name} — <span className="text-white/60">{v.status}</span>
          </div>
        ))}
      </div>
      {o.incidents?.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-amber-300/80 mb-1">Инциденты</div>
          {o.incidents.map((inc, i) => (
            <div key={i} className="text-[11px] text-white/80">
              {inc.time} · {inc.vessel}: {inc.description}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  const colorMap = {
    emerald: 'text-emerald-300',
    cyan: 'text-cyan-300',
    amber: 'text-amber-300',
  };
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-center">
      <div className={`text-sm font-bold ${colorMap[color] || 'text-white'}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
    </div>
  );
}

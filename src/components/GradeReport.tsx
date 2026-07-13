import { useState } from 'react';
import { api, type AnswerData, type GradeReportData } from '../api';

interface Props {
  report: GradeReportData;
  sessionId: string;
  onClose: () => void;
}

export default function GradeReport({ report, sessionId, onClose }: Props) {
  const [answer, setAnswer] = useState<AnswerData | null>(null);
  const pct = report.max ? Math.round((report.score / report.max) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">
            Sonuç:{' '}
            <span className={pct === 100 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'}>
              {report.score}/{report.max} ({pct}%)
            </span>
          </h2>
          <button onClick={onClose} className="rounded px-2 py-1 text-zinc-400 hover:bg-zinc-800">
            ✕
          </button>
        </div>

        {!report.saved && (
          <div className="mb-4 rounded border border-amber-700 bg-amber-950/50 px-4 py-2 text-sm text-amber-300">
            ⚠ NVRAM'e kaydetmedin (<code>write</code>): {report.unsaved_devices.join(', ')}
          </div>
        )}
        {report.forbidden_violations.length > 0 && (
          <div className="mb-4 rounded border border-red-700 bg-red-950/50 px-4 py-2 text-sm text-red-300">
            ⛔ Yasak değişiklik:{' '}
            {report.forbidden_violations.map((v, i) => (
              <div key={i}>
                {v.device}: <code>{v.line}</code>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-4">
          {report.tasks.map((t, i) => (
            <div key={i} className="rounded border border-zinc-800 bg-zinc-950 p-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-semibold">
                  Task {t.task} — {t.device}
                </span>
                <span className={t.passed ? 'text-emerald-400' : 'text-red-400'}>
                  {t.passed ? '✅' : '❌'} {t.earned}/{t.points}
                </span>
              </div>
              {t.aliasUsed && (
                <p className="mb-1 text-xs text-sky-400">ℹ Ön-config'teki gerçek isim/ID ({t.aliasUsed}) üzerinden değerlendirildi.</p>
              )}
              <ul className="space-y-1 font-mono text-xs">
                {t.lines.map((l, j) => (
                  <li key={j}>
                    {l.ok ? (
                      <span className="text-emerald-400">✅ {[...l.path, l.line].join(' » ')}</span>
                    ) : (
                      <div className="text-red-400">
                        ❌ Eksik: {[...l.path, l.line].join(' » ')}
                        {l.found && <div className="pl-5 text-amber-400">Sende: {l.found}</div>}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-5">
          {!answer ? (
            <button
              onClick={() => api.answer(sessionId).then(setAnswer).catch(console.error)}
              className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium hover:bg-emerald-600"
            >
              Resmi Çözümü Göster
            </button>
          ) : (
            <div className="space-y-3">
              <h3 className="font-semibold text-emerald-300">Resmi Çözüm</h3>
              <pre className="overflow-x-auto rounded bg-black p-4 font-mono text-xs leading-relaxed text-emerald-200">
                {answer.answer_key_raw}
              </pre>
              {answer.explanation && (
                <div className="rounded border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300">
                  <span className="font-semibold text-zinc-100">Neden: </span>
                  {answer.explanation}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

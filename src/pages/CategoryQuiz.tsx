import { useEffect, useMemo, useState } from 'react';
import { api, type CategoryQuestion } from '../api';
import SimTerminal from '../components/SimTerminal';
import FullSimLab from '../components/FullSimLab';

interface Props {
  categoryKey: string;
  categoryLabel: string;
  onExit: () => void;
}

type UserAnswer =
  | { kind: 'test'; selected: string[] }
  | { kind: 'match'; selected: Record<number, string> }
  | { kind: 'lab' };

function initAnswer(q: CategoryQuestion): UserAnswer {
  if (q.type === 'match') return { kind: 'match', selected: {} };
  if (q.type === 'lab') return { kind: 'lab' };
  return { kind: 'test', selected: [] };
}

function shuffled(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function storageKey(categoryKey: string): string {
  return `ccnp-quiz-progress-${categoryKey}`;
}

function summaryKey(categoryKey: string): string {
  return `ccnp-quiz-summary-${categoryKey}`;
}

function loadSaved(categoryKey: string): { answers: Record<number, UserAnswer>; checked: Record<number, boolean> } | null {
  try {
    const raw = localStorage.getItem(storageKey(categoryKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.answers && parsed.checked) return parsed;
    return null;
  } catch {
    return null;
  }
}

function saveProgress(
  categoryKey: string,
  answers: Record<number, UserAnswer>,
  checked: Record<number, boolean>,
  questions: CategoryQuestion[],
) {
  try {
    localStorage.setItem(storageKey(categoryKey), JSON.stringify({ answers, checked }));
    let correct = 0;
    let checkedCount = 0;
    questions.forEach((qq, i) => {
      if (!checked[i] || qq.type === 'lab') return;
      checkedCount++;
      if (isCorrect(qq, answers[i])) correct++;
    });
    localStorage.setItem(summaryKey(categoryKey), JSON.stringify({ correct, checked: checkedCount, total: questions.length }));
  } catch {
    // localStorage unavailable (private mode, etc.) — progress just won't persist
  }
}

export default function CategoryQuiz({ categoryKey, categoryLabel, onExit }: Props) {
  const [questions, setQuestions] = useState<CategoryQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<number[]>([]);
  const [position, setPosition] = useState(0);
  const [isShuffled, setIsShuffled] = useState(false);
  const [answers, setAnswers] = useState<Record<number, UserAnswer>>({});
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    setQuestions(null);
    setPosition(0);
    setIsShuffled(false);
    setShowPicker(false);
    const saved = loadSaved(categoryKey);
    setAnswers(saved?.answers ?? {});
    setChecked(saved?.checked ?? {});
    api
      .categoryQuestions(categoryKey)
      .then((qs) => {
        setQuestions(qs);
        setOrder(qs.map((_, i) => i));
      })
      .catch((e) => setError(String(e)));
  }, [categoryKey]);

  useEffect(() => {
    if (!questions) return;
    saveProgress(categoryKey, answers, checked, questions);
  }, [categoryKey, questions, answers, checked]);

  const index = order[position] ?? 0;
  const q = questions?.[index];
  const answer = q ? (answers[index] ?? initAnswer(q)) : null;
  const isChecked = !!checked[index];

  const score = useMemo(() => {
    if (!questions) return { correct: 0, total: 0 };
    let correct = 0;
    let total = 0;
    questions.forEach((qq, i) => {
      if (!checked[i] || qq.type === 'lab') return;
      total++;
      if (isCorrect(qq, answers[i])) correct++;
    });
    return { correct, total };
  }, [questions, checked, answers]);

  if (error) return <div className="p-8 text-red-400">Backend'e ulaşılamadı: {error}</div>;
  if (!questions) return <div className="p-8 text-zinc-500">Sorular yükleniyor…</div>;
  if (!q || !answer) return <div className="p-8 text-zinc-500">Soru bulunamadı.</div>;

  const setAnswer = (a: UserAnswer) => setAnswers((prev) => ({ ...prev, [index]: a }));

  const gotoPosition = (p: number) => {
    if (p < 0 || p >= order.length) return;
    setPosition(p);
  };

  const gotoQuestionIndex = (qIndex: number) => {
    const p = order.indexOf(qIndex);
    if (p >= 0) setPosition(p);
    setShowPicker(false);
  };

  const toggleShuffle = () => {
    if (isShuffled) {
      setOrder(questions.map((_, i) => i));
      setIsShuffled(false);
    } else {
      setOrder(shuffled(questions.length));
      setIsShuffled(true);
    }
    setPosition(0);
  };

  const resetProgress = () => {
    if (!confirm('Bu kategorideki tüm ilerlemen silinecek. Emin misin?')) return;
    setAnswers({});
    setChecked({});
    setPosition(0);
  };

  const clearCurrentAnswer = () => {
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    setChecked((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const checkAll = () => {
    if (!questions) return;
    setChecked((prev) => {
      const next = { ...prev };
      questions.forEach((qq, i) => {
        const a = answers[i];
        const hasAnswer =
          (a?.kind === 'test' && a.selected.length > 0) ||
          (a?.kind === 'match' && Object.keys(a.selected).length > 0) ||
          qq.type === 'lab';
        if (hasAnswer) next[i] = true;
      });
      return next;
    });
  };

  // lab sorulari eski simulatordeki gibi tam ekran calisir; digerleri okunakli dar kolonda
  const isLab = q.type === 'lab';

  return (
    <div className={`mx-auto flex h-screen flex-col ${isLab ? 'max-w-none' : 'max-w-4xl'}`}>
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-800 bg-zinc-900 px-4 py-3">
        <button onClick={onExit} className="text-sm text-zinc-400 hover:text-zinc-100">
          ← Kategoriler
        </button>
        <h1 className="text-sm font-semibold">{categoryLabel}</h1>
        <span className="text-xs text-zinc-500">
          Soru {position + 1} / {questions.length} {isShuffled && <span className="text-amber-400">(karışık, #{q.n})</span>}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {score.total > 0 && (
            <span className="rounded bg-zinc-800 px-2 py-1 font-mono text-xs text-emerald-300">
              {score.correct}/{score.total} doğru
            </span>
          )}
          <button
            onClick={toggleShuffle}
            className={`rounded px-2.5 py-1.5 text-xs font-medium ${
              isShuffled ? 'bg-amber-800 text-amber-100 hover:bg-amber-700' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
            title="Soruları rastgele sırala"
          >
            🔀 {isShuffled ? 'Karışık' : 'Rastgele'}
          </button>
          <button
            onClick={() => setShowPicker((s) => !s)}
            className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700"
            title="Soru listesinden seç"
          >
            ☰ Sorular
          </button>
          <button
            onClick={checkAll}
            className="rounded bg-emerald-800 px-2.5 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-700"
            title="Cevapladığın tüm soruları tek seferde kontrol et"
          >
            ✓ Tümünü Kontrol Et
          </button>
          <button
            onClick={resetProgress}
            className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:bg-red-900 hover:text-red-200"
            title="İlerlemeyi sıfırla"
          >
            ↺
          </button>
        </div>
      </header>

      {showPicker && (
        <div className="max-h-64 overflow-y-auto border-b border-zinc-800 bg-zinc-950 p-3">
          <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10 md:grid-cols-12">
            {questions.map((qq, i) => {
              const wasChecked = checked[i];
              const wasCorrect = wasChecked && qq.type !== 'lab' && isCorrect(qq, answers[i]);
              const isCurrent = i === index;
              let cls = 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700';
              if (isCurrent) cls = 'bg-sky-700 text-white ring-2 ring-sky-400';
              else if (wasChecked && qq.type === 'lab') cls = 'bg-zinc-700 text-zinc-300';
              else if (wasChecked && wasCorrect) cls = 'bg-emerald-800 text-emerald-100';
              else if (wasChecked && !wasCorrect) cls = 'bg-red-900 text-red-200';
              return (
                <button
                  key={i}
                  onClick={() => gotoQuestionIndex(i)}
                  className={`rounded px-1.5 py-1 font-mono text-xs ${cls}`}
                  title={qq.q.slice(0, 60)}
                >
                  {qq.n}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className={`min-h-0 flex-1 ${isLab ? 'flex flex-col p-3' : 'overflow-y-auto p-6'}`}>
        <QuestionView
          key={index}
          question={q}
          categoryKey={categoryKey}
          answer={answer}
          setAnswer={setAnswer}
          checked={isChecked}
        />
      </div>

      <footer className="flex items-center gap-3 border-t border-zinc-800 bg-zinc-900 px-4 py-3">
        <button
          onClick={() => gotoPosition(position - 1)}
          disabled={position === 0}
          className="rounded bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-40"
        >
          ◀ Önceki
        </button>
        {!isChecked ? (
          <button
            onClick={() => setChecked((prev) => ({ ...prev, [index]: true }))}
            className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium hover:bg-emerald-600"
          >
            Kontrol Et
          </button>
        ) : (
          <button
            onClick={() => setChecked((prev) => ({ ...prev, [index]: false }))}
            className="rounded bg-zinc-700 px-4 py-1.5 text-sm hover:bg-zinc-600"
          >
            Cevabı Gizle
          </button>
        )}
        <button
          onClick={clearCurrentAnswer}
          className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-400 hover:bg-red-900 hover:text-red-200"
          title="Bu sorunun cevabını temizle, baştan dene"
        >
          ↺ Bu Soruyu Sıfırla
        </button>
        <select
          value={index}
          onChange={(e) => gotoQuestionIndex(Number(e.target.value))}
          className="ml-auto rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
        >
          {questions.map((qq, i) => (
            <option key={i} value={i}>
              Soru {qq.n}
              {checked[i] && qq.type !== 'lab' ? (isCorrect(qq, answers[i]) ? ' ✓' : ' ✗') : checked[i] ? ' •' : ''}
            </option>
          ))}
        </select>
        <button
          onClick={() => gotoPosition(position + 1)}
          disabled={position === order.length - 1}
          className="rounded bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-40"
        >
          Sonraki ▶
        </button>
      </footer>
    </div>
  );
}

function isCorrect(q: CategoryQuestion, a: UserAnswer | undefined): boolean {
  if (!a) return false;
  if (q.type === 'match') {
    if (a.kind !== 'match') return false;
    if (!q.pairs) return false;
    return q.pairs.every((p, i) => (a.selected[i] ?? '').trim() === p.answer.trim());
  }
  if (q.type === 'lab') return true;
  if (a.kind !== 'test') return false;
  const correct = new Set((q.a ?? []).map((x) => x.trim().toUpperCase()));
  const selected = new Set(a.selected.map((x) => x.trim().toUpperCase()));
  if (correct.size !== selected.size) return false;
  for (const c of correct) if (!selected.has(c)) return false;
  return true;
}

function QuestionView({
  question,
  categoryKey,
  answer,
  setAnswer,
  checked,
}: {
  question: CategoryQuestion;
  categoryKey: string;
  answer: UserAnswer;
  setAnswer: (a: UserAnswer) => void;
  checked: boolean;
}) {
  // lab: eski simulator gibi solda soru/gorevler, sagda tam boy konsol
  if (question.type === 'lab') {
    return (
      <div className="flex min-h-0 flex-1 gap-3">
        <aside className="w-[36%] min-w-[300px] max-w-[560px] space-y-4 overflow-y-auto pr-2">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-100">{question.q}</p>
          {question.exhibit && (
            <pre className="overflow-x-auto rounded border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-300">
              {question.exhibit}
            </pre>
          )}
          {question.img && (
            <img
              src={`/assets/questions/${categoryKey}/${encodeURIComponent(question.img)}`}
              alt="exhibit"
              className="max-w-full rounded border border-zinc-800"
            />
          )}
          <LabInfo question={question} />
          {checked && question.e && (
            <div className="rounded border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300">
              <span className="font-semibold text-zinc-100">Açıklama: </span>
              {question.e}
            </div>
          )}
        </aside>
        <div className="flex min-h-0 flex-1 flex-col">
          <LabConsole question={question} categoryKey={categoryKey} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="whitespace-pre-wrap text-base leading-relaxed text-zinc-100">{question.q}</p>

      {question.exhibit && (
        <pre className="overflow-x-auto rounded border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-300">
          {question.exhibit}
        </pre>
      )}

      {question.img && (
        <img
          src={`/assets/questions/${categoryKey}/${encodeURIComponent(question.img)}`}
          alt="exhibit"
          className="max-w-full rounded border border-zinc-800"
        />
      )}

      {(!question.type || question.type === 'test') && (
        <TestBody question={question} answer={answer} setAnswer={setAnswer} checked={checked} />
      )}
      {question.type === 'match' && (
        <MatchBody question={question} answer={answer} setAnswer={setAnswer} checked={checked} />
      )}
      {checked && (
        <div className="rounded border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-300">
          <p className="mb-2">
            <span className="font-semibold text-emerald-300">Doğru cevap: </span>
            {question.type === 'match'
              ? question.pairs?.map((p) => `${p.prompt} → ${p.answer}`).join(' | ')
              : (question.a ?? []).join(', ')}
          </p>
          {question.e && (
            <p className="mb-2">
              <span className="font-semibold text-zinc-100">Açıklama: </span>
              {question.e}
            </p>
          )}
          {question.r && (
            <p>
              <a href={question.r} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">
                Kaynak
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function TestBody({
  question,
  answer,
  setAnswer,
  checked,
}: {
  question: CategoryQuestion;
  answer: UserAnswer;
  setAnswer: (a: UserAnswer) => void;
  checked: boolean;
}) {
  if (answer.kind !== 'test') return null;
  const options = Object.entries(question.o ?? {});
  const multi = (question.a?.length ?? 1) > 1;
  const correctSet = new Set((question.a ?? []).map((x) => x.trim().toUpperCase()));

  const toggle = (key: string) => {
    if (checked) return;
    if (multi) {
      const has = answer.selected.includes(key);
      setAnswer({ kind: 'test', selected: has ? answer.selected.filter((k) => k !== key) : [...answer.selected, key] });
    } else {
      setAnswer({ kind: 'test', selected: [key] });
    }
  };

  return (
    <div className="space-y-2">
      {multi && <p className="text-xs text-amber-400">Birden fazla doğru cevap seçilebilir.</p>}
      {options.map(([key, text]) => {
        const selected = answer.selected.includes(key);
        const isCorrectOpt = correctSet.has(key);
        let cls = 'border-zinc-800 bg-zinc-900 hover:border-zinc-600';
        if (checked) {
          if (isCorrectOpt) cls = 'border-emerald-600 bg-emerald-950 text-emerald-200';
          else if (selected) cls = 'border-red-700 bg-red-950 text-red-200';
          else cls = 'border-zinc-800 bg-zinc-900 opacity-60';
        } else if (selected) {
          cls = 'border-sky-600 bg-sky-950';
        }
        return (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            disabled={checked}
            className={`flex w-full items-start gap-3 rounded border px-4 py-2.5 text-left text-sm transition-colors ${cls}`}
          >
            <span className="font-mono font-semibold">{key}.</span>
            <span className="whitespace-pre-wrap">{text}</span>
            {checked && isCorrectOpt && <span className="ml-auto shrink-0">✓</span>}
            {checked && selected && !isCorrectOpt && <span className="ml-auto shrink-0">✗</span>}
          </button>
        );
      })}
    </div>
  );
}

function MatchBody({
  question,
  answer,
  setAnswer,
  checked,
}: {
  question: CategoryQuestion;
  answer: UserAnswer;
  setAnswer: (a: UserAnswer) => void;
  checked: boolean;
}) {
  if (answer.kind !== 'match') return null;
  const options = question.options ?? [];
  const pairs = question.pairs ?? [];

  const setPair = (i: number, val: string) => {
    if (checked) return;
    setAnswer({ kind: 'match', selected: { ...answer.selected, [i]: val } });
  };

  return (
    <div className="space-y-2">
      {question.topology && (
        <div className="mb-3">
          <h3 className="mb-1 text-xs font-semibold uppercase text-zinc-500">Topoloji</h3>
          <p className="whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
            {question.topology}
          </p>
        </div>
      )}
      {options.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {options.map((o, i) => (
            <span key={i} className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
              {o}
            </span>
          ))}
        </div>
      )}
      {pairs.map((p, i) => {
        const sel = answer.selected[i] ?? '';
        const ok = sel.trim() === p.answer.trim();
        return (
          <div
            key={i}
            className={`flex items-center gap-3 rounded border px-4 py-2.5 text-sm ${
              checked ? (ok ? 'border-emerald-600 bg-emerald-950' : 'border-red-700 bg-red-950') : 'border-zinc-800 bg-zinc-900'
            }`}
          >
            <span className="flex-1 whitespace-pre-wrap">{p.prompt}</span>
            <select
              value={sel}
              onChange={(e) => setPair(i, e.target.value)}
              disabled={checked}
              className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
            >
              <option value="">— seç —</option>
              {[...new Set(options.length ? options : pairs.map((pp) => pp.answer))].map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            {checked && !ok && <span className="text-xs text-emerald-300">→ {p.answer}</span>}
          </div>
        );
      })}
    </div>
  );
}

function LabInfo({ question }: { question: CategoryQuestion }) {
  return (
    <div className="space-y-3">
      {question.topology && (
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase text-zinc-500">Topoloji</h3>
          <p className="whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
            {question.topology}
          </p>
        </div>
      )}
      {question.devices && question.devices.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase text-zinc-500">Cihazlar</h3>
          <p className="text-sm text-zinc-300">{question.devices.join(', ')}</p>
        </div>
      )}
      {question.tasks && question.tasks.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase text-zinc-500">Görevler</h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-200">
            {question.tasks.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function LabConsole({ question, categoryKey }: { question: CategoryQuestion; categoryKey: string }) {
  const devices = question.devices && question.devices.length > 0 ? question.devices : ['R1'];
  const [activeDevice, setActiveDevice] = useState(devices[0]);
  const [resetTick, setResetTick] = useState(0);
  const [fullSim, setFullSim] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFullSim(null);
    api
      .labItem(categoryKey, question.n)
      .then(() => {
        if (!cancelled) setFullSim(true);
      })
      .catch(() => {
        if (!cancelled) setFullSim(false);
      });
    return () => {
      cancelled = true;
    };
  }, [categoryKey, question.n]);

  if (fullSim === null) return <div className="p-4 text-sm text-zinc-500">Konsol yükleniyor…</div>;
  if (fullSim) return <FullSimLab category={categoryKey} n={question.n} />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase text-zinc-500">Konsol (pratik — otomatik puanlama yok)</h3>
        <button
          onClick={() => setResetTick((x) => x + 1)}
          className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-700"
          title="Terminali sıfırla"
        >
          ↺ Sıfırla
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-zinc-800">
        <div className="flex border-b border-zinc-800 bg-zinc-900">
          {devices.map((d) => (
            <button
              key={d}
              onClick={() => setActiveDevice(d)}
              className={`px-3 py-1.5 font-mono text-xs ${
                activeDevice === d ? 'bg-black text-emerald-300' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="relative min-h-0 flex-1 bg-black p-1">
          {devices.map((d) => (
            <SimTerminal key={`${d}-${resetTick}`} device={d} visible={activeDevice === d} resetTick={resetTick} />
          ))}
        </div>
      </div>
    </div>
  );
}

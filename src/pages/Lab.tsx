import { useCallback, useEffect, useState } from 'react';
import { api, type DeviceInfo, type GradeReportData, type PublicItem } from '../api';
import QuestionPanel from '../components/QuestionPanel';
import DeviceTerminal from '../components/Terminal';
import GradeReportModal from '../components/GradeReport';

function Timer({ startedAt }: { startedAt: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.floor((Date.now() - startedAt) / 1000);
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  return <span className="font-mono text-sm text-zinc-400">⏱ {mm}:{ss}</span>;
}

interface Props {
  itemId: number;
  totalItems: number;
  onNavigate: (id: number) => void;
  onExit: () => void;
}

export default function Lab({ itemId, totalItems, onNavigate, onExit }: Props) {
  const [item, setItem] = useState<PublicItem | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [active, setActive] = useState<string>('');
  const [report, setReport] = useState<GradeReportData | null>(null);
  const [resetTick, setResetTick] = useState(0);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItem(null);
    setSessionId(null);
    setReport(null);
    Promise.all([api.item(itemId), api.start(itemId)])
      .then(([it, s]) => {
        setItem(it);
        setSessionId(s.sessionId);
        setDevices(s.devices);
        setActive(s.devices[0]?.name ?? '');
        setStartedAt(Date.now());
        setResetTick((x) => x + 1);
      })
      .catch((e) => setError(String(e)));
  }, [itemId]);

  const doReset = useCallback(() => {
    if (!sessionId) return;
    api.reset(sessionId).then((r) => {
      setDevices(r.devices);
      setReport(null);
      setResetTick((x) => x + 1);
      setStartedAt(Date.now());
    });
  }, [sessionId]);

  const doGrade = useCallback(() => {
    if (!sessionId) return;
    api.grade(sessionId).then(setReport).catch((e) => setError(String(e)));
  }, [sessionId]);

  if (error) return <div className="p-8 text-red-400">{error}</div>;
  if (!item || !sessionId) return <div className="p-8 text-zinc-500">Lab yükleniyor…</div>;

  return (
    <div className="flex h-screen flex-col">
      {/* ust bar */}
      <header className="flex items-center gap-4 border-b border-zinc-800 bg-zinc-900 px-4 py-2">
        <button onClick={onExit} className="text-sm text-zinc-400 hover:text-zinc-100">
          ← Liste
        </button>
        <h1 className="text-sm font-semibold">
          Item {item.id} of {totalItems} (Lab, Q{item.id})
        </h1>
        <span className="hidden text-xs text-zinc-500 md:inline">{item.title}</span>
        <div className="ml-auto flex items-center gap-3">
          <Timer startedAt={startedAt} />
          <button onClick={doGrade} className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium hover:bg-emerald-600">
            Kontrol Et
          </button>
          <button onClick={doReset} className="rounded bg-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-600">
            Sıfırla
          </button>
          <button
            onClick={() => onNavigate(item.id > 1 ? item.id - 1 : totalItems)}
            className="rounded bg-zinc-800 px-2 py-1.5 text-sm hover:bg-zinc-700"
          >
            ◀
          </button>
          <button
            onClick={() => onNavigate(item.id < totalItems ? item.id + 1 : 1)}
            className="rounded bg-zinc-800 px-2 py-1.5 text-sm hover:bg-zinc-700"
          >
            Sonraki ▶
          </button>
        </div>
      </header>

      {/* govde */}
      <div className="flex min-h-0 flex-1">
        <aside className="w-[44%] min-w-[380px] max-w-[640px] border-r border-zinc-800 bg-zinc-900/50">
          <QuestionPanel item={item} onDeviceClick={setActive} />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col bg-black">
          <div className="flex border-b border-zinc-800 bg-zinc-900">
            {devices.map((d) => (
              <button
                key={d.name}
                onClick={() => setActive(d.name)}
                className={`px-4 py-2 font-mono text-sm ${
                  active === d.name ? 'bg-black text-emerald-300' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {d.type === 'pc' ? '🖥 ' : d.type === 'ios-switch' ? '🔀 ' : '📡 '}
                {d.name}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 p-1">
            {devices.map((d) => (
              <DeviceTerminal
                key={`${d.name}-${resetTick}`}
                sessionId={sessionId}
                device={d.name}
                initialPrompt={d.prompt}
                visible={active === d.name}
                resetTick={resetTick}
              />
            ))}
          </div>
        </main>
      </div>

      {report && <GradeReportModal report={report} sessionId={sessionId} onClose={() => setReport(null)} />}
    </div>
  );
}

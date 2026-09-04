import { useEffect, useRef, useState } from 'react';
import { api, type DeviceInfo, type GradeReportData, type LineResult, type PublicItem } from '../api';
import DeviceTerminal, { type DeviceTerminalHandle } from './Terminal';

interface Props {
  category: string;
  n: number;
}

/** Bir grading path'inin hangi alt modda girildigini gosteren prompt (or. R10(config-if)#) */
function subPrompt(device: string, path: string[]): string {
  if (path.length === 0) return `${device}(config)#`;
  const head = path[path.length - 1];
  if (head.startsWith('interface')) return `${device}(config-if)#`;
  if (head.startsWith('router')) return `${device}(config-router)#`;
  if (head.startsWith('ip sla')) return `${device}(config-ip-sla)#`;
  if (head.startsWith('vrf definition')) return `${device}(config-vrf)#`;
  if (head.startsWith('ip access-list')) return `${device}(config-ext-nacl)#`;
  if (head.startsWith('class-map')) return `${device}(config-cmap)#`;
  if (head.startsWith('policy-map')) return `${device}(config-pmap)#`;
  if (head.startsWith('line ')) return `${device}(config-line)#`;
  return `${device}(config-sub)#`;
}

/** Eksik satirlari, "hangi promptta ne yazilacak" seklinde tam komut dizisine cevirir.
 *  Grading path'i (or. ["interface Tunnel0"]) hangi alt moda girilecegini soyler. */
function missingCommandBlock(device: string, task: number, missing: LineResult[]): string[] {
  const byPath = new Map<string, string[]>();
  for (const l of missing) {
    const key = JSON.stringify(l.path);
    if (!byPath.has(key)) byPath.set(key, []);
    byPath.get(key)!.push(l.line);
  }

  // [gorulen prompt, yazilacak komut] ciftleri
  const steps: Array<[string, string]> = [
    [`${device}>`, 'enable'],
    [`${device}#`, 'configure terminal'],
  ];
  for (const [key, lines] of byPath) {
    const path = JSON.parse(key) as string[];
    let cur = `${device}(config)#`;
    for (let i = 0; i < path.length; i++) {
      steps.push([cur, path[i]]);
      cur = subPrompt(device, path.slice(0, i + 1));
    }
    for (const line of lines) steps.push([cur, line]);
    if (path.length > 0) steps.push([cur, 'exit']);
  }
  steps.push([`${device}(config)#`, 'end']);

  const width = Math.max(...steps.map((s) => s[0].length));
  return [
    `Görev ${task} eksik — ${device} konsolunda soldaki prompt'u görünce sağdaki komutu yaz:`,
    ...steps.map(([p, c]) => `   ${p.padEnd(width)}  ${c}`),
  ];
}

/** Eski motora bagli, tam simulasyonlu lab konsolu. Kontrol Et -> eksik satirlar
 *  terminale kirmizi renkte yazilir (ayri bir rapor kutusu yerine). */
export default function FullSimLab({ category, n }: Props) {
  const [item, setItem] = useState<PublicItem | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [active, setActive] = useState<string>('');
  const [resetTick, setResetTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastReport, setLastReport] = useState<GradeReportData | null>(null);
  const termRefs = useRef<Record<string, DeviceTerminalHandle | null>>({});

  useEffect(() => {
    setItem(null);
    setSessionId(null);
    setLastReport(null);
    Promise.all([api.labItem(category, n), api.startLab(category, n)])
      .then(([it, s]) => {
        setItem(it);
        setSessionId(s.sessionId);
        setDevices(s.devices);
        setActive(s.devices[0]?.name ?? '');
      })
      .catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, n]);

  const doReset = () => {
    if (!sessionId) return;
    api.reset(sessionId).then((r) => {
      setDevices(r.devices);
      setLastReport(null);
      setResetTick((x) => x + 1);
    });
  };

  const doGrade = () => {
    if (!sessionId) return;
    api.grade(sessionId).then((report) => {
      setLastReport(report);
      for (const task of report.tasks) {
        const missing = task.lines.filter((l) => !l.ok);
        if (missing.length === 0) {
          if (task.passed) {
            termRefs.current[task.device]?.injectLines(
              [`✓ Görev ${task.task} tamam (${task.earned}/${task.points} puan)`],
              'green',
            );
          }
          continue;
        }
        termRefs.current[task.device]?.injectLines(missingCommandBlock(task.device, task.task, missing), 'red');
      }
    });
  };

  if (error) return <div className="p-4 text-sm text-red-400">{error}</div>;
  if (!item || !sessionId) return <div className="p-4 text-sm text-zinc-500">Konsol yükleniyor…</div>;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase text-zinc-500">Konsol (gerçek IOS motoru)</h3>
        <div className="flex items-center gap-2">
          {lastReport && (
            <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs text-emerald-300">
              {lastReport.score}/{lastReport.max}
            </span>
          )}
          <button onClick={doGrade} className="rounded bg-emerald-700 px-2 py-0.5 text-xs font-medium hover:bg-emerald-600">
            Kontrol Et
          </button>
          <button onClick={doReset} className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-700">
            ↺ Sıfırla
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-zinc-800">
        <div className="flex shrink-0 border-b border-zinc-800 bg-zinc-900">
          {devices.map((d) => (
            <button
              key={d.name}
              onClick={() => setActive(d.name)}
              className={`px-3 py-1.5 font-mono text-xs ${
                active === d.name ? 'bg-black text-emerald-300' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {d.type === 'pc' ? '🖥 ' : d.type === 'ios-switch' ? '🔀 ' : '📡 '}
              {d.name}
            </button>
          ))}
        </div>
        <div className="relative min-h-0 flex-1 bg-black p-1">
          {devices.map((d) => (
            <DeviceTerminal
              key={`${d.name}-${resetTick}`}
              ref={(el) => {
                termRefs.current[d.name] = el;
              }}
              sessionId={sessionId}
              device={d.name}
              initialPrompt={d.prompt}
              visible={active === d.name}
              resetTick={resetTick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

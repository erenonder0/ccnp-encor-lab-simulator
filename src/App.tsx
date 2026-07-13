import { useCallback, useEffect, useState } from 'react';
import { api, type ItemSummary } from './api';
import Lab from './pages/Lab';

export default function App() {
  const [items, setItems] = useState<ItemSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<number | null>(null);

  const refresh = useCallback(() => {
    api
      .items()
      .then(setItems)
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(refresh, [refresh]);

  if (activeItem !== null && items) {
    return (
      <Lab
        itemId={activeItem}
        totalItems={items.length}
        onNavigate={setActiveItem}
        onExit={() => {
          setActiveItem(null);
          refresh();
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-1 text-2xl font-bold">CCNP ENCOR Lab Simülatörü</h1>
      <p className="mb-6 text-sm text-zinc-400">Bir soru seç, konsolda konfigürasyonu yap, "Kontrol Et" ile puanla.</p>
      {error && <p className="text-red-400">Backend'e ulaşılamadı: {error}</p>}
      {!items && !error && <p className="text-zinc-500">Yükleniyor…</p>}
      {items && (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setActiveItem(it.id)}
                onKeyDown={(e) => e.key === 'Enter' && setActiveItem(it.id)}
                className="flex w-full cursor-pointer items-center justify-between rounded border border-zinc-800 bg-zinc-900 px-4 py-3 text-left hover:border-emerald-700 hover:bg-zinc-800"
              >
                <div className="min-w-0">
                  <span className="mr-3 font-mono text-zinc-500">#{String(it.id).padStart(2, '0')}</span>
                  <span>{it.title}</span>
                  {it.review && (
                    <span className="ml-2 rounded bg-amber-900 px-1.5 py-0.5 text-xs text-amber-300">review</span>
                  )}
                </div>
                <div className="ml-4 flex shrink-0 items-center gap-3">
                  <span className="text-xs text-zinc-500">{it.topics.join(', ')}</span>
                  {it.progress && (
                    <>
                      <span
                        className={`rounded px-2 py-0.5 font-mono text-xs ${
                          it.progress.best === it.progress.max
                            ? 'bg-emerald-900 text-emerald-300'
                            : 'bg-zinc-800 text-amber-300'
                        }`}
                        title={`${it.progress.attempts} deneme`}
                      >
                        {it.progress.best}/{it.progress.max}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          api.resetProgress(it.id).then(refresh);
                        }}
                        title="Skoru sıfırla (tekrar çöz)"
                        className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400 hover:bg-red-900 hover:text-red-200"
                      >
                        ↺
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

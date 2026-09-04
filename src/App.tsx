import { useCallback, useEffect, useState } from 'react';
import { api, type CategorySummary, type ItemSummary } from './api';
import Lab from './pages/Lab';
import CategoryQuiz from './pages/CategoryQuiz';

type View = { kind: 'categories' } | { kind: 'quiz'; key: string; label: string } | { kind: 'legacy-list' } | { kind: 'legacy-item'; id: number };

function readCategoryProgress(categoryKey: string): { correct: number; checked: number; total: number } | null {
  try {
    const raw = localStorage.getItem(`ccnp-quiz-summary-${categoryKey}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function App() {
  const [view, setView] = useState<View>({ kind: 'categories' });
  const [categories, setCategories] = useState<CategorySummary[] | null>(null);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  const [items, setItems] = useState<ItemSummary[] | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);

  const refreshCategories = useCallback(() => {
    api
      .categories()
      .then(setCategories)
      .catch((e) => setCategoriesError(String(e)));
  }, []);

  useEffect(refreshCategories, [refreshCategories]);

  const refreshItems = useCallback(() => {
    api
      .items()
      .then(setItems)
      .catch((e) => setItemsError(String(e)));
  }, []);

  if (view.kind === 'quiz') {
    return (
      <CategoryQuiz
        categoryKey={view.key}
        categoryLabel={view.label}
        onExit={() => setView({ kind: 'categories' })}
      />
    );
  }

  if (view.kind === 'legacy-item' && items) {
    return (
      <Lab
        itemId={view.id}
        totalItems={items.length}
        onNavigate={(id) => setView({ kind: 'legacy-item', id })}
        onExit={() => {
          setView({ kind: 'legacy-list' });
          refreshItems();
        }}
      />
    );
  }

  if (view.kind === 'legacy-list') {
    if (!items && !itemsError) refreshItems();
    return (
      <div className="mx-auto max-w-4xl p-8">
        <button onClick={() => setView({ kind: 'categories' })} className="mb-4 text-sm text-zinc-400 hover:text-zinc-100">
          ← Kategoriler
        </button>
        <h1 className="mb-1 text-2xl font-bold">Eski Lab Simülatörü</h1>
        <p className="mb-6 text-sm text-zinc-400">Bir soru seç, konsolda konfigürasyonu yap, "Kontrol Et" ile puanla.</p>
        {itemsError && <p className="text-red-400">Backend'e ulaşılamadı: {itemsError}</p>}
        {!items && !itemsError && <p className="text-zinc-500">Yükleniyor…</p>}
        {items && (
          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setView({ kind: 'legacy-item', id: it.id })}
                  onKeyDown={(e) => e.key === 'Enter' && setView({ kind: 'legacy-item', id: it.id })}
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
                            api.resetProgress(it.id).then(refreshItems);
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

  const totalQuestions = categories?.reduce((a, c) => a + c.count, 0) ?? 0;
  const overall = (categories ?? []).reduce(
    (acc, c) => {
      const p = readCategoryProgress(c.key);
      return p ? { correct: acc.correct + p.correct, checked: acc.checked + p.checked } : acc;
    },
    { correct: 0, checked: 0 },
  );

  return (
    <div className="min-h-screen w-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-6 py-10 lg:py-14">
        <header className="mb-8 border-b border-zinc-800 pb-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-zinc-50 lg:text-4xl">CCNP ENCOR Sınav Simülatörü</h1>
              <p className="mt-2 text-sm text-zinc-400">
                350-401 soru bankası + gerçek Cisco IOS konsolu. Bir kategori seç ve başla.
              </p>
            </div>
            {totalQuestions > 0 && (
              <div className="flex items-center gap-5 text-right">
                <div>
                  <div className="font-mono text-2xl font-semibold text-zinc-100">{totalQuestions}</div>
                  <div className="text-xs uppercase tracking-wide text-zinc-500">soru</div>
                </div>
                <div>
                  <div className="font-mono text-2xl font-semibold text-emerald-400">{overall.checked}</div>
                  <div className="text-xs uppercase tracking-wide text-zinc-500">çözüldü</div>
                </div>
                {overall.checked > 0 && (
                  <div>
                    <div className="font-mono text-2xl font-semibold text-sky-400">
                      %{Math.round((overall.correct / overall.checked) * 100)}
                    </div>
                    <div className="text-xs uppercase tracking-wide text-zinc-500">başarı</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {categoriesError && (
          <p className="rounded border border-red-900 bg-red-950/40 p-4 text-red-300">
            Backend'e ulaşılamadı: {categoriesError}
            <span className="mt-1 block text-xs text-red-400/80">
              API 3001 portunda çalışıyor mu? <code className="font-mono">npm run dev</code> ile ikisini birlikte başlat.
            </span>
          </p>
        )}
        {!categories && !categoriesError && <p className="text-zinc-500">Yükleniyor…</p>}

        {categories && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => {
              const progress = readCategoryProgress(c.key);
              const done = progress?.checked ?? 0;
              const pct = c.count > 0 ? Math.round((done / c.count) * 100) : 0;
              return (
                <button
                  key={c.key}
                  onClick={() => setView({ kind: 'quiz', key: c.key, label: c.label })}
                  className="group flex flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-left transition-colors hover:border-emerald-700 hover:bg-zinc-800/80"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-lg font-semibold text-zinc-100 group-hover:text-emerald-300">{c.label}</span>
                    <span className="shrink-0 font-mono text-xs text-zinc-500">{c.count} soru</span>
                  </div>

                  <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-emerald-600 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-zinc-500">{done > 0 ? `${done}/${c.count} çözüldü` : 'henüz başlanmadı'}</span>
                    {progress && progress.checked > 0 && (
                      <span className="font-mono text-emerald-400">{progress.correct}/{progress.checked} doğru</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-zinc-800 pt-5 text-xs text-zinc-500">
          <button onClick={() => setView({ kind: 'legacy-list' })} className="hover:text-zinc-300">
            Eski lab simülatörünü aç (40 item) →
          </button>
          <span className="text-zinc-700">•</span>
          <span>İlerleme tarayıcında saklanır (localStorage)</span>
        </div>
      </div>
    </div>
  );
}

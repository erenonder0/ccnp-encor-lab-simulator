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

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-1 text-2xl font-bold">CCNP ENCOR Sınav Simülatörü</h1>
      <p className="mb-6 text-sm text-zinc-400">Bir kategori seç ve sorulara başla.</p>
      {categoriesError && <p className="text-red-400">Backend'e ulaşılamadı: {categoriesError}</p>}
      {!categories && !categoriesError && <p className="text-zinc-500">Yükleniyor…</p>}
      {categories && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {categories.map((c) => {
            const progress = readCategoryProgress(c.key);
            return (
              <button
                key={c.key}
                onClick={() => setView({ kind: 'quiz', key: c.key, label: c.label })}
                className="flex flex-col items-start rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-4 text-left transition-colors hover:border-emerald-700 hover:bg-zinc-800"
              >
                <span className="text-lg font-semibold text-zinc-100">{c.label}</span>
                <span className="mt-1 text-xs text-zinc-500">{c.count} soru</span>
                {progress && progress.checked > 0 && (
                  <span className="mt-2 rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs text-emerald-300">
                    {progress.correct}/{progress.checked} doğru · {progress.checked}/{c.count} çözüldü
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-10 border-t border-zinc-800 pt-4">
        <button onClick={() => setView({ kind: 'legacy-list' })} className="text-xs text-zinc-500 hover:text-zinc-300">
          Eski lab simülatörünü aç →
        </button>
      </div>
    </div>
  );
}

import express from 'express';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  completeOnDevice,
  createSession,
  devicePrompts,
  execOnDevice,
  getSession,
  gradeSession,
  loadProgress,
  resetProgress,
  resetSession,
  type Item,
} from './session';

const app = express();
app.use(express.json());

const ITEMS_DIR = path.resolve('data/items');
const QUESTIONS_DIR = path.resolve('data/questions');
const LABS_DIR = path.resolve('data/labs');

const CATEGORIES: Array<{ key: string; label: string }> = [
  { key: 'architecture', label: 'Architecture' },
  { key: 'virtualization', label: 'Virtualization' },
  { key: 'infrastructure', label: 'Infrastructure' },
  { key: 'network-assurance', label: 'Network Assurance' },
  { key: 'security', label: 'Security' },
  { key: 'automation', label: 'Automation' },
];

function loadCategoryQuestions(key: string): unknown[] {
  const file = path.join(QUESTIONS_DIR, `${key}.jsonl`);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function loadItems(): Item[] {
  if (!existsSync(ITEMS_DIR)) return [];
  return readdirSync(ITEMS_DIR)
    .filter((f) => /^item-\d+\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(path.join(ITEMS_DIR, f), 'utf-8')) as Item)
    .sort((a, b) => Number(a.id) - Number(b.id));
}

function findItem(id: number): Item | undefined {
  return loadItems().find((it) => it.id === id);
}

function labFile(category: string, n: string | number): string {
  return path.join(LABS_DIR, `${category}-${n}.json`);
}

function loadLabItem(category: string, n: string | number): Item | undefined {
  const file = labFile(category, n);
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, 'utf-8')) as Item;
}

/** hem eski sayisal id'li item'lari hem yeni "kategori-n" lab item'larini bulur */
function findAnyItem(id: number | string): Item | undefined {
  if (typeof id === 'string' && id.includes('-')) {
    const dash = id.lastIndexOf('-');
    const category = id.slice(0, dash);
    const n = id.slice(dash + 1);
    return loadLabItem(category, n);
  }
  return findItem(Number(id));
}

app.get('/api/categories', (_req, res) => {
  res.json(CATEGORIES.map((c) => ({ ...c, count: loadCategoryQuestions(c.key).length })).filter((c) => c.count > 0));
});

app.get('/api/categories/:key', (req, res) => {
  const key = req.params.key;
  if (!CATEGORIES.some((c) => c.key === key)) return res.status(404).json({ error: 'category not found' });
  res.json(loadCategoryQuestions(key));
});

app.get('/api/items', (_req, res) => {
  const progress = loadProgress();
  res.json(
    loadItems().map(({ id, title, topics, difficulty, review }) => ({
      id,
      title,
      topics,
      difficulty,
      review,
      progress: progress.items[id] ?? null,
    })),
  );
});

app.get('/api/items/:id', (req, res) => {
  const item = findItem(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'item not found' });
  // Cevap anahtari ve puanlama istemciye sizmasin; grade sonrasi ayri endpoint'ten verilir.
  const { answer_key_raw, explanation, grading, ...publicItem } = item;
  res.json(publicItem);
});

app.get('/api/labs/:category/:n', (req, res) => {
  const item = loadLabItem(req.params.category, req.params.n);
  if (!item) return res.status(404).json({ error: 'lab not found' });
  const { answer_key_raw, explanation, grading, ...publicItem } = item;
  res.json(publicItem);
});

app.post('/api/labs/:category/:n/start', (req, res) => {
  const item = loadLabItem(req.params.category, req.params.n);
  if (!item) return res.status(404).json({ error: 'lab not found' });
  const s = createSession(item);
  res.json({ sessionId: s.id, itemId: item.id, devices: devicePrompts(s) });
});

app.get('/api/progress', (_req, res) => res.json(loadProgress()));

app.delete('/api/progress/:itemId', (req, res) => {
  resetProgress(Number(req.params.itemId));
  res.json({ ok: true });
});

app.post('/api/session/:itemId/start', (req, res) => {
  const item = findItem(Number(req.params.itemId));
  if (!item) return res.status(404).json({ error: 'item not found' });
  const s = createSession(item);
  res.json({ sessionId: s.id, itemId: item.id, devices: devicePrompts(s) });
});

app.post('/api/session/:sessionId/exec', (req, res) => {
  const s = getSession(req.params.sessionId);
  if (!s) return res.status(404).json({ error: 'session not found' });
  const { device, input } = req.body as { device?: string; input?: string };
  if (typeof device !== 'string' || typeof input !== 'string') {
    return res.status(400).json({ error: 'device ve input gerekli' });
  }
  const result = execOnDevice(s, device, input);
  if (!result) return res.status(404).json({ error: 'device not found' });
  res.json(result);
});

app.post('/api/session/:sessionId/complete', (req, res) => {
  const s = getSession(req.params.sessionId);
  if (!s) return res.status(404).json({ error: 'session not found' });
  const { device, input } = req.body as { device?: string; input?: string };
  if (typeof device !== 'string' || typeof input !== 'string') {
    return res.status(400).json({ error: 'device ve input gerekli' });
  }
  const completed = completeOnDevice(s, device, input);
  if (completed === null) return res.status(404).json({ error: 'device not found' });
  res.json({ input: completed });
});

app.post('/api/session/:sessionId/grade', (req, res) => {
  const s = getSession(req.params.sessionId);
  if (!s) return res.status(404).json({ error: 'session not found' });
  const item = findAnyItem(s.itemId)!;
  res.json(gradeSession(s, item));
});

app.get('/api/session/:sessionId/answer', (req, res) => {
  const s = getSession(req.params.sessionId);
  if (!s) return res.status(404).json({ error: 'session not found' });
  if (!s.graded) return res.status(403).json({ error: 'Cevabi gormek icin once "Kontrol Et" (grade) calistir.' });
  const item = findAnyItem(s.itemId)!;
  res.json({ answer_key_raw: item.answer_key_raw, explanation: item.explanation ?? '', hints: item.hints ?? [] });
});

app.post('/api/session/:sessionId/reset', (req, res) => {
  const s = getSession(req.params.sessionId);
  if (!s) return res.status(404).json({ error: 'session not found' });
  const item = findAnyItem(s.itemId)!;
  resetSession(s, item);
  res.json({ ok: true, devices: devicePrompts(s) });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`[api] http://localhost:${PORT}`);
});

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

function loadItems(): Item[] {
  if (!existsSync(ITEMS_DIR)) return [];
  return readdirSync(ITEMS_DIR)
    .filter((f) => /^item-\d+\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(path.join(ITEMS_DIR, f), 'utf-8')) as Item)
    .sort((a, b) => a.id - b.id);
}

function findItem(id: number): Item | undefined {
  return loadItems().find((it) => it.id === id);
}

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
  const item = findItem(s.itemId)!;
  res.json(gradeSession(s, item));
});

app.get('/api/session/:sessionId/answer', (req, res) => {
  const s = getSession(req.params.sessionId);
  if (!s) return res.status(404).json({ error: 'session not found' });
  if (!s.graded) return res.status(403).json({ error: 'Cevabi gormek icin once "Kontrol Et" (grade) calistir.' });
  const item = findItem(s.itemId)!;
  res.json({ answer_key_raw: item.answer_key_raw, explanation: item.explanation ?? '', hints: item.hints ?? [] });
});

app.post('/api/session/:sessionId/reset', (req, res) => {
  const s = getSession(req.params.sessionId);
  if (!s) return res.status(404).json({ error: 'session not found' });
  const item = findItem(s.itemId)!;
  resetSession(s, item);
  res.json({ ok: true, devices: devicePrompts(s) });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`[api] http://localhost:${PORT}`);
});

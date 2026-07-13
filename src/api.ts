export interface ItemSummary {
  id: number;
  title: string;
  topics: string[];
  difficulty: string;
  review: boolean;
  progress: { best: number; max: number; attempts: number; last: string } | null;
}

export interface DeviceInfo {
  name: string;
  prompt: string;
  type: 'ios-router' | 'ios-switch' | 'pc';
}

export interface PublicItem {
  id: number;
  title: string;
  topics: string[];
  difficulty: string;
  guidelines: string[];
  tasks: string[];
  topology_image?: string;
  device_table?: Array<{ device: string; interface: string; ip: string }>;
  hints?: string[];
}

export interface LineResult {
  line: string;
  path: string[];
  ok: boolean;
  found?: string;
}

export interface GradeReportData {
  score: number;
  max: number;
  tasks: Array<{
    task: number;
    device: string;
    points: number;
    earned: number;
    passed: boolean;
    lines: LineResult[];
    aliasUsed?: string;
  }>;
  forbidden_violations: Array<{ device: string; line: string; regex: string }>;
  saved: boolean;
  unsaved_devices: string[];
}

export interface AnswerData {
  answer_key_raw: string;
  explanation: string;
  hints: string[];
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => ({ error: res.statusText }))).error ?? res.statusText);
  return res.json() as Promise<T>;
}

export const api = {
  items: () => fetch('/api/items').then((r) => j<ItemSummary[]>(r)),
  item: (id: number) => fetch(`/api/items/${id}`).then((r) => j<PublicItem>(r)),
  start: (itemId: number) =>
    fetch(`/api/session/${itemId}/start`, { method: 'POST' }).then((r) =>
      j<{ sessionId: string; itemId: number; devices: DeviceInfo[] }>(r),
    ),
  complete: (sessionId: string, device: string, input: string) =>
    fetch(`/api/session/${sessionId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device, input }),
    }).then((r) => j<{ input: string }>(r)),
  resetProgress: (itemId: number) =>
    fetch(`/api/progress/${itemId}`, { method: 'DELETE' }).then((r) => j<{ ok: boolean }>(r)),
  exec: (sessionId: string, device: string, input: string) =>
    fetch(`/api/session/${sessionId}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device, input }),
    }).then((r) => j<{ output: string; prompt: string }>(r)),
  grade: (sessionId: string) => fetch(`/api/session/${sessionId}/grade`, { method: 'POST' }).then((r) => j<GradeReportData>(r)),
  answer: (sessionId: string) => fetch(`/api/session/${sessionId}/answer`).then((r) => j<AnswerData>(r)),
  reset: (sessionId: string) =>
    fetch(`/api/session/${sessionId}/reset`, { method: 'POST' }).then((r) => j<{ ok: boolean; devices: DeviceInfo[] }>(r)),
};

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { DeviceState } from './ios/types';
import { bootDevice, completeInput, execute, prompt } from './ios/engine';
import { parseConfig } from './ios/configTree';
import { grade, type GradeReport, type Grading } from './grader/grade';

export interface ItemDevice {
  name: string;
  type: 'ios-router' | 'ios-switch' | 'pc';
  enable_password?: string;
  interfaces?: string[];
  preconfig?: string[];
}

export interface Item {
  id: number;
  title: string;
  topics: string[];
  difficulty: string;
  review: boolean;
  guidelines: string[];
  tasks: string[];
  topology_image?: string;
  device_table?: Array<{ device: string; interface: string; ip: string }>;
  devices: ItemDevice[];
  grading: Grading;
  hints?: string[];
  answer_key_raw: string;
  explanation?: string;
  [key: string]: unknown;
}

export interface Session {
  id: string;
  itemId: number;
  devices: Map<string, DeviceState>;
  graded: boolean;
  startedAt: number;
}

const sessions = new Map<string, Session>();

export function buildDevices(item: Item): Map<string, DeviceState> {
  const map = new Map<string, DeviceState>();
  for (const d of item.devices) {
    const dev: DeviceState = {
      name: d.name,
      type: d.type,
      interfaces: [...(d.interfaces ?? [])],
      running: parseConfig(d.preconfig ?? []),
      startup: [],
      modeStack: [],
    };
    if (d.type === 'pc') {
      const row = item.device_table?.find((r) => r.device === d.name);
      const ip = row?.ip ?? '0.0.0.0';
      const gwGuess = ip.replace(/\.\d+$/, '.1');
      dev.pc = { ip, mask: '255.255.255.0', gateway: gwGuess, vlan: row?.interface };
    } else {
      bootDevice(dev);
    }
    map.set(d.name, dev);
  }
  return map;
}

export function createSession(item: Item): Session {
  const s: Session = {
    id: randomUUID(),
    itemId: item.id,
    devices: buildDevices(item),
    graded: false,
    startedAt: Date.now(),
  };
  sessions.set(s.id, s);
  return s;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function resetSession(s: Session, item: Item): void {
  s.devices = buildDevices(item);
  s.graded = false;
  s.startedAt = Date.now();
}

export function execOnDevice(s: Session, deviceName: string, input: string): { output: string; prompt: string } | null {
  // hostname degistirilmis olabilir: once orijinal ada, sonra guncel ada bak
  let dev = s.devices.get(deviceName);
  if (!dev) {
    dev = Array.from(s.devices.values()).find((d) => d.name === deviceName);
  }
  if (!dev) return null;
  return execute(dev, input);
}

export function completeOnDevice(s: Session, deviceName: string, input: string): string | null {
  let dev = s.devices.get(deviceName);
  if (!dev) dev = Array.from(s.devices.values()).find((d) => d.name === deviceName);
  if (!dev) return null;
  return completeInput(dev, input);
}

export function gradeSession(s: Session, item: Item): GradeReport {
  const report = grade(item.grading, s.devices);
  s.graded = true;
  saveProgress(item.id, report);
  return report;
}

export function devicePrompts(s: Session): Array<{ name: string; prompt: string; type: string }> {
  return Array.from(s.devices.entries()).map(([name, d]) => ({
    name,
    prompt: d.type === 'pc' ? `${name}> ` : prompt(d),
    type: d.type,
  }));
}

/* ---------------- progress.json ---------------- */

const PROGRESS_FILE = path.resolve('data/progress.json');

interface Progress {
  items: Record<string, { best: number; max: number; attempts: number; last: string }>;
}

export function loadProgress(): Progress {
  if (!existsSync(PROGRESS_FILE)) return { items: {} };
  try {
    return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8')) as Progress;
  } catch {
    return { items: {} };
  }
}

export function resetProgress(itemId: number): void {
  const p = loadProgress();
  delete p.items[itemId];
  mkdirSync(path.dirname(PROGRESS_FILE), { recursive: true });
  writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

function saveProgress(itemId: number, report: GradeReport): void {
  const p = loadProgress();
  const prev = p.items[itemId];
  p.items[itemId] = {
    best: Math.max(prev?.best ?? 0, report.score),
    max: report.max,
    attempts: (prev?.attempts ?? 0) + 1,
    last: new Date().toISOString(),
  };
  mkdirSync(path.dirname(PROGRESS_FILE), { recursive: true });
  writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

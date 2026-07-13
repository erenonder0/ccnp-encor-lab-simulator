import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { buildDevices, type Item } from './session';
import { execute } from './ios/engine';
import type { DeviceState } from './ios/types';

export function loadAllItems(): Item[] {
  const dir = path.resolve('data/items');
  return readdirSync(dir)
    .filter((f) => /^item-\d+\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf-8')) as Item)
    .sort((a, b) => a.id - b.id);
}

export interface ReplayResult {
  devices: Map<string, DeviceState>;
  /** '%' ile baslayan (hata) uretmis komutlar */
  errors: Array<{ device: string; input: string; output: string }>;
}

/**
 * answer_key_raw transkriptini calistirir.
 * Format: "R1:" satiri cihaz secer; "R1(config)# komut" satirlarinda prompt kirpilir;
 * '---' ayiraclari ve bos satirlar atlanir.
 */
export function replayAnswerKey(item: Item): ReplayResult {
  const devices = buildDevices(item);
  const errors: ReplayResult['errors'] = [];
  let current: string | null = null;

  for (const rawLine of item.answer_key_raw.split('\n')) {
    const line = rawLine.trim();
    if (!line || /^-{3,}/.test(line)) continue;

    const header = line.match(/^([\w-]+):$/);
    if (header && devices.has(header[1])) {
      current = header[1];
      continue;
    }

    // "R1(config-if)# komut" veya "R1> enable" -> promptu kirp
    const m = line.match(/^([\w-]+)(?:\([\w./-]+\))?[>#]\s*(.*)$/);
    let input = line;
    if (m && devices.has(m[1])) {
      current = m[1];
      input = m[2];
    } else if (m && current) {
      input = m[2];
    }
    if (!input.trim()) continue;
    if (!current) throw new Error(`answer_key_raw cihaz belirtmeden komut iceriyor: "${line}"`);

    const dev = devices.get(current)!;
    const res = execute(dev, input);
    if (res.output.includes('% ') || res.output.includes('%I')) {
      errors.push({ device: current, input, output: res.output });
    }
  }
  return { devices, errors };
}

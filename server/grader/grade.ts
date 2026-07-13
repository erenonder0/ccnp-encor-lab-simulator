import type { DeviceState } from '../ios/types';
import { childrenAt, flatten, serialize } from '../ios/configTree';

export interface ReqLine {
  path: string[];
  line: string;
}

export interface Check {
  task: number;
  device: string;
  points: number;
  required?: ReqLine[];
  required_any_of?: ReqLine[][];
  path_alias?: string;
}

export interface Grading {
  require_save?: boolean;
  checks: Check[];
  forbidden?: Array<{ device: string; regex: string }>;
}

export interface LineResult {
  line: string;
  path: string[];
  ok: boolean;
  found?: string;
}

export interface CheckResult {
  task: number;
  device: string;
  points: number;
  earned: number;
  passed: boolean;
  lines: LineResult[];
  aliasUsed?: string;
}

export interface GradeReport {
  score: number;
  max: number;
  tasks: CheckResult[];
  forbidden_violations: Array<{ device: string; line: string; regex: string }>;
  saved: boolean;
  unsaved_devices: string[];
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ');

/** path_alias icin: cihaz config'inden aday degerleri topla */
function aliasCandidates(kind: string, dev: DeviceState): string[] {
  const tops = dev.running.map((n) => n.line);
  switch (kind) {
    case 'exporter_name':
      return tops.filter((l) => l.startsWith('flow exporter ')).map((l) => l.split(' ')[2]);
    case 'monitor_name':
      return tops.filter((l) => l.startsWith('flow monitor ')).map((l) => l.split(' ')[2]);
    case 'record_name':
      return tops.filter((l) => l.startsWith('flow record ')).map((l) => l.split(' ')[2]);
    case 'sla_id':
      return tops.filter((l) => /^ip sla \d+$/.test(l)).map((l) => l.split(' ')[2]);
    case 'acl_name':
      return tops.filter((l) => l.startsWith('ip access-list ')).map((l) => l.split(' ')[3]);
    default:
      return [];
  }
}

/** alias'in required satirlarindaki "altin" degerini bul (degistirilecek token) */
function goldenValue(kind: string, req: ReqLine[]): string | null {
  for (const r of req) {
    for (const p of r.path) {
      let m = p.match(/^flow (?:exporter|monitor|record) (\S+)$/);
      if (m && kind.endsWith('_name')) return m[1];
      m = p.match(/^ip sla (\d+)$/);
      if (m && kind === 'sla_id') return m[1];
      m = p.match(/^ip access-list (?:standard|extended) (\S+)$/);
      if (m && kind === 'acl_name') return m[1];
    }
    if (kind === 'sla_id') {
      const m = r.line.match(/^ip sla schedule (\d+)/);
      if (m) return m[1];
    }
    if (kind === 'monitor_name') {
      const m = r.line.match(/^ip flow monitor (\S+)/);
      if (m) return m[1];
    }
  }
  return null;
}

function substitute(req: ReqLine[], golden: string, candidate: string, kind: string): ReqLine[] {
  const rep = (s: string): string => {
    if (kind === 'sla_id') {
      return s
        .replace(new RegExp(`^ip sla ${golden}$`), `ip sla ${candidate}`)
        .replace(new RegExp(`^ip sla schedule ${golden}(?=\\s|$)`), `ip sla schedule ${candidate}`);
    }
    return s.split(golden).join(candidate);
  };
  return req.map((r) => ({ path: r.path.map(rep), line: rep(r.line) }));
}

function checkLines(dev: DeviceState, req: ReqLine[]): LineResult[] {
  return req.map((r) => {
    const siblings = childrenAt(dev.running, r.path).map((n) => norm(n.line));
    const want = norm(r.line);
    const ok = siblings.includes(want);
    let found: string | undefined;
    if (!ok) {
      const firstTwo = want.split(' ').slice(0, 2).join(' ');
      found = siblings.find((l) => l.startsWith(firstTwo));
      // path yoksa: ayni satiri baska path'te aramayi dene (yanlis yere yazilmis)
      if (!found && r.path.length > 0) {
        const anywhere = flatten(dev.running).map(norm);
        if (anywhere.includes(want)) found = `(dogru satir yanlis blokta: '${r.path.join(' > ')}' altinda degil)`;
      }
    }
    return { line: r.line, path: r.path, ok, found };
  });
}

function tryCheck(dev: DeviceState, check: Check): { passed: boolean; lines: LineResult[]; aliasUsed?: string } {
  const variants: ReqLine[][] = check.required ? [check.required] : (check.required_any_of ?? []);

  let best: { passed: boolean; lines: LineResult[]; aliasUsed?: string } | null = null;

  for (const variant of variants) {
    // 1) once oldugu gibi dene
    const attempts: Array<{ req: ReqLine[]; alias?: string }> = [{ req: variant }];
    // 2) alias adaylariyla dene
    if (check.path_alias) {
      const golden = goldenValue(check.path_alias, variant);
      if (golden) {
        for (const cand of aliasCandidates(check.path_alias, dev)) {
          if (cand !== golden) attempts.push({ req: substitute(variant, golden, cand, check.path_alias), alias: cand });
        }
      }
    }
    for (const at of attempts) {
      const lines = checkLines(dev, at.req);
      const passed = lines.every((l) => l.ok);
      const result = { passed, lines, aliasUsed: at.alias };
      if (passed) return result;
      if (!best || lines.filter((l) => l.ok).length > best.lines.filter((l) => l.ok).length) best = result;
    }
  }
  return best ?? { passed: false, lines: [] };
}

export function grade(grading: Grading, devices: Map<string, DeviceState>): GradeReport {
  const tasks: CheckResult[] = [];

  for (const check of grading.checks) {
    const dev = devices.get(check.device);
    if (!dev) {
      tasks.push({ task: check.task, device: check.device, points: check.points, earned: 0, passed: false, lines: [] });
      continue;
    }
    const { passed, lines, aliasUsed } = tryCheck(dev, check);
    // kismi puan: satir basina orantili, gecmediyse asagi yuvarla
    const okCount = lines.filter((l) => l.ok).length;
    const earned = passed ? check.points : lines.length ? Math.floor((check.points * okCount) / lines.length) : 0;
    tasks.push({ task: check.task, device: check.device, points: check.points, earned, passed, lines, aliasUsed });
  }

  const violations: GradeReport['forbidden_violations'] = [];
  for (const f of grading.forbidden ?? []) {
    const re = new RegExp(f.regex);
    for (const [name, dev] of devices) {
      if (dev.type === 'pc') continue;
      if (f.device !== '*' && f.device !== name) continue;
      for (const line of flatten(dev.running)) {
        if (re.test(line.trim())) violations.push({ device: name, line: line.trim(), regex: f.regex });
      }
    }
  }

  const unsaved: string[] = [];
  if (grading.require_save) {
    for (const [name, dev] of devices) {
      if (dev.type === 'pc') continue;
      if (serialize(dev.running) !== serialize(dev.startup)) unsaved.push(name);
    }
  }

  return {
    score: tasks.reduce((a, t) => a + t.earned, 0),
    max: tasks.reduce((a, t) => a + t.points, 0),
    tasks,
    forbidden_violations: violations,
    saved: unsaved.length === 0,
    unsaved_devices: unsaved,
  };
}

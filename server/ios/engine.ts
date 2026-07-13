import type { DeviceState, ExecResult, ModeFrame } from './types';
import { GRAMMARS, MODE_PROMPTS, type Ctx, type Spec } from './grammar';
import { matchPattern, parsePattern, type MatchOk } from './match';
import { addLine, childrenAt, cloneTree, ensurePath, findNode, removeByPrefix, replaceKeyFor } from './configTree';
import { runShow } from './show';
import { execPc } from './pc';

export function prompt(dev: DeviceState): string {
  if (dev.type === 'pc') return `${dev.name}> `;
  const frame = dev.modeStack[dev.modeStack.length - 1];
  return dev.name + frame.prompt;
}

export function makeFrame(id: string, paths: string[][] = [[]]): ModeFrame {
  return { id, prompt: MODE_PROMPTS[id], paths };
}

/** Cihazi baslat: preconfig -> running + startup, mod exec */
export function bootDevice(dev: DeviceState): void {
  dev.modeStack = [makeFrame('exec')];
  // tum fiziksel interface bloklarinin gorunmesi icin bos bloklar ac
  for (const ifname of dev.interfaces) ensurePath(dev.running, [`interface ${ifname}`]);
  if (!findNode(dev.running, [`hostname ${dev.name}`])) {
    if (!dev.running.some((n) => n.line.startsWith('hostname '))) {
      dev.running.unshift({ line: `hostname ${dev.name}`, children: [] });
    }
  }
  dev.startup = cloneTree(dev.running);
}

class EngineCtx implements Ctx {
  out: string[] = [];
  isNo = false;
  constructor(private dev: DeviceState) {}

  get deviceType(): 'ios-router' | 'ios-switch' {
    return this.dev.type as 'ios-router' | 'ios-switch';
  }
  private get frame(): ModeFrame {
    return this.dev.modeStack[this.dev.modeStack.length - 1];
  }

  print(text: string): void {
    this.out.push(text);
  }

  hasInterface(name: string): boolean {
    return this.dev.interfaces.includes(name);
  }
  registerInterface(name: string): void {
    if (!this.dev.interfaces.includes(name)) this.dev.interfaces.push(name);
    ensurePath(this.dev.running, [`interface ${name}`]);
  }

  setHostname(name: string): void {
    this.dev.name = name;
  }

  addLine(line: string): void {
    for (const path of this.frame.paths) this.applyLine(path, line);
  }
  addGlobal(line: string): void {
    this.applyLine([], line);
  }

  private applyLine(path: string[], line: string): void {
    if (this.isNo) {
      // once anahtar bazli, sonra prefix bazli sil
      const key = replaceKeyFor(line);
      const siblings = childrenAt(this.dev.running, path);
      let removed = false;
      if (key) {
        for (let i = siblings.length - 1; i >= 0; i--) {
          if (replaceKeyFor(siblings[i].line) === key) {
            siblings.splice(i, 1);
            removed = true;
          }
        }
      }
      if (!removed) removeByPrefix(this.dev.running, path, line.split(' '));
      return;
    }
    // SPAN kaynak birlestirme: ayni session+yon -> listeyi birlestir
    const span = line.match(/^monitor session (\d+) source interface (\S+) (both|rx|tx)$/);
    if (span && path.length === 0) {
      const key = `monitor session ${span[1]} source interface ${span[3]}`;
      const existing = this.dev.running.find((n) => replaceKeyFor(n.line) === key);
      if (existing) {
        const prev = existing.line.match(/source interface (\S+) /)![1].split(',');
        const merged = Array.from(new Set([...prev, ...span[2].split(',')])).sort();
        existing.line = `monitor session ${span[1]} source interface ${merged.join(',')} ${span[3]}`;
        return;
      }
    }
    addLine(this.dev.running, path, line, replaceKeyFor(line) ?? undefined);
  }

  enterMode(id: string, paths: string[][]): void {
    if (this.isNo) {
      // "no interface Loopback0", "no ip sla 10" gibi: bloklari sil
      for (const path of paths) {
        const parent = path.slice(0, -1);
        removeByPrefix(this.dev.running, parent, path[path.length - 1].split(' '));
      }
      return;
    }
    for (const path of paths) ensurePath(this.dev.running, path);
    // yeni frame path'leri: mevcut config path'ine gorecelidir (config modunda base bos)
    const base = this.frame.id === 'config' ? [] : this.frame.paths[0];
    const abs = paths.map((p) => (p.length && p[0].startsWith('interface ') ? p : [...basePrefix(base, p), ...p]));
    this.dev.modeStack.push({ id, prompt: MODE_PROMPTS[id], paths: abs });

    function basePrefix(b: string[], p: string[]): string[] {
      // address-family, af-interface gibi ic moda girerken ust path korunur
      if (p.length && (p[0].startsWith('address-family') || p[0].startsWith('af-interface') || p[0].startsWith('topology') || p[0].startsWith('key ') || p[0].startsWith('class '))) {
        return b;
      }
      return [];
    }
  }

  morphMode(id: string): void {
    if (this.isNo) return;
    const f = this.frame;
    this.dev.modeStack[this.dev.modeStack.length - 1] = { id, prompt: MODE_PROMPTS[id], paths: f.paths };
  }

  exitMode(): void {
    const f = this.frame;
    if (f.id === 'exec') return;
    if (f.id === 'priv') {
      this.dev.modeStack.pop();
      return;
    }
    if (f.id === 'config') {
      this.dev.modeStack.pop();
      return;
    }
    // ip sla op modlari config'e doner (IOS davranisi)
    if (f.id.startsWith('config-ip-sla-')) {
      while (this.frame.id !== 'config') this.dev.modeStack.pop();
      return;
    }
    this.dev.modeStack.pop();
  }

  endConfig(): void {
    while (this.frame.id !== 'priv' && this.frame.id !== 'exec') this.dev.modeStack.pop();
  }

  toExec(): void {
    this.dev.modeStack = [makeFrame('exec')];
  }
  toPriv(): void {
    if (this.frame.id === 'exec') this.dev.modeStack.push(makeFrame('priv'));
  }

  save(): void {
    this.dev.startup = cloneTree(this.dev.running);
  }

  runShow(rest: string): void {
    this.print(runShow(this.dev, rest));
  }

  ping(target: string): void {
    this.print(
      `Type escape sequence to abort.\nSending 5, 100-byte ICMP Echos to ${target}, timeout is 2 seconds:\n!!!!!\nSuccess rate is 100 percent (5/5), round-trip min/avg/max = 1/1/2 ms`,
    );
  }
}

/** hata ciktisi: isaretci + mesaj (isaretci, prompt + girdide hatali tokenin altina gelir) */
function invalidOutput(promptStr: string, raw: string, tokenIndex: number): string {
  const offsets: number[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) offsets.push(m.index);
  const col = promptStr.length + (offsets[Math.min(tokenIndex, offsets.length - 1)] ?? raw.length);
  return ' '.repeat(col) + '^\n% Invalid input detected at \'^\' marker.\n';
}

function dispatch(ctx: EngineCtx, specs: Spec[], tokens: string[], raw: string, promptStr: string): void {
  type Cand = { spec: Spec; res: MatchOk };
  const full: Cand[] = [];
  const incomplete: Array<{ spec: Spec; firstLiteral?: string }> = [];
  let maxFail = -1;

  for (const spec of specs) {
    const res = matchPattern(spec.pattern, tokens);
    if (res.ok) full.push({ spec, res });
    else if (res.kind === 'incomplete') incomplete.push({ spec, firstLiteral: res.firstLiteral });
    else maxFail = Math.max(maxFail, res.failIndex);
  }

  if (full.length > 0) {
    // birden fazla tam eslesme: ilk token literal acilimlari farkliysa belirsiz.
    // IOS kurali: girilen token bir kelimeye TAM esitse, o kelime on-ek acilimlarina yeg tutulur
    // (or. 'ip' hem 'ip' hem 'ipv6'ya on-ek olur ama tam eslesen 'ip' kazanir).
    let pool = full;
    if (pool.length > 1) {
      const t0 = tokens[0].toLowerCase();
      const exact = pool.filter((f) => f.res.words[0].toLowerCase() === t0);
      if (exact.length > 0) pool = exact;
      const firsts = new Set(pool.map((f) => f.res.words[0]));
      if (firsts.size > 1) {
        ctx.print(`% Ambiguous command:  "${raw}"`);
        return;
      }
      full.length = 0;
      full.push(...pool);
    }
    // en cok literal iceren (en spesifik) kalibi sec
    const best = full.sort(
      (a, b) => parsePattern(b.spec.pattern).filter((t) => t.kind === 'lit').length - parsePattern(a.spec.pattern).filter((t) => t.kind === 'lit').length,
    )[0];
    best.spec.run(ctx, best.res.captures, best.res.words);
    return;
  }

  if (incomplete.length > 0) {
    const firsts = new Set(incomplete.map((i) => i.firstLiteral ?? '?'));
    if (incomplete.length > 1 && firsts.size > 1 && tokens.length === 1) {
      ctx.print(`% Ambiguous command:  "${raw}"`);
    } else {
      ctx.print('% Incomplete command.\n');
    }
    return;
  }

  ctx.print(invalidOutput(promptStr, raw, Math.max(maxFail, 0)));
}

/** '?' yardim ciktisi */
function helpOutput(specs: Spec[], tokens: string[]): string {
  const suggestions = new Map<string, string>();
  for (const spec of specs) {
    const pats = parsePattern(spec.pattern);
    // tokens'i kaliba yuru; kalan ilk kalip tokenini oner
    let ti = 0;
    let pi = 0;
    let okSoFar = true;
    while (ti < tokens.length && pi < pats.length) {
      const res = matchPattern(
        pats
          .slice(0, pi + 1)
          .map(patToStr)
          .join(' '),
        tokens.slice(0, ti + 1),
      );
      if (res.ok || res.kind === 'incomplete') {
        ti++;
        pi++;
      } else {
        okSoFar = false;
        break;
      }
    }
    if (!okSoFar || pi >= pats.length) {
      if (okSoFar && pi >= pats.length && ti >= tokens.length) suggestions.set('<cr>', '');
      continue;
    }
    const next = pats[pi];
    const label =
      next.kind === 'lit'
        ? next.value!
        : next.kind === 'choice'
          ? next.options!.join('|')
          : `<${next.kind}>`;
    suggestions.set(label, spec.help ?? '');
    if (next.optional) suggestions.set('<cr>', '');
  }
  if (suggestions.size === 0) return '% Unrecognized command';
  return Array.from(suggestions.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => (v ? `  ${k.padEnd(22)}${v}` : `  ${k}`))
    .join('\n');

  function patToStr(p: ReturnType<typeof parsePattern>[number]): string {
    if (p.kind === 'lit') return p.value!;
    if (p.kind === 'choice') return (p.optional ? '[' : '(') + p.options!.join('|') + (p.optional ? ']' : ')');
    return `<${p.kind}${p.optional ? '?' : ''}>`;
  }
}

export function execute(dev: DeviceState, rawInput: string): ExecResult {
  if (dev.type === 'pc') return execPc(dev, rawInput);

  const promptBefore = prompt(dev);
  const ctx = new EngineCtx(dev);
  let raw = rawInput.replace(/\r/g, '');

  // Ctrl+Z
  if (raw.includes('\x1a')) {
    ctx.endConfig();
    return { output: '', prompt: prompt(dev) };
  }

  raw = raw.trim();
  if (!raw) return { output: '', prompt: prompt(dev) };

  // '?' yardimi
  if (raw.endsWith('?')) {
    const before = raw.slice(0, -1).trim();
    const frame = dev.modeStack[dev.modeStack.length - 1];
    let specs = GRAMMARS[frame.id] ?? [];
    let tokens = before ? before.split(/\s+/) : [];
    if (frame.id !== 'exec' && frame.id !== 'priv' && tokens[0]?.toLowerCase() === 'do') {
      specs = GRAMMARS['priv'];
      tokens = tokens.slice(1);
    }
    if (frame.id !== 'exec' && frame.id !== 'priv' && tokens[0]?.toLowerCase() === 'no') tokens = tokens.slice(1);
    return { output: helpOutput(specs, tokens), prompt: prompt(dev) };
  }

  const frame = dev.modeStack[dev.modeStack.length - 1];
  let tokens = raw.split(/\s+/);
  const inConfig = frame.id !== 'exec' && frame.id !== 'priv';

  // evrensel komutlar
  const t0 = tokens[0].toLowerCase();
  if (inConfig && 'end'.startsWith(t0) && t0.length >= 2 && tokens.length === 1 && 'end'.startsWith(tokens[0].toLowerCase())) {
    ctx.endConfig();
    return { output: '', prompt: prompt(dev) };
  }
  if ('exit'.startsWith(t0) && tokens.length === 1 && t0.length >= 2 && frame.id !== 'exec' && frame.id !== 'priv') {
    ctx.exitMode();
    return { output: '', prompt: prompt(dev) };
  }

  let specs = GRAMMARS[frame.id] ?? [];

  if (inConfig && 'do'.startsWith(t0) && tokens.length > 1 && t0 === 'do') {
    specs = GRAMMARS['priv'];
    tokens = tokens.slice(1);
    dispatch(ctx, specs.filter((sp) => !sp.pattern.startsWith('configure')), tokens, raw, promptBefore);
    return { output: ctx.out.join('\n'), prompt: prompt(dev) };
  }

  if (inConfig && t0 === 'no' && tokens.length > 1) {
    ctx.isNo = true;
    dispatch(ctx, specs, tokens.slice(1), raw, promptBefore);
    ctx.isNo = false;
    return { output: ctx.out.join('\n'), prompt: prompt(dev) };
  }

  // config alt modlarinda global config komutlarina otomatik gecis
  // (IOS: alt moddayken global komut yazilirsa mod degisir)
  if (inConfig && frame.id !== 'config') {
    const own = dispatchTry(specs, tokens);
    if (!own) {
      const global = dispatchTry(GRAMMARS['config'], tokens);
      if (global) {
        // ust moda cik, global grameriyle calistir
        while (dev.modeStack[dev.modeStack.length - 1].id !== 'config') dev.modeStack.pop();
        dispatch(ctx, GRAMMARS['config'], tokens, raw, promptBefore);
        return { output: ctx.out.join('\n'), prompt: prompt(dev) };
      }
    }
  }

  dispatch(ctx, specs, tokens, raw, promptBefore);
  return { output: ctx.out.join('\n'), prompt: prompt(dev) };
}

function dispatchTry(specs: Spec[], tokens: string[]): boolean {
  return specs.some((sp) => matchPattern(sp.pattern, tokens).ok);
}

/**
 * Tab tamamlama: son (yarim) tokeni, aktif modun dilbilgisine gore tamamlar.
 * Tek aday -> tam kelime + bosluk; birden fazla -> en uzun ortak on ek; aday yok -> girdi aynen doner.
 */
export function completeInput(dev: DeviceState, input: string): string {
  if (dev.type === 'pc') return input;
  if (!input.trim() || /\s$/.test(input)) return input;

  const frame = dev.modeStack[dev.modeStack.length - 1];
  const inConfig = frame.id !== 'exec' && frame.id !== 'priv';
  let specs = GRAMMARS[frame.id] ?? [];
  let toks = input.trim().split(/\s+/);
  const prefixWords: string[] = [];

  if (inConfig && toks.length > 1 && toks[0].toLowerCase() === 'do') {
    prefixWords.push(toks[0]);
    specs = GRAMMARS['priv'];
    toks = toks.slice(1);
  } else if (inConfig && toks.length > 1 && toks[0].toLowerCase() === 'no') {
    prefixWords.push(toks[0]);
    toks = toks.slice(1);
  }

  const candidates = collectCandidates(specs, toks);
  if (candidates.size === 0 && inConfig && frame.id !== 'config') {
    for (const c of collectCandidates(GRAMMARS['config'], toks)) candidates.add(c);
  }
  // universal komutlar
  const last = toks[toks.length - 1].toLowerCase();
  if (toks.length === 1) {
    for (const u of inConfig ? ['end', 'exit', 'do', 'no'] : []) if (u.startsWith(last)) candidates.add(u);
  }

  const matches = Array.from(candidates).filter((w) => w.startsWith(last) && w !== last);
  if (matches.length === 0) return input;

  let lcp = matches[0];
  for (const m of matches) {
    let i = 0;
    while (i < lcp.length && i < m.length && lcp[i] === m[i]) i++;
    lcp = lcp.slice(0, i);
  }
  const completed = matches.length === 1 ? matches[0] + ' ' : lcp;
  if (completed.trimEnd().length <= last.length) return input;
  return [...prefixWords, ...toks.slice(0, -1), completed].join(' ');
}

function collectCandidates(specs: Spec[], toks: string[]): Set<string> {
  const out = new Set<string>();
  const prefix = toks.slice(0, -1);
  const last = toks[toks.length - 1].toLowerCase();
  for (const spec of specs) {
    const pats = parsePattern(spec.pattern);
    const words: string[] = [];
    for (const p of pats) {
      if (p.kind === 'lit') words.push(p.value!);
      else if (p.kind === 'choice') words.push(...p.options!);
    }
    for (const w of words) {
      if (!w.startsWith(last)) continue;
      const res = matchPattern(spec.pattern, [...prefix, w]);
      if (res.ok || res.kind === 'incomplete') out.add(w);
    }
  }
  return out;
}

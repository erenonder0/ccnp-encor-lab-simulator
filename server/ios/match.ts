import { canonInterface } from './ifnames';

/**
 * Komut kalibi eslestirici. Kalip token turleri:
 *   literal        kucuk harf sabit kelime; girdi, kelimenin ons eki olabilir (IOS kisaltmasi)
 *   <word>         herhangi tek token
 *   <num>          sayi
 *   <ip>           IPv4
 *   <iface>        interface adi (canonicalize edilir)
 *   <iflist>       1+ token interface listesi ("e0/1,e0/2" veya "e0/1 - 2"); yon kelimesinden once durur
 *   <rest>         kalan her sey (1+ token)
 *   (a|b|c)        zorunlu secim;  [a|b|c]  istege bagli secim
 * Kalip sonundaki [ ... ] gruplari istege baglidir.
 */

export interface MatchOk {
  ok: true;
  /** canonical kelimeler: literaller tam acilmis, placeholder degerleri canonical */
  words: string[];
  /** yalnizca placeholder/secim degerleri, sirayla */
  captures: string[];
}

export interface MatchFail {
  ok: false;
  kind: 'fail' | 'incomplete';
  /** ilk uyusmayan girdi token indeksi (fail icin) */
  failIndex: number;
  /** eslesen ilk literal kelime (ambiguity tespiti icin) */
  firstLiteral?: string;
}

export type MatchResult = MatchOk | MatchFail;

const DIR_WORDS = ['both', 'rx', 'tx'];

interface PatTok {
  kind: 'lit' | 'word' | 'num' | 'ip' | 'iface' | 'iflist' | 'rest' | 'choice';
  value?: string; // literal kelime
  options?: string[]; // choice
  optional: boolean;
}

const patCache = new Map<string, PatTok[]>();

export function parsePattern(pattern: string): PatTok[] {
  const hit = patCache.get(pattern);
  if (hit) return hit;
  const toks: PatTok[] = [];
  for (const t of pattern.split(/\s+/)) {
    if (!t) continue;
    if (t.startsWith('[') && t.endsWith(']')) {
      toks.push({ kind: 'choice', options: t.slice(1, -1).split('|'), optional: true });
    } else if (t.startsWith('(') && t.endsWith(')')) {
      toks.push({ kind: 'choice', options: t.slice(1, -1).split('|'), optional: false });
    } else if (t.startsWith('<')) {
      const optional = t.endsWith('?>');
      const name = t.replace(/[<>?]/g, '');
      toks.push({ kind: name as PatTok['kind'], optional });
    } else {
      toks.push({ kind: 'lit', value: t, optional: false });
    }
  }
  patCache.set(pattern, toks);
  return toks;
}

const IP_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/** "e0/1 - 3" gibi araliklari da acan interface listesi cozumleyici */
export function expandIfaceTokens(tokens: string[]): string[] | null {
  // once tokenlari birlestir: "e0/1", ",", "e0/2" veya "e0/1,e0/2" veya "e0/1 - 2"
  const joined = tokens.join(' ').replace(/\s*,\s*/g, ',');
  const parts = joined.split(',').filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const range = part.match(/^(.+?)\s*-\s*(\d+)$/);
    if (range) {
      const base = canonInterface(range[1].trim());
      if (!base) return null;
      const m = base.match(/^(.*\/)(\d+)$/);
      if (!m) return null;
      const start = Number(m[2]);
      const end = Number(range[2]);
      if (end < start || end - start > 48) return null;
      for (let i = start; i <= end; i++) out.push(m[1] + i);
    } else {
      const c = canonInterface(part.trim());
      if (!c) return null;
      out.push(c);
    }
  }
  return out;
}

export function matchPattern(pattern: string, tokens: string[]): MatchResult {
  const pats = parsePattern(pattern);
  const words: string[] = [];
  const captures: string[] = [];
  let ti = 0;
  let firstLiteral: string | undefined;

  for (let pi = 0; pi < pats.length; pi++) {
    const p = pats[pi];
    const tok = tokens[ti];

    if (tok === undefined) {
      // girdi bitti; kalan kaliplar opsiyonel mi?
      const restRequired = pats.slice(pi).some((x) => !x.optional);
      if (!restRequired) return { ok: true, words, captures };
      return { ok: false, kind: 'incomplete', failIndex: ti, firstLiteral };
    }

    switch (p.kind) {
      case 'lit': {
        if (p.value!.startsWith(tok.toLowerCase()) && tok.length <= p.value!.length) {
          words.push(p.value!);
          if (!firstLiteral) firstLiteral = p.value!;
          ti++;
        } else if (p.optional) {
          continue;
        } else {
          return { ok: false, kind: 'fail', failIndex: ti, firstLiteral };
        }
        break;
      }
      case 'choice': {
        const cand = p.options!.filter((o) => o.startsWith(tok.toLowerCase()));
        if (cand.length === 1) {
          words.push(cand[0]);
          captures.push(cand[0]);
          ti++;
        } else if (cand.length > 1) {
          // secim ici belirsizlik
          return { ok: false, kind: 'fail', failIndex: ti, firstLiteral };
        } else if (p.optional) {
          continue;
        } else {
          return { ok: false, kind: 'fail', failIndex: ti, firstLiteral };
        }
        break;
      }
      case 'word': {
        words.push(tok);
        captures.push(tok);
        ti++;
        break;
      }
      case 'num': {
        if (!/^\d+$/.test(tok)) {
          if (p.optional) continue;
          return { ok: false, kind: 'fail', failIndex: ti, firstLiteral };
        }
        words.push(tok);
        captures.push(tok);
        ti++;
        break;
      }
      case 'ip': {
        if (!IP_RE.test(tok)) {
          if (p.optional) continue;
          return { ok: false, kind: 'fail', failIndex: ti, firstLiteral };
        }
        words.push(tok);
        captures.push(tok);
        ti++;
        break;
      }
      case 'iface': {
        // "eth 0/1" gibi iki token da olabilir
        let c = canonInterface(tok);
        let used = 1;
        if (!c && tokens[ti + 1] && /^[\d/.]+$/.test(tokens[ti + 1])) {
          c = canonInterface(tok + tokens[ti + 1]);
          used = 2;
        }
        if (!c) {
          if (p.optional) continue;
          return { ok: false, kind: 'fail', failIndex: ti, firstLiteral };
        }
        words.push(c);
        captures.push(c);
        ti += used;
        break;
      }
      case 'iflist': {
        // yon kelimesine veya girdi sonuna kadar tuket
        const chunk: string[] = [];
        while (ti < tokens.length && !DIR_WORDS.some((d) => d.startsWith(tokens[ti].toLowerCase()) && tokens[ti].length <= d.length && chunk.length > 0)) {
          chunk.push(tokens[ti]);
          ti++;
          // sonraki kalip token'i yon secimi degilse tum kalan girdiyi almasin:
          // iflist yalnizca virgul/tire/interface benzeri tokenlari tuketir
          const next = tokens[ti];
          if (next && !/^[\w/,.-]+$/.test(next)) break;
        }
        const list = expandIfaceTokens(chunk);
        if (!list || list.length === 0) return { ok: false, kind: 'fail', failIndex: ti - chunk.length, firstLiteral };
        const joinedList = list.join(',');
        words.push(joinedList);
        captures.push(joinedList);
        break;
      }
      case 'rest': {
        const rest = tokens.slice(ti).join(' ');
        words.push(rest);
        captures.push(rest);
        ti = tokens.length;
        break;
      }
    }
  }

  if (ti < tokens.length) return { ok: false, kind: 'fail', failIndex: ti, firstLiteral };
  return { ok: true, words, captures };
}

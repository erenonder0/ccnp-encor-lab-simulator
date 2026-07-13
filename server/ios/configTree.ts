import type { ConfigNode } from './types';

/** path'teki dugumu bul (yoksa null) */
export function findNode(tree: ConfigNode[], path: string[]): ConfigNode | null {
  let nodes = tree;
  let node: ConfigNode | null = null;
  for (const line of path) {
    node = nodes.find((n) => n.line === line) ?? null;
    if (!node) return null;
    nodes = node.children;
  }
  return node;
}

export function childrenAt(tree: ConfigNode[], path: string[]): ConfigNode[] {
  if (path.length === 0) return tree;
  return findNode(tree, path)?.children ?? [];
}

/** path'i (gerekirse olusturarak) getir, son dugumun children'ini dondur */
export function ensurePath(tree: ConfigNode[], path: string[]): ConfigNode[] {
  let nodes = tree;
  for (const line of path) {
    let node = nodes.find((n) => n.line === line);
    if (!node) {
      node = { line, children: [] };
      nodes.push(node);
    }
    nodes = node.children;
  }
  return nodes;
}

/**
 * Satir ekle. replaceKey verilirse ayni key'e sahip eski satir degistirilir
 * (or. 'ip address', 'frequency'); verilmezse birebir ayni satir tekrarlanmaz.
 */
export function addLine(tree: ConfigNode[], path: string[], line: string, replaceKey?: string): void {
  const siblings = ensurePath(tree, path);
  if (replaceKey) {
    const idx = siblings.findIndex((n) => keyOf(n.line) === replaceKey);
    if (idx >= 0) {
      siblings[idx] = { line, children: siblings[idx].children };
      return;
    }
  }
  if (!siblings.some((n) => n.line === line)) siblings.push({ line, children: [] });

  function keyOf(l: string): string {
    return replaceKeyFor(l) ?? l;
  }
}

/** Bir satirin "degistirme anahtari": ayni anahtarli yeni satir eskisini ezer */
export function replaceKeyFor(line: string): string | null {
  const rules: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
    [/^hostname /, () => 'hostname'],
    [/^ip address /, () => 'ip address'],
    [/^description /, () => 'description'],
    [/^destination /, () => 'destination'],
    [/^transport /, () => 'transport'],
    [/^source /, () => 'source'],
    [/^record /, () => 'record'],
    [/^frequency /, () => 'frequency'],
    [/^timeout /, () => 'timeout'],
    [/^threshold /, () => 'threshold'],
    [/^(icmp-echo|http get|http raw|tcp-connect|udp-jitter|udp-echo) /, () => '__sla-op'],
    [/^ip sla schedule (\d+)/, (m) => `ip sla schedule ${m[1]}`],
    [/^monitor session (\d+) destination /, (m) => `monitor session ${m[1]} destination`],
    [/^monitor session (\d+) source interface .* (both|rx|tx)$/, (m) => `monitor session ${m[1]} source interface ${m[2]}`],
    [/^monitor session (\d+) source vlan .* (both|rx|tx)$/, (m) => `monitor session ${m[1]} source vlan ${m[2]}`],
    [/^switchport mode /, () => 'switchport mode'],
    [/^switchport access vlan /, () => 'switchport access vlan'],
    [/^switchport trunk encapsulation /, () => 'switchport trunk encapsulation'],
    [/^switchport trunk native vlan /, () => 'switchport trunk native vlan'],
    [/^channel-group /, () => 'channel-group'],
    [/^bandwidth /, () => 'bandwidth'],
    [/^delay /, () => 'delay'],
    [/^duplex /, () => 'duplex'],
    [/^speed /, () => 'speed'],
    [/^vrf forwarding /, () => 'vrf forwarding'],
    [/^encapsulation /, () => 'encapsulation'],
    [/^standby (\d+) ip /, (m) => `standby ${m[1]} ip`],
    [/^standby (\d+) priority /, (m) => `standby ${m[1]} priority`],
    [/^standby version /, () => 'standby version'],
    [/^router-id /, () => 'router-id'],
    [/^eigrp router-id /, () => 'eigrp router-id'],
    [/^auto-cost /, () => 'auto-cost'],
    [/^ntp source /, () => 'ntp source'],
    [/^ntp master/, () => 'ntp master'],
    [/^logging trap /, () => 'logging trap'],
    [/^logging buffered /, () => 'logging buffered'],
    [/^ip domain[- ]name /, () => 'ip domain-name'],
    [/^ip ssh version /, () => 'ip ssh version'],
    [/^ip ospf (\d+) area /, () => 'ip ospf area'],
    [/^rd /, () => 'rd'],
    [/^key-string /, () => 'key-string'],
    [/^ip mtu /, () => 'ip mtu'],
    [/^ip tcp adjust-mss /, () => 'ip tcp adjust-mss'],
    [/^tunnel source /, () => 'tunnel source'],
    [/^tunnel destination /, () => 'tunnel destination'],
    [/^tunnel mode /, () => 'tunnel mode'],
    [/^exec-timeout /, () => 'exec-timeout'],
    [/^login\b/, () => 'login'],
    [/^password /, () => 'password'],
  ];
  for (const [re, fn] of rules) {
    const m = line.match(re);
    if (m) return fn(m);
  }
  return null;
}

/** 'no X' -> X ile baslayan satiri/blogu sil. true: bir sey silindi */
export function removeByPrefix(tree: ConfigNode[], path: string[], tokens: string[]): boolean {
  const siblings = path.length === 0 ? tree : (findNode(tree, path)?.children ?? []);
  const before = siblings.length;
  const matches = (l: string) => {
    const lt = l.split(/\s+/);
    if (tokens.length > lt.length) return false;
    return tokens.every((t, i) => lt[i].toLowerCase() === t.toLowerCase());
  };
  for (let i = siblings.length - 1; i >= 0; i--) {
    if (matches(siblings[i].line)) siblings.splice(i, 1);
  }
  return siblings.length !== before;
}

export function serialize(tree: ConfigNode[], indent = 0): string {
  const pad = ' '.repeat(indent);
  const out: string[] = [];
  for (const n of tree) {
    out.push(pad + n.line);
    if (n.children.length) out.push(serialize(n.children, indent + 1));
  }
  return out.join('\n');
}

/** "show running-config" tam cikti (basliklar + ! ayiraclari + end) */
export function serializeFull(tree: ConfigNode[]): string {
  const body: string[] = [];
  for (const n of tree) {
    body.push(n.line);
    if (n.children.length) body.push(serialize(n.children, 1));
    body.push('!');
  }
  const text = ['!', `! Last configuration change`, '!', `version 15.4`, '!', ...body, 'end'].join('\n');
  return `Building configuration...\n\nCurrent configuration : ${text.length} bytes\n${text}`;
}

/** Girintili duz metin config'i agaca cevir (preconfig yukleme) */
export function parseConfig(lines: string[]): ConfigNode[] {
  const tree: ConfigNode[] = [];
  const stack: Array<{ indent: number; children: ConfigNode[] }> = [{ indent: -1, children: tree }];
  for (const raw of lines) {
    if (!raw.trim() || raw.trim() === '!') continue;
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const node: ConfigNode = { line, children: [] };
    stack[stack.length - 1].children.push(node);
    stack.push({ indent, children: node.children });
  }
  return tree;
}

export function cloneTree(tree: ConfigNode[]): ConfigNode[] {
  return tree.map((n) => ({ line: n.line, children: cloneTree(n.children) }));
}

/** Tum satirlari (girintisiz, derinlik sirali) duz liste olarak ver */
export function flatten(tree: ConfigNode[]): string[] {
  const out: string[] = [];
  const walk = (nodes: ConfigNode[]) => {
    for (const n of nodes) {
      out.push(n.line);
      walk(n.children);
    }
  };
  walk(tree);
  return out;
}

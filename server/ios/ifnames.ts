/** Interface adi normalizasyonu: e0/1, eth0/1, Ethernet 0/1 -> Ethernet0/1 */

const TYPES: Array<[string, string]> = [
  ['tengigabitethernet', 'TenGigabitEthernet'],
  ['gigabitethernet', 'GigabitEthernet'],
  ['fastethernet', 'FastEthernet'],
  ['ethernet', 'Ethernet'],
  ['port-channel', 'Port-channel'],
  ['loopback', 'Loopback'],
  ['serial', 'Serial'],
  ['tunnel', 'Tunnel'],
  ['vlan', 'Vlan'],
];

/** "e0/1" | "eth 0/1" -> "Ethernet0/1"; null if not an interface name */
export function canonInterface(raw: string): string | null {
  const m = raw.trim().match(/^([a-zA-Z-]+)\s*([\d/.]+)$/);
  if (!m) return null;
  const prefix = m[1].toLowerCase();
  const num = m[2];
  const matches = TYPES.filter(([full]) => full.startsWith(prefix));
  if (matches.length === 0) return null;
  // 'e' -> ethernet kazanir (IOS'ta 'e' Ethernet'e cozunur); ilk en spesifik olani sec
  const best =
    matches.find(([full]) => full === prefix) ??
    matches.sort((a, b) => TYPES.indexOf(a) - TYPES.indexOf(b))[matches.length - 1];
  // 'e' hem ethernet ailelerine uyar; tercih sirasi: tam ad > 'ethernet'
  if (prefix.length === 1 && prefix === 'e') return 'Ethernet' + num;
  if (prefix.length === 1 && prefix === 'g') return 'GigabitEthernet' + num;
  if (prefix.length === 1 && prefix === 'f') return 'FastEthernet' + num;
  if (prefix.length === 1 && prefix === 'l') return 'Loopback' + num;
  if (prefix.length === 1 && prefix === 's') return 'Serial' + num;
  if (prefix.length === 1 && prefix === 'v') return 'Vlan' + num;
  if (prefix.length === 1 && prefix === 't') return 'Tunnel' + num;
  return best[1] + num;
}

/** "e0/1,e0/2" veya "e0/1 , e0/3" -> canonical sirali liste; null: bozuk */
export function canonInterfaceList(raw: string): string[] | null {
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const c = canonInterface(p);
    if (!c) return null;
    out.push(c);
  }
  return out.sort(naturalIfaceSort);
}

export function naturalIfaceSort(a: string, b: string): number {
  const pa = a.match(/^([A-Za-z-]+)([\d/.]+)$/);
  const pb = b.match(/^([A-Za-z-]+)([\d/.]+)$/);
  if (!pa || !pb) return a.localeCompare(b);
  if (pa[1] !== pb[1]) return pa[1].localeCompare(pb[1]);
  const na = pa[2].split(/[/.]/).map(Number);
  const nb = pb[2].split(/[/.]/).map(Number);
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const d = (na[i] ?? -1) - (nb[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}

/** IOS kisa gosterimi: Ethernet0/1 -> Et0/1 (show monitor vb. icin) */
export function shortInterface(canon: string): string {
  const m = canon.match(/^([A-Za-z-]+)([\d/.]+)$/);
  if (!m) return canon;
  const map: Record<string, string> = {
    Ethernet: 'Et',
    FastEthernet: 'Fa',
    GigabitEthernet: 'Gi',
    TenGigabitEthernet: 'Te',
    'Port-channel': 'Po',
    Loopback: 'Lo',
    Serial: 'Se',
    Vlan: 'Vl',
    Tunnel: 'Tu',
  };
  return (map[m[1]] ?? m[1]) + m[2];
}

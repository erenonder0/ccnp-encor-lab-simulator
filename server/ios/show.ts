import type { DeviceState } from './types';
import { serializeFull } from './configTree';
import { shortInterface } from './ifnames';

/** show <rest> — pipe destekli */
export function runShow(dev: DeviceState, rest: string): string {
  const [cmdPart, ...pipes] = rest.split('|').map((p) => p.trim());
  let out = showDispatch(dev, cmdPart);
  for (const pipe of pipes) out = applyPipe(out, pipe);
  return out;
}

function applyPipe(text: string, pipe: string): string {
  const m = pipe.match(/^(\S+)\s*(.*)$/);
  if (!m) return text;
  const [, op, argRaw] = m;
  const arg = argRaw.trim();
  let re: RegExp;
  try {
    re = new RegExp(arg, 'i');
  } catch {
    re = new RegExp(arg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }
  const lines = text.split('\n');
  if ('include'.startsWith(op)) return lines.filter((l) => re.test(l)).join('\n');
  if ('exclude'.startsWith(op)) return lines.filter((l) => !re.test(l)).join('\n');
  if ('begin'.startsWith(op)) {
    const idx = lines.findIndex((l) => re.test(l));
    return idx >= 0 ? lines.slice(idx).join('\n') : '';
  }
  if ('section'.startsWith(op)) {
    const out: string[] = [];
    let taking = false;
    for (const l of lines) {
      const topLevel = !l.startsWith(' ');
      if (topLevel) taking = re.test(l);
      if (taking) out.push(l);
    }
    return out.join('\n');
  }
  return text;
}

const ABBREV = (word: string, target: string, min = 1) =>
  target.startsWith(word.toLowerCase()) && word.length >= min;

function showDispatch(dev: DeviceState, cmd: string): string {
  const t = cmd.split(/\s+/).filter(Boolean);
  const [a, b, c] = [t[0]?.toLowerCase() ?? '', t[1]?.toLowerCase() ?? '', t[2]?.toLowerCase() ?? ''];

  if (ABBREV(a, 'running-config') || (ABBREV(a, 'run', 3) && !a.startsWith('runn'))) {
    return serializeFull(dev.running);
  }
  if (ABBREV(a, 'startup-config', 2)) return serializeFull(dev.startup);
  if (ABBREV(a, 'version', 3)) return showVersion(dev);
  if (ABBREV(a, 'vlan', 4) || (a === 'vlan' && !b)) return showVlan(dev, b);
  if (ABBREV(a, 'flow', 2)) {
    if (ABBREV(b, 'exporter')) return showFlowExporter(dev, t[2]);
    if (ABBREV(b, 'monitor')) return showFlowMonitor(dev, t[2]);
    if (ABBREV(b, 'record')) return showFlowRecord(dev, t[2]);
    return invalid();
  }
  if (ABBREV(a, 'monitor', 3)) return showMonitorSession(dev, t.slice(1));
  if (ABBREV(a, 'ip')) {
    if (ABBREV(b, 'interface', 3) && ABBREV(c, 'brief', 1)) return showIpIntBrief(dev);
    if (ABBREV(b, 'sla')) {
      if (!c || ABBREV(c, 'configuration', 3)) return showIpSla(dev, t[3]);
      if (ABBREV(c, 'summary', 3) || ABBREV(c, 'statistics', 4)) return showIpSlaSummary(dev);
      return showIpSla(dev, undefined);
    }
    if (ABBREV(b, 'route', 3)) return showIpRoute(dev);
    if (ABBREV(b, 'ospf')) return 'Neighbor ID     Pri   State           Dead Time   Address         Interface\n(no OSPF adjacencies in this lab snapshot)';
    if (ABBREV(b, 'eigrp')) return 'EIGRP-IPv4 Neighbors for AS\nH   Address                 Interface              Hold Uptime   SRTT   RTO  Q  Seq\n(no EIGRP adjacencies in this lab snapshot)';
    if (ABBREV(b, 'bgp')) return 'BGP router identifier, local AS number\n(no BGP sessions in this lab snapshot)';
    if (ABBREV(b, 'protocols', 4)) return '*** IP Routing is NSF aware ***\n(routing protocol details derive from running-config; use "show run | section router")';
    return invalid();
  }
  if (ABBREV(a, 'interfaces', 3) && ABBREV(b, 'status', 2)) return showIntStatus(dev);
  if (ABBREV(a, 'interfaces', 3) && ABBREV(b, 'trunk', 2)) return 'Port        Mode         Encapsulation  Status        Native vlan';
  if (ABBREV(a, 'cdp', 2) && ABBREV(b, 'neighbors', 3)) return showCdp(dev);
  if (ABBREV(a, 'standby', 3)) return showStandby(dev);
  if (ABBREV(a, 'etherchannel', 3)) return 'Flags:  D - down        P - bundled in port-channel\nGroup  Port-channel  Protocol    Ports\n(none configured)';
  if (ABBREV(a, 'ntp', 3) && ABBREV(b, 'status', 2)) return 'Clock is unsynchronized, stratum 16, no reference clock';
  if (ABBREV(a, 'ntp', 3) && ABBREV(b, 'associations', 3)) return '  address         ref clock       st   when   poll reach  delay  offset   disp';
  if (ABBREV(a, 'clock', 3)) return '*12:00:00.000 UTC Mon Jul 13 2026';
  if (ABBREV(a, 'history', 4)) return '';
  if (ABBREV(a, 'users', 3)) return '    Line       User       Host(s)              Idle       Location\n*  0 con 0                idle                 00:00:00';
  if (ABBREV(a, 'spanning-tree', 4)) return showSpanningTree(dev);
  if (ABBREV(a, 'access-lists', 3)) return showAcls(dev);
  if (ABBREV(a, 'logging', 3)) return 'Syslog logging: enabled\n    Console logging: level debugging\n    Buffer logging:  level debugging';
  if (ABBREV(a, 'snmp', 4)) return 'Chassis: LAB\n0 SNMP packets input\n0 SNMP packets output';
  return invalid();
}

function invalid(): string {
  return "% Invalid input detected at '^' marker.\n";
}

function showVersion(dev: DeviceState): string {
  return [
    'Cisco IOS Software, Linux Software (I86BI_LINUX-ADVENTERPRISEK9-M), Version 15.4(2)T, RELEASE SOFTWARE (fc1)',
    'Technical Support: http://www.cisco.com/techsupport',
    '',
    `${dev.name} uptime is 1 hour, 23 minutes`,
    'System image file is "unix:/i86bi-linux-adventerprisek9-ms"',
    '',
    'Configuration register is 0x2102',
  ].join('\n');
}

function ifBlocks(dev: DeviceState): Array<{ name: string; lines: string[] }> {
  const out: Array<{ name: string; lines: string[] }> = [];
  for (const node of dev.running) {
    const m = node.line.match(/^interface (.+)$/);
    if (m) out.push({ name: m[1], lines: node.children.map((ch) => ch.line) });
  }
  return out;
}

function showIpIntBrief(dev: DeviceState): string {
  const rows: string[] = ['Interface                  IP-Address      OK? Method Status                Protocol'];
  for (const blk of ifBlocks(dev)) {
    const ipLine = blk.lines.find((l) => l.startsWith('ip address '));
    const ip = ipLine ? ipLine.split(' ')[2] : 'unassigned';
    const shut = blk.lines.includes('shutdown');
    const status = shut ? 'administratively down' : 'up';
    const proto = shut ? 'down' : 'up';
    rows.push(
      blk.name.padEnd(27) + ip.padEnd(16) + 'YES ' + (ipLine ? 'manual' : 'unset ').padEnd(7) + status.padEnd(22) + proto,
    );
  }
  return rows.join('\n');
}

function showFlowExporter(dev: DeviceState, name?: string): string {
  const blocks = dev.running.filter((n) => n.line.startsWith('flow exporter '));
  const chosen = name ? blocks.filter((n) => n.line === `flow exporter ${name}`) : blocks;
  if (chosen.length === 0) return name ? `% Flow Exporter ${name} not found` : '% No flow exporters configured';
  return chosen
    .map((n) => {
      const nm = n.line.replace('flow exporter ', '');
      const get = (p: string) => n.children.find((ch) => ch.line.startsWith(p))?.line;
      const dest = get('destination ')?.split(' ')[1] ?? '(not set)';
      const port = get('transport udp ')?.split(' ')[2] ?? '9995';
      const desc = get('description ')?.replace('description ', '') ?? 'User defined';
      return [
        `Flow Exporter ${nm}:`,
        `  Description:              ${desc}`,
        '  Export protocol:          NetFlow Version 9',
        '  Transport Configuration:',
        `    Destination IP address: ${dest}`,
        `    Source IP address:      ${firstIp(dev) ?? '(not set)'}`,
        '    Transport Protocol:     UDP',
        `    Destination Port:       ${port}`,
        '    Source Port:            50000',
        '    DSCP:                   0x0',
        '    TTL:                    255',
      ].join('\n');
    })
    .join('\n\n');
}

function firstIp(dev: DeviceState): string | null {
  for (const blk of ifBlocks(dev)) {
    const ipLine = blk.lines.find((l) => l.startsWith('ip address '));
    if (ipLine) return ipLine.split(' ')[2];
  }
  return null;
}

function showFlowMonitor(dev: DeviceState, name?: string): string {
  const blocks = dev.running.filter((n) => n.line.startsWith('flow monitor '));
  const chosen = name ? blocks.filter((n) => n.line === `flow monitor ${name}`) : blocks;
  if (chosen.length === 0) return '% No flow monitors configured';
  return chosen
    .map((n) => {
      const nm = n.line.replace('flow monitor ', '');
      const rec = n.children.find((ch) => ch.line.startsWith('record '))?.line.split(' ')[1] ?? '(not set)';
      const exp = n.children.find((ch) => ch.line.startsWith('exporter '))?.line.split(' ')[1];
      return [
        `Flow Monitor ${nm}:`,
        `  Description:       User defined`,
        `  Flow Record:       ${rec}`,
        ...(exp ? [`  Flow Exporter:     ${exp}`] : []),
        '  Cache:',
        '    Type:                 normal (Platform cache)',
        '    Status:               not allocated',
      ].join('\n');
    })
    .join('\n\n');
}

function showFlowRecord(dev: DeviceState, name?: string): string {
  const blocks = dev.running.filter((n) => n.line.startsWith('flow record '));
  const chosen = name ? blocks.filter((n) => n.line === `flow record ${name}`) : blocks;
  if (chosen.length === 0) return '% No flow records configured';
  return chosen
    .map((n) => [`flow record ${n.line.replace('flow record ', '')}:`, ...n.children.map((ch) => '  ' + ch.line)].join('\n'))
    .join('\n\n');
}

function showMonitorSession(dev: DeviceState, args: string[]): string {
  const lines = dev.running.filter((n) => n.line.startsWith('monitor session ')).map((n) => n.line);
  if (lines.length === 0) return '% No sessions configured';
  const sessions = new Map<string, string[]>();
  for (const l of lines) {
    const id = l.split(' ')[2];
    if (!sessions.has(id)) sessions.set(id, []);
    sessions.get(id)!.push(l);
  }
  const wantRaw = args.find((x) => /^\d+$/.test(x));
  const out: string[] = [];
  for (const [id, ls] of Array.from(sessions.entries()).sort((x, y) => Number(x[0]) - Number(y[0]))) {
    if (wantRaw && wantRaw !== id) continue;
    out.push(`Session ${id}`);
    out.push('---------');
    out.push('Type                     : Local Session');
    for (const l of ls) {
      const src = l.match(/source interface (\S+) (both|rx|tx)/);
      const srcVlan = l.match(/source vlan (\S+) (both|rx|tx)/);
      const dst = l.match(/destination interface (\S+)/);
      if (src) {
        const label = { both: 'Both', rx: 'RX Only', tx: 'TX Only' }[src[2] as 'both' | 'rx' | 'tx'];
        out.push(`Source Ports             :`);
        out.push(`    ${label}                 : ${src[1].split(',').map(shortInterface).join(',')}`);
      }
      if (srcVlan) {
        const label = { both: 'Both', rx: 'RX Only', tx: 'TX Only' }[srcVlan[2] as 'both' | 'rx' | 'tx'];
        out.push(`Source VLANs             :`);
        out.push(`    ${label}                 : ${srcVlan[1]}`);
      }
      if (dst) out.push(`Destination Ports        : ${dst[1].split(',').map(shortInterface).join(',')}`);
    }
    out.push('');
  }
  return out.join('\n') || '% No such session';
}

function showIpSla(dev: DeviceState, id?: string): string {
  const blocks = dev.running.filter((n) => /^ip sla \d+$/.test(n.line));
  const chosen = id ? blocks.filter((n) => n.line === `ip sla ${id}`) : blocks;
  if (chosen.length === 0) return 'IP SLAs Infrastructure Engine-III\n(no IP SLA entries configured)';
  const schedules = dev.running.filter((n) => n.line.startsWith('ip sla schedule ')).map((n) => n.line);
  return chosen
    .map((n) => {
      const slaId = n.line.split(' ')[2];
      const op = n.children.find((ch) => /^(icmp-echo|http|tcp-connect|udp-jitter|udp-echo)/.test(ch.line));
      const freq = n.children.find((ch) => ch.line.startsWith('frequency '))?.line.split(' ')[1] ?? '60';
      const sched = schedules.find((sc) => sc.startsWith(`ip sla schedule ${slaId} `) || sc === `ip sla schedule ${slaId}`);
      return [
        'IP SLAs Infrastructure Engine-III',
        `Entry number: ${slaId}`,
        `Type of operation to perform: ${op ? op.line.split(' ')[0] : '(not set)'}`,
        `Operation: ${op?.line ?? '(not set)'}`,
        `Operation frequency (seconds): ${freq}  (not considered if randomly scheduled)`,
        `Status of entry (SNMP RowStatus): ${sched ? 'Active' : 'notInService'}`,
        `Life (seconds): ${sched?.includes('life forever') ? 'Forever' : '3600'}`,
        `Entry Ageout (seconds): never`,
        `Start Time: ${sched?.includes('start-time now') ? 'Start Time already passed' : 'Pending trigger'}`,
      ].join('\n');
    })
    .join('\n\n');
}

function showIpSlaSummary(dev: DeviceState): string {
  const blocks = dev.running.filter((n) => /^ip sla \d+$/.test(n.line));
  const rows = ['ID           Type        Destination       Stats       Return      Last', '-----------------------------------------------------------------------'];
  for (const n of blocks) {
    const slaId = n.line.split(' ')[2];
    const op = n.children.find((ch) => /^(icmp-echo|http|tcp-connect|udp-jitter|udp-echo)/.test(ch.line));
    rows.push(`*${slaId.padEnd(12)}${(op?.line.split(' ')[0] ?? '-').padEnd(12)}${(op?.line.split(' ')[1] ?? '-').padEnd(18)}-           OK          -`);
  }
  return rows.join('\n');
}

function showVlan(dev: DeviceState, _sub: string): string {
  const vlans = new Map<number, string>([
    [1, 'default'],
  ]);
  for (const n of dev.running) {
    const m = n.line.match(/^vlan (\d+)$/);
    if (m) {
      const name = n.children.find((ch) => ch.line.startsWith('name '))?.line.replace('name ', '');
      vlans.set(Number(m[1]), name ?? `VLAN${m[1].padStart(4, '0')}`);
    }
    const sv = n.line.match(/^interface Vlan(\d+)$/);
    if (sv && !vlans.has(Number(sv[1]))) vlans.set(Number(sv[1]), `VLAN${sv[1].padStart(4, '0')}`);
  }
  // access atamalari
  const ports = new Map<number, string[]>();
  for (const blk of ifBlocks(dev)) {
    const acc = blk.lines.find((l) => l.startsWith('switchport access vlan '));
    if (acc) {
      const v = Number(acc.split(' ')[3]);
      if (!ports.has(v)) ports.set(v, []);
      ports.get(v)!.push(shortInterface(blk.name));
    }
  }
  const rows = ['VLAN Name                             Status    Ports', '---- -------------------------------- --------- -------------------------------'];
  for (const [id, name] of Array.from(vlans.entries()).sort((x, y) => x[0] - y[0])) {
    rows.push(String(id).padEnd(5) + name.padEnd(33) + 'active'.padEnd(10) + (ports.get(id)?.join(', ') ?? ''));
  }
  rows.push('1002 fddi-default                     act/unsup', '1003 token-ring-default               act/unsup', '1004 fddinet-default                  act/unsup', '1005 trnet-default                    act/unsup');
  return rows.join('\n');
}

function showIpRoute(dev: DeviceState): string {
  const rows = [
    'Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP',
    '       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area',
    '',
    'Gateway of last resort is not set',
    '',
  ];
  for (const blk of ifBlocks(dev)) {
    const ipLine = blk.lines.find((l) => l.startsWith('ip address ') && !l.endsWith('secondary'));
    if (!ipLine || blk.lines.includes('shutdown')) continue;
    const [, , ip, mask] = ipLine.split(' ');
    const cidr = maskToCidr(mask);
    const net = networkOf(ip, mask);
    rows.push(`C        ${net}/${cidr} is directly connected, ${blk.name}`);
    rows.push(`L        ${ip}/32 is directly connected, ${blk.name}`);
  }
  for (const n of dev.running) {
    const m = n.line.match(/^ip route (\S+) (\S+) (\S+)/);
    if (m) rows.push(`S        ${m[1]}/${maskToCidr(m[2])} [1/0] via ${m[3]}`);
  }
  return rows.join('\n');
}

function maskToCidr(mask: string): number {
  return mask
    .split('.')
    .map(Number)
    .reduce((acc, o) => acc + ((o >>> 0).toString(2).match(/1/g)?.length ?? 0), 0);
}

function networkOf(ip: string, mask: string): string {
  const io = ip.split('.').map(Number);
  const mo = mask.split('.').map(Number);
  return io.map((o, i) => o & mo[i]).join('.');
}

function showIntStatus(dev: DeviceState): string {
  const rows = ['Port      Name               Status       Vlan       Duplex  Speed Type'];
  for (const blk of ifBlocks(dev)) {
    if (blk.name.startsWith('Vlan') || blk.name.startsWith('Loopback')) continue;
    const acc = blk.lines.find((l) => l.startsWith('switchport access vlan '))?.split(' ')[3] ?? '1';
    const trunk = blk.lines.some((l) => l === 'switchport mode trunk');
    rows.push(
      shortInterface(blk.name).padEnd(10) + ''.padEnd(19) + (blk.lines.includes('shutdown') ? 'disabled' : 'connected').padEnd(13) + (trunk ? 'trunk' : acc).padEnd(11) + 'a-full  a-100 10/100BaseTX',
    );
  }
  return rows.join('\n');
}

function showCdp(_dev: DeviceState): string {
  return [
    'Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge',
    '                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone',
    '',
    'Device ID        Local Intrfce     Holdtme    Capability  Platform  Port ID',
    '',
    'Total cdp entries displayed : 0',
  ].join('\n');
}

function showStandby(dev: DeviceState): string {
  const rows = ['                     P indicates configured to preempt.', '                     |', 'Interface   Grp  Pri P State   Active          Standby         Virtual IP'];
  for (const blk of ifBlocks(dev)) {
    for (const l of blk.lines) {
      const m = l.match(/^standby (\d+) ip (\S+)/);
      if (m) {
        const pri = blk.lines.find((x) => x.startsWith(`standby ${m[1]} priority `))?.split(' ')[3] ?? '100';
        const pre = blk.lines.some((x) => x.startsWith(`standby ${m[1]} preempt`)) ? 'P' : ' ';
        rows.push(`${shortInterface(blk.name).padEnd(12)}${m[1].padEnd(5)}${pri.padEnd(4)}${pre} Active  local           unknown         ${m[2]}`);
      }
    }
  }
  return rows.join('\n');
}

function showSpanningTree(dev: DeviceState): string {
  const mode = dev.running.find((n) => n.line.startsWith('spanning-tree mode '))?.line.split(' ')[2] ?? 'pvst';
  return `Spanning tree enabled protocol ${mode === 'rapid-pvst' ? 'rstp' : mode}\nVLAN0001\n  Root ID    Priority    32769\n             This bridge is the root`;
}

function showAcls(dev: DeviceState): string {
  const out: string[] = [];
  for (const n of dev.running) {
    if (n.line.startsWith('ip access-list ')) {
      const parts = n.line.split(' ');
      out.push(`${parts[2] === 'standard' ? 'Standard' : 'Extended'} IP access list ${parts[3]}`);
      for (const ch of n.children) out.push('    ' + ch.line);
    }
    if (n.line.startsWith('access-list ')) out.push(n.line);
  }
  return out.join('\n') || '(no access lists configured)';
}

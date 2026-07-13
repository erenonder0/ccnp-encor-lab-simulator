/**
 * Mod bazli komut tablolari. Her spec: kalip + handler.
 * Handler'lar Ctx uzerinden state degistirir; 'no' modunda addLine silme yapar.
 */

export interface Ctx {
  /** aktif config path'lerine canonical satir ekle (no-modunda: sil) */
  addLine(line: string): void;
  /** top-level'a satir ekle (no-modunda: sil) */
  addGlobal(line: string): void;
  /** yeni alt moda gec (no-modunda: blogu sil, moda gecme) */
  enterMode(id: string, paths: string[][]): void;
  /** mevcut frame'i degistir (ip sla op modlari) — path korunur */
  morphMode(id: string): void;
  exitMode(): void;
  endConfig(): void;
  print(text: string): void;
  /** cihaz interface listesi (dogrulama) */
  hasInterface(name: string): boolean;
  registerInterface(name: string): void;
  isNo: boolean;
  deviceType: 'ios-router' | 'ios-switch';
  setHostname(name: string): void;
  save(): void;
  toExec(): void;
  toPriv(): void;
  runShow(rest: string): void;
  ping(target: string): void;
}

export interface Spec {
  pattern: string;
  run: (ctx: Ctx, captures: string[], words: string[]) => void;
  /** help '?' aciklamasi */
  help?: string;
}

const s = (pattern: string, run: Spec['run'], help?: string): Spec => ({ pattern, run, help });

/* ------------------------------------------------------------------ */
/* ortak yardimcilar                                                   */
/* ------------------------------------------------------------------ */

const VIRTUAL_IF = /^(Loopback|Vlan|Tunnel|Port-channel)/;

function enterInterface(ctx: Ctx, canon: string | string[], range: boolean): void {
  const list = Array.isArray(canon) ? canon : [canon];
  for (const ifname of list) {
    if (!ctx.hasInterface(ifname)) {
      if (VIRTUAL_IF.test(ifname)) ctx.registerInterface(ifname);
      else {
        ctx.print('%Invalid interface type and number');
        return;
      }
    }
  }
  ctx.enterMode(range ? 'config-if-range' : 'config-if', list.map((i) => [`interface ${i}`]));
}

/* ------------------------------------------------------------------ */
/* EXEC / PRIV                                                         */
/* ------------------------------------------------------------------ */

const execSpecs: Spec[] = [
  s('enable', (c) => c.toPriv(), 'Turn on privileged commands'),
  s('exit', () => void 0),
  s('logout', () => void 0),
  s('show <rest>', (c, [rest]) => c.runShow(rest), 'Show running system information'),
  s('ping <word>', (c, [t]) => c.ping(t)),
  s('traceroute <word>', (c, [t]) => c.print(`Type escape sequence to abort.\nTracing the route to ${t}\n  1 ${t} 1 msec 1 msec 1 msec`)),
];

const privSpecs: Spec[] = [
  s('configure terminal', (c) => {
    c.enterMode('config', [[]]);
    c.print("Enter configuration commands, one per line.  End with CNTL/Z.");
  }, 'Enter configuration mode'),
  s('disable', (c) => c.toExec()),
  s('exit', (c) => c.toExec()),
  s('logout', (c) => c.toExec()),
  s('write [memory]', (c) => {
    c.print('Building configuration...\n[OK]');
    c.save();
  }, 'Write running configuration to memory'),
  s('write terminal', (c) => c.runShow('running-config')),
  s('copy running-config startup-config', (c) => {
    c.print('Destination filename [startup-config]? \nBuilding configuration...\n[OK]');
    c.save();
  }),
  s('show <rest>', (c, [rest]) => c.runShow(rest), 'Show running system information'),
  s('ping <word>', (c, [t]) => c.ping(t)),
  s('traceroute <word>', (c, [t]) => c.print(`Type escape sequence to abort.\nTracing the route to ${t}\n  1 ${t} 1 msec 1 msec 1 msec`)),
  s('clear <rest>', () => void 0),
  s('reload', (c) => c.print('% Reload is not supported in this lab simulator.')),
  s('debug <rest>', (c) => c.print('% Debug output is not simulated in this lab.')),
  s('undebug all', () => void 0),
];

/* ------------------------------------------------------------------ */
/* GLOBAL CONFIG                                                       */
/* ------------------------------------------------------------------ */

const configSpecs: Spec[] = [
  s('hostname <word>', (c, [name]) => {
    c.addGlobal(`hostname ${name}`);
    if (!c.isNo) c.setHostname(name);
  }),
  s('interface range <iflist>', (c, [list]) => enterInterface(c, list.split(','), true)),
  s('interface <iface>', (c, [ifname]) => enterInterface(c, ifname, false)),
  s('vlan <num>', (c, [id]) => c.enterMode('config-vlan', [[`vlan ${id}`]])),
  s('ip route <ip> <ip> <word> [<num>]', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('ip route vrf <word> <ip> <ip> <word> [<num>]', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('ip default-gateway <ip>', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('ip domain-name <word>', (c, [d]) => c.addGlobal(`ip domain-name ${d}`)),
  s('ip domain name <word>', (c, [d]) => c.addGlobal(`ip domain-name ${d}`)),
  s('ip name-server <rest>', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('ip ssh version <num>', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('ip scp server enable', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('crypto keyring <word> vrf <word>', (c, [name, vrf]) => c.enterMode('conf-keyring', [[`crypto keyring ${name} vrf ${vrf}`]])),
  s('crypto keyring <word>', (c, [name]) => c.enterMode('conf-keyring', [[`crypto keyring ${name}`]])),
  s('crypto isakmp policy <num>', (c, [n]) => c.enterMode('config-isakmp', [[`crypto isakmp policy ${n}`]])),
  s('crypto isakmp key <word> address <ip> [<ip?>]', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('crypto ipsec transform-set <word> <rest>', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('crypto ipsec profile <word>', (c, [n]) => c.enterMode('config-ipsec-profile', [[`crypto ipsec profile ${n}`]])),
  s('crypto key generate rsa [general-keys] [modulus] [<num>]', (c) =>
    c.print('The name for the keys will be: router.lab.local\n% The key modulus size is 1024 bits\n% Generating 1024 bit RSA keys, keys will be non-exportable...\n[OK]')),
  s('username <word> <rest>', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('enable secret <rest>', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('enable password <rest>', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('service <rest>', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('banner motd <rest>', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('aaa new-model', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('aaa <rest>', (c, _cap, words) => c.addGlobal(words.join(' '))),

  // NetFlow
  s('flow record <word>', (c, [n]) => c.enterMode('config-flow-record', [[`flow record ${n}`]])),
  s('flow exporter <word>', (c, [n]) => c.enterMode('config-flow-exporter', [[`flow exporter ${n}`]])),
  s('flow monitor <word>', (c, [n]) => c.enterMode('config-flow-monitor', [[`flow monitor ${n}`]])),

  // IP SLA
  s('ip sla schedule <num> life forever start-time now', (c, [id]) =>
    c.addGlobal(`ip sla schedule ${id} life forever start-time now`)),
  s('ip sla schedule <num> life forever', (c, [id]) => c.addGlobal(`ip sla schedule ${id} life forever`)),
  s('ip sla schedule <num> life <num> start-time now', (c, [id, life]) =>
    c.addGlobal(`ip sla schedule ${id} life ${life} start-time now`)),
  s('ip sla schedule <num> start-time now', (c, [id]) => c.addGlobal(`ip sla schedule ${id} start-time now`)),
  s('ip sla schedule <num> start-time now life forever', (c, [id]) =>
    c.addGlobal(`ip sla schedule ${id} life forever start-time now`)),
  s('ip sla responder', (c) => c.addGlobal('ip sla responder')),
  s('ip sla <num>', (c, [id]) => c.enterMode('config-ip-sla', [[`ip sla ${id}`]])),

  // SPAN
  s('monitor session <num> source interface <iflist> [both|rx|tx]', (c, caps) => {
    const [id, list, dir = 'both'] = caps;
    c.addGlobal(`monitor session ${id} source interface ${list} ${dir}`);
  }),
  s('monitor session <num> source vlan <word> [both|rx|tx]', (c, caps) => {
    const [id, vlans, dir = 'both'] = caps;
    c.addGlobal(`monitor session ${id} source vlan ${vlans} ${dir}`);
  }),
  s('monitor session <num> destination interface <iflist>', (c, [id, list]) =>
    c.addGlobal(`monitor session ${id} destination interface ${list}`)),
  s('monitor session <num> filter <rest>', (c, _cap, words) => c.addGlobal(words.join(' '))),

  // Routing
  s('router ospf <num> vrf <word>', (c, [id, vrf]) => c.enterMode('config-router', [[`router ospf ${id} vrf ${vrf}`]])),
  s('router ospf <num>', (c, [id]) => c.enterMode('config-router', [[`router ospf ${id}`]])),
  s('router eigrp <word>', (c, [id]) => c.enterMode('config-router', [[`router eigrp ${id}`]])),
  s('router bgp <num>', (c, [id]) => c.enterMode('config-router', [[`router bgp ${id}`]])),
  s('router rip', (c) => c.enterMode('config-router', [['router rip']])),

  // ACL
  s('ip access-list standard <word>', (c, [n]) => c.enterMode('config-std-nacl', [[`ip access-list standard ${n}`]])),
  s('ip access-list extended <word>', (c, [n]) => c.enterMode('config-ext-nacl', [[`ip access-list extended ${n}`]])),
  s('access-list <num> <rest>', (c, _cap, words) => c.addGlobal(words.join(' '))),

  // NTP / logging / SNMP
  s('ntp server <word> [prefer]', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('ntp master [<num>]', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('ntp authenticate', (c) => c.addGlobal('ntp authenticate')),
  s('ntp authentication-key <num> md5 <rest>', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('ntp trusted-key <num>', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('ntp source <iface>', (c, [i]) => c.addGlobal(`ntp source ${i}`)),
  s('ntp update-calendar', (c) => c.addGlobal('ntp update-calendar')),
  s('logging host <ip>', (c, [ip]) => c.addGlobal(`logging host ${ip}`)),
  s('logging <ip>', (c, [ip]) => c.addGlobal(`logging host ${ip}`)),
  s('logging trap <word>', (c, [l]) => c.addGlobal(`logging trap ${l}`)),
  s('logging buffered <word>', (c, [l]) => c.addGlobal(`logging buffered ${l}`)),
  s('logging console', (c) => c.addGlobal('logging console')),
  s('logging on', (c) => c.addGlobal('logging on')),
  s('logging monitor', (c) => c.addGlobal('logging monitor')),
  s('logging source-interface <iface>', (c, [i]) => c.addGlobal(`logging source-interface ${i}`)),
  s('snmp-server community <word> [ro|rw] [<word?>]', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('snmp-server host <rest>', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('snmp-server enable traps [<rest?>]', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('snmp-server contact <rest>', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('snmp-server location <rest>', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('snmp-server <rest>', (c, _cap, words) => c.addGlobal(words.join(' '))),

  // L2
  s('spanning-tree mode (pvst|rapid-pvst|mst)', (c, [m]) => c.addGlobal(`spanning-tree mode ${m}`)),
  s('spanning-tree vlan <word> priority <num>', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('spanning-tree vlan <word> root (primary|secondary)', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('spanning-tree <rest>', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('vtp mode (server|client|transparent|off)', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('vtp domain <word>', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('vtp password <word>', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('vtp version <num>', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('errdisable recovery <rest>', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('cdp run', (c) => c.addGlobal('cdp run')),
  s('lldp run', (c) => c.addGlobal('lldp run')),

  // QoS / CoPP
  s('class-map match-any <word>', (c, [n]) => c.enterMode('config-cmap', [[`class-map match-any ${n}`]])),
  s('class-map match-all <word>', (c, [n]) => c.enterMode('config-cmap', [[`class-map match-all ${n}`]])),
  s('class-map <word>', (c, [n]) => c.enterMode('config-cmap', [[`class-map match-all ${n}`]])),
  s('policy-map <word>', (c, [n]) => c.enterMode('config-pmap', [[`policy-map ${n}`]])),
  s('control-plane', (c) => c.enterMode('config-cp', [['control-plane']])),

  // VRF / key chain / line / dhcp / nat / ipv6
  s('vrf definition <word>', (c, [n]) => c.enterMode('config-vrf', [[`vrf definition ${n}`]])),
  s('key chain <word>', (c, [n]) => c.enterMode('config-keychain', [[`key chain ${n}`]])),
  s('line vty <num> <num>', (c, [a, b]) => c.enterMode('config-line', [[`line vty ${a} ${b}`]])),
  s('line console <num>', (c, [n]) => c.enterMode('config-line', [[`line console ${n}`]])),
  s('ip dhcp pool <word>', (c, [n]) => c.enterMode('config-dhcp', [[`ip dhcp pool ${n}`]])),
  s('ip dhcp excluded-address <ip> [<ip?>]', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('ip nat <rest>', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('ip forward-protocol <rest>', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('ipv6 unicast-routing', (c) => c.addGlobal('ipv6 unicast-routing')),
  s('ipv6 route <rest>', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('track <num> <rest>', (c, _cap, words) => c.addGlobal(words.join(' '))),
  s('ip routing', (c) => c.addGlobal('ip routing')),
  s('ip cef', (c) => c.addGlobal('ip cef')),
];

/* ------------------------------------------------------------------ */
/* INTERFACE                                                           */
/* ------------------------------------------------------------------ */

const ifSpecs: Spec[] = [
  s('ip address <ip> <ip> [secondary]', (c, caps) =>
    c.addLine(`ip address ${caps[0]} ${caps[1]}${caps[2] ? ' secondary' : ''}`)),
  s('ip address dhcp', (c) => c.addLine('ip address dhcp')),
  s('shutdown', (c) => c.addLine('shutdown')),
  s('description <rest>', (c, [d]) => c.addLine(`description ${d}`)),
  s('switchport mode (access|trunk|dynamic)', (c, [m]) => c.addLine(`switchport mode ${m}`)),
  s('switchport access vlan <num>', (c, [v]) => c.addLine(`switchport access vlan ${v}`)),
  s('switchport trunk encapsulation (dot1q|isl|negotiate)', (c, [e]) => c.addLine(`switchport trunk encapsulation ${e}`)),
  s('switchport trunk allowed vlan <rest>', (c, [v]) => c.addLine(`switchport trunk allowed vlan ${v.replace(/\s+/g, '')}`)),
  s('switchport trunk native vlan <num>', (c, [v]) => c.addLine(`switchport trunk native vlan ${v}`)),
  s('switchport nonegotiate', (c) => c.addLine('switchport nonegotiate')),
  s('switchport voice vlan <num>', (c, [v]) => c.addLine(`switchport voice vlan ${v}`)),
  s('switchport port-security <rest?>', (c, [r]) => c.addLine(`switchport port-security${r ? ' ' + r : ''}`)),
  s('switchport', (c) => c.addLine('switchport')),
  s('channel-group <num> mode (on|active|passive|desirable|auto)', (c, [n, m]) => {
    c.addLine(`channel-group ${n} mode ${m}`);
    if (!c.isNo) c.registerInterface(`Port-channel${n}`);
  }),
  s('ip flow monitor <word> (input|output)', (c, [n, d]) => c.addLine(`ip flow monitor ${n} ${d}`)),
  s('ip ospf <num> area <word>', (c, [p, a]) => c.addLine(`ip ospf ${p} area ${a}`)),
  s('ip ospf network (point-to-point|broadcast|non-broadcast|point-to-multipoint)', (c, [t]) => c.addLine(`ip ospf network ${t}`)),
  s('ip ospf priority <num>', (c, [p]) => c.addLine(`ip ospf priority ${p}`)),
  s('ip ospf cost <num>', (c, [p]) => c.addLine(`ip ospf cost ${p}`)),
  s('ip ospf hello-interval <num>', (c, [p]) => c.addLine(`ip ospf hello-interval ${p}`)),
  s('ip ospf dead-interval <num>', (c, [p]) => c.addLine(`ip ospf dead-interval ${p}`)),
  s('ip ospf authentication [message-digest|null]', (c, _cap, words) => c.addLine(words.join(' '))),
  s('ip ospf message-digest-key <num> md5 <rest>', (c, _cap, words) => c.addLine(words.join(' '))),
  s('standby version <num>', (c, [v]) => c.addLine(`standby version ${v}`)),
  s('standby <num> ip <ip>', (c, [g, ip]) => c.addLine(`standby ${g} ip ${ip}`)),
  s('standby <num> priority <num>', (c, [g, p]) => c.addLine(`standby ${g} priority ${p}`)),
  s('standby <num> preempt [<rest?>]', (c, [g, r]) => c.addLine(`standby ${g} preempt${r ? ' ' + r : ''}`)),
  s('standby <num> track <rest>', (c, [g, r]) => c.addLine(`standby ${g} track ${r}`)),
  s('standby <num> name <word>', (c, [g, n]) => c.addLine(`standby ${g} name ${n}`)),
  s('standby <num> authentication <rest>', (c, [g, r]) => c.addLine(`standby ${g} authentication ${r}`)),
  s('standby <num> timers <num> <num>', (c, [g, a, b]) => c.addLine(`standby ${g} timers ${a} ${b}`)),
  s('vrrp <num> <rest>', (c, [g, r]) => c.addLine(`vrrp ${g} ${r}`)),
  s('glbp <num> <rest>', (c, [g, r]) => c.addLine(`glbp ${g} ${r}`)),
  s('vrf forwarding <word>', (c, [v]) => c.addLine(`vrf forwarding ${v}`)),
  s('ip vrf forwarding <word>', (c, [v]) => c.addLine(`vrf forwarding ${v}`)),
  s('ip helper-address <ip>', (c, [ip]) => c.addLine(`ip helper-address ${ip}`)),
  s('ip access-group <word> (in|out)', (c, [a, d]) => c.addLine(`ip access-group ${a} ${d}`)),
  s('ip nat (inside|outside)', (c, [d]) => c.addLine(`ip nat ${d}`)),
  s('encapsulation dot1q <num> [native]', (c, caps) =>
    c.addLine(`encapsulation dot1Q ${caps[0]}${caps[1] ? ' native' : ''}`)),
  s('bandwidth <num>', (c, [b]) => c.addLine(`bandwidth ${b}`)),
  s('delay <num>', (c, [d]) => c.addLine(`delay ${d}`)),
  s('mtu <num>', (c, [m]) => c.addLine(`mtu ${m}`)),
  s('ip mtu <num>', (c, [m]) => c.addLine(`ip mtu ${m}`)),
  s('ip tcp adjust-mss <num>', (c, [m]) => c.addLine(`ip tcp adjust-mss ${m}`)),
  s('duplex (auto|full|half)', (c, [d]) => c.addLine(`duplex ${d}`)),
  s('speed (auto|10|100|1000)', (c, [d]) => c.addLine(`speed ${d}`)),
  s('tunnel source <word>', (c, [t]) => c.addLine(`tunnel source ${t}`)),
  s('tunnel destination <ip>', (c, [t]) => c.addLine(`tunnel destination ${t}`)),
  s('tunnel mode gre ip', (c) => c.addLine('tunnel mode gre ip')),
  s('tunnel vrf <word>', (c, [v]) => c.addLine(`tunnel vrf ${v}`)),
  s('tunnel protection ipsec profile <word>', (c, [p]) => c.addLine(`tunnel protection ipsec profile ${p}`)),
  s('tunnel mode <rest>', (c, [r]) => c.addLine(`tunnel mode ${r}`)),
  s('keepalive [<num?>] [<num?>]', (c, _cap, words) => c.addLine(words.join(' '))),
  s('cdp enable', (c) => c.addLine('cdp enable')),
  s('ntp broadcast <rest?>', (c, _cap, words) => c.addLine(words.join(' '))),
];

/* ------------------------------------------------------------------ */
/* alt modlar                                                          */
/* ------------------------------------------------------------------ */

const flowRecordSpecs: Spec[] = [
  s('match <rest>', (c, [r]) => c.addLine(`match ${r}`)),
  s('collect <rest>', (c, [r]) => c.addLine(`collect ${r}`)),
  s('description <rest>', (c, [d]) => c.addLine(`description ${d}`)),
];

const flowExporterSpecs: Spec[] = [
  s('destination <ip>', (c, [ip]) => c.addLine(`destination ${ip}`)),
  s('transport udp <num>', (c, [p]) => c.addLine(`transport udp ${p}`)),
  s('source <iface>', (c, [i]) => c.addLine(`source ${i}`)),
  s('description <rest>', (c, [d]) => c.addLine(`description ${d}`)),
  s('export-protocol (netflow-v5|netflow-v9|ipfix)', (c, [p]) => c.addLine(`export-protocol ${p}`)),
  s('dscp <num>', (c, [d]) => c.addLine(`dscp ${d}`)),
  s('ttl <num>', (c, [t]) => c.addLine(`ttl ${t}`)),
];

const flowMonitorSpecs: Spec[] = [
  s('record <word>', (c, [r]) => c.addLine(`record ${r}`)),
  s('exporter <word>', (c, [e]) => c.addLine(`exporter ${e}`)),
  s('cache <rest>', (c, [r]) => c.addLine(`cache ${r}`)),
  s('description <rest>', (c, [d]) => c.addLine(`description ${d}`)),
];

const ipSlaSpecs: Spec[] = [
  s('icmp-echo <ip> [source-ip] [<ip?>] [source-interface] [<iface?>]', (c, _caps, words) => {
    c.addLine(words.join(' '));
    c.morphMode('config-ip-sla-echo');
  }),
  s('http get <word>', (c, [url]) => {
    c.addLine(`http get ${url}`);
    c.morphMode('config-ip-sla-http');
  }),
  s('http raw <word>', (c, [url]) => {
    c.addLine(`http raw ${url}`);
    c.morphMode('config-ip-sla-http');
  }),
  s('tcp-connect <ip> <num>', (c, [ip, port]) => {
    c.addLine(`tcp-connect ${ip} ${port}`);
    c.morphMode('config-ip-sla-tcp');
  }),
  s('udp-jitter <ip> <num>', (c, [ip, port]) => {
    c.addLine(`udp-jitter ${ip} ${port}`);
    c.morphMode('config-ip-sla-jitter');
  }),
  s('udp-echo <ip> <num>', (c, [ip, port]) => {
    c.addLine(`udp-echo ${ip} ${port}`);
    c.morphMode('config-ip-sla-echo');
  }),
];

const ipSlaOpSpecs: Spec[] = [
  s('frequency <num>', (c, [f]) => c.addLine(`frequency ${f}`)),
  s('timeout <num>', (c, [t]) => c.addLine(`timeout ${t}`)),
  s('threshold <num>', (c, [t]) => c.addLine(`threshold ${t}`)),
  s('tag <rest>', (c, [t]) => c.addLine(`tag ${t}`)),
  s('tos <num>', (c, [t]) => c.addLine(`tos ${t}`)),
  s('request-data-size <num>', (c, [t]) => c.addLine(`request-data-size ${t}`)),
  s('history <rest>', (c, [t]) => c.addLine(`history ${t}`)),
  s('owner <rest>', (c, [t]) => c.addLine(`owner ${t}`)),
];

const routerSpecs: Spec[] = [
  s('network <ip> <ip> area <word>', (c, _cap, words) => c.addLine(words.join(' '))),
  s('network <ip> <ip>', (c, _cap, words) => c.addLine(words.join(' '))),
  s('network <ip> mask <ip>', (c, _cap, words) => c.addLine(words.join(' '))),
  s('network <ip>', (c, _cap, words) => c.addLine(words.join(' '))),
  s('router-id <ip>', (c, [id]) => c.addLine(`router-id ${id}`)),
  s('eigrp router-id <ip>', (c, [id]) => c.addLine(`eigrp router-id ${id}`)),
  s('bgp router-id <ip>', (c, [id]) => c.addLine(`bgp router-id ${id}`)),
  s('bgp log-neighbor-changes', (c) => c.addLine('bgp log-neighbor-changes')),
  s('passive-interface <iface>', (c, [i]) => c.addLine(`passive-interface ${i}`)),
  s('passive-interface default', (c) => c.addLine('passive-interface default')),
  s('auto-summary', (c) => c.addLine('auto-summary')),
  s('default-information originate [always]', (c, _cap, words) => c.addLine(words.join(' '))),
  s('auto-cost reference-bandwidth <num>', (c, [b]) => c.addLine(`auto-cost reference-bandwidth ${b}`)),
  s('maximum-paths <num>', (c, [m]) => c.addLine(`maximum-paths ${m}`)),
  s('distance <rest>', (c, [d]) => c.addLine(`distance ${d}`)),
  s('redistribute <rest>', (c, [r]) => c.addLine(`redistribute ${r}`)),
  s('area <word> <rest>', (c, [a, r]) => c.addLine(`area ${a} ${r}`)),
  s('summary-address <rest>', (c, [r]) => c.addLine(`summary-address ${r}`)),
  s('variance <num>', (c, [v]) => c.addLine(`variance ${v}`)),
  s('neighbor <ip> remote-as <num>', (c, _cap, words) => c.addLine(words.join(' '))),
  s('neighbor <ip> update-source <iface>', (c, _cap, words) => c.addLine(words.join(' '))),
  s('neighbor <ip> next-hop-self', (c, _cap, words) => c.addLine(words.join(' '))),
  s('neighbor <ip> description <rest>', (c, _cap, words) => c.addLine(words.join(' '))),
  s('neighbor <ip> shutdown', (c, _cap, words) => c.addLine(words.join(' '))),
  s('neighbor <ip> activate', (c, _cap, words) => c.addLine(words.join(' '))),
  s('neighbor <ip> ebgp-multihop [<num?>]', (c, _cap, words) => c.addLine(words.join(' '))),
  s('neighbor <ip> password <rest>', (c, _cap, words) => c.addLine(words.join(' '))),
  s('neighbor <ip> timers <num> <num>', (c, _cap, words) => c.addLine(words.join(' '))),
  s('address-family ipv4 unicast autonomous-system <num>', (c, [as]) =>
    c.enterMode('config-router-af', [[`address-family ipv4 unicast autonomous-system ${as}`]])),
  s('address-family ipv4 [unicast]', (c) => c.enterMode('config-router-af', [['address-family ipv4']])),
  s('address-family <rest>', (c, [r]) => c.enterMode('config-router-af', [[`address-family ${r}`]])),
];

const routerAfSpecs: Spec[] = [
  ...routerSpecs.filter((sp) => !sp.pattern.startsWith('address-family')),
  s('af-interface <iface>', (c, [i]) => c.enterMode('config-router-af-interface', [[`af-interface ${i}`]])),
  s('af-interface default', (c) => c.enterMode('config-router-af-interface', [['af-interface default']])),
  s('topology base', (c) => c.enterMode('config-router-af-topology', [['topology base']])),
  s('exit-address-family', (c) => c.exitMode()),
];

const afInterfaceSpecs: Spec[] = [
  s('passive-interface', (c) => c.addLine('passive-interface')),
  s('hello-interval <num>', (c, [h]) => c.addLine(`hello-interval ${h}`)),
  s('hold-time <num>', (c, [h]) => c.addLine(`hold-time ${h}`)),
  s('authentication <rest>', (c, [r]) => c.addLine(`authentication ${r}`)),
  s('exit-af-interface', (c) => c.exitMode()),
];

const afTopologySpecs: Spec[] = [
  s('redistribute <rest>', (c, [r]) => c.addLine(`redistribute ${r}`)),
  s('variance <num>', (c, [v]) => c.addLine(`variance ${v}`)),
  s('maximum-paths <num>', (c, [m]) => c.addLine(`maximum-paths ${m}`)),
  s('exit-af-topology', (c) => c.exitMode()),
];

const vlanSpecs: Spec[] = [
  s('name <word>', (c, [n]) => c.addLine(`name ${n}`)),
  s('state (active|suspend)', (c, [st]) => c.addLine(`state ${st}`)),
];

const aclSpecs: Spec[] = [
  s('permit <rest>', (c, [r]) => c.addLine(`permit ${r}`)),
  s('deny <rest>', (c, [r]) => c.addLine(`deny ${r}`)),
  s('remark <rest>', (c, [r]) => c.addLine(`remark ${r}`)),
  s('<num> permit <rest>', (c, [n, r]) => c.addLine(`${n} permit ${r}`)),
  s('<num> deny <rest>', (c, [n, r]) => c.addLine(`${n} deny ${r}`)),
];

const lineSpecs: Spec[] = [
  s('password <word>', (c, [p]) => c.addLine(`password ${p}`)),
  s('login [local]', (c, _cap, words) => c.addLine(words.join(' '))),
  s('no login', (c) => c.addLine('no login')),
  s('transport input <rest>', (c, [r]) => c.addLine(`transport input ${r}`)),
  s('transport output <rest>', (c, [r]) => c.addLine(`transport output ${r}`)),
  s('exec-timeout <num> [<num?>]', (c, _cap, words) => c.addLine(words.join(' '))),
  s('logging synchronous', (c) => c.addLine('logging synchronous')),
  s('access-class <word> (in|out)', (c, [a, d]) => c.addLine(`access-class ${a} ${d}`)),
  s('privilege level <num>', (c, [l]) => c.addLine(`privilege level ${l}`)),
];

const vrfSpecs: Spec[] = [
  s('rd <word>', (c, [rd]) => c.addLine(`rd ${rd}`)),
  s('description <rest>', (c, [d]) => c.addLine(`description ${d}`)),
  s('address-family (ipv4|ipv6)', (c, [af]) => c.enterMode('config-vrf-af', [[`address-family ${af}`]])),
];

const vrfAfSpecs: Spec[] = [
  s('route-target (import|export|both) <word>', (c, _cap, words) => c.addLine(words.join(' '))),
  s('exit-address-family', (c) => c.exitMode()),
];

const keychainSpecs: Spec[] = [s('key <num>', (c, [n]) => c.enterMode('config-keychain-key', [[`key ${n}`]]))];

const cmapSpecs: Spec[] = [
  s('match access-group name <word>', (c, [n]) => c.addLine(`match access-group name ${n}`)),
  s('match access-group <num>', (c, [n]) => c.addLine(`match access-group ${n}`)),
  s('match protocol <word>', (c, [p]) => c.addLine(`match protocol ${p}`)),
  s('match ip dscp <rest>', (c, [r]) => c.addLine(`match ip dscp ${r}`)),
  s('match <rest>', (c, [r]) => c.addLine(`match ${r}`)),
  s('description <rest>', (c, [d]) => c.addLine(`description ${d}`)),
];

const pmapSpecs: Spec[] = [
  s('class <word>', (c, [n]) => c.enterMode('config-pmap-c', [[`class ${n}`]])),
  s('description <rest>', (c, [d]) => c.addLine(`description ${d}`)),
];

const pmapClassSpecs: Spec[] = [
  s('police <num> conform-action (transmit|drop) exceed-action (transmit|drop)', (c, _cap, words) =>
    c.addLine(words.join(' '))),
  s('police <num> <num> conform-action (transmit|drop) exceed-action (transmit|drop)', (c, _cap, words) =>
    c.addLine(words.join(' '))),
  s('police <num>', (c, [r]) => c.addLine(`police ${r}`)),
  s('police cir <rest>', (c, [r]) => c.addLine(`police cir ${r}`)),
  s('bandwidth <rest>', (c, [r]) => c.addLine(`bandwidth ${r}`)),
  s('priority <rest>', (c, [r]) => c.addLine(`priority ${r}`)),
  s('shape average <rest>', (c, [r]) => c.addLine(`shape average ${r}`)),
  s('set <rest>', (c, [r]) => c.addLine(`set ${r}`)),
  s('drop', (c) => c.addLine('drop')),
];

const controlPlaneSpecs: Spec[] = [
  s('service-policy input <word>', (c, [p]) => c.addLine(`service-policy input ${p}`)),
  s('service-policy output <word>', (c, [p]) => c.addLine(`service-policy output ${p}`)),
];

const keyringSpecs: Spec[] = [
  s('pre-shared-key address <ip> <ip> key <word>', (c, _cap, words) => c.addLine(words.join(' '))),
  s('pre-shared-key address <ip> key <word>', (c, _cap, words) => c.addLine(words.join(' '))),
  s('description <rest>', (c, [d]) => c.addLine(`description ${d}`)),
];

const isakmpSpecs: Spec[] = [
  s('encryption (aes|des|3des)', (c, _cap, words) => c.addLine(words.join(' '))),
  s('hash (sha|sha256|sha384|md5)', (c, _cap, words) => c.addLine(words.join(' '))),
  s('authentication pre-share', (c) => c.addLine('authentication pre-share')),
  s('group <num>', (c, [g]) => c.addLine(`group ${g}`)),
  s('lifetime <num>', (c, [l]) => c.addLine(`lifetime ${l}`)),
];

const ipsecProfileSpecs: Spec[] = [
  s('set transform-set <word>', (c, [t]) => c.addLine(`set transform-set ${t}`)),
  s('set isakmp-profile <word>', (c, [t]) => c.addLine(`set isakmp-profile ${t}`)),
  s('description <rest>', (c, [d]) => c.addLine(`description ${d}`)),
];

const keychainKeySpecs: Spec[] = [
  s('key-string <word>', (c, [k]) => c.addLine(`key-string ${k}`)),
  s('cryptographic-algorithm <word>', (c, [a]) => c.addLine(`cryptographic-algorithm ${a}`)),
];

const dhcpSpecs: Spec[] = [
  s('network <ip> <ip>', (c, _cap, words) => c.addLine(words.join(' '))),
  s('default-router <ip>', (c, [ip]) => c.addLine(`default-router ${ip}`)),
  s('dns-server <rest>', (c, [r]) => c.addLine(`dns-server ${r}`)),
  s('domain-name <word>', (c, [d]) => c.addLine(`domain-name ${d}`)),
  s('lease <rest>', (c, [r]) => c.addLine(`lease ${r}`)),
];

/* ------------------------------------------------------------------ */

export const MODE_PROMPTS: Record<string, string> = {
  exec: '>',
  priv: '#',
  config: '(config)#',
  'config-if': '(config-if)#',
  'config-if-range': '(config-if-range)#',
  'config-vlan': '(config-vlan)#',
  'config-flow-record': '(config-flow-record)#',
  'config-flow-exporter': '(config-flow-exporter)#',
  'config-flow-monitor': '(config-flow-monitor)#',
  'config-ip-sla': '(config-ip-sla)#',
  'config-ip-sla-echo': '(config-ip-sla-echo)#',
  'config-ip-sla-http': '(config-ip-sla-http)#',
  'config-ip-sla-tcp': '(config-ip-sla-tcp)#',
  'config-ip-sla-jitter': '(config-ip-sla-jitter)#',
  'config-router': '(config-router)#',
  'config-router-af': '(config-router-af)#',
  'config-router-af-interface': '(config-router-af-interface)#',
  'config-router-af-topology': '(config-router-af-topology)#',
  'config-line': '(config-line)#',
  'config-std-nacl': '(config-std-nacl)#',
  'config-ext-nacl': '(config-ext-nacl)#',
  'config-vlan-db': '(config-vlan)#',
  'config-cmap': '(config-cmap)#',
  'config-pmap': '(config-pmap)#',
  'config-pmap-c': '(config-pmap-c)#',
  'config-cp': '(config-cp)#',
  'conf-keyring': '(conf-keyring)#',
  'config-isakmp': '(config-isakmp)#',
  'config-ipsec-profile': '(ipsec-profile)#',
  'config-vrf': '(config-vrf)#',
  'config-vrf-af': '(config-vrf-af)#',
  'config-keychain': '(config-keychain)#',
  'config-keychain-key': '(config-keychain-key)#',
  'config-dhcp': '(dhcp-config)#',
};

export const GRAMMARS: Record<string, Spec[]> = {
  exec: execSpecs,
  priv: privSpecs,
  config: configSpecs,
  'config-if': ifSpecs,
  'config-if-range': ifSpecs,
  'config-vlan': vlanSpecs,
  'config-flow-record': flowRecordSpecs,
  'config-flow-exporter': flowExporterSpecs,
  'config-flow-monitor': flowMonitorSpecs,
  'config-ip-sla': ipSlaSpecs,
  'config-ip-sla-echo': ipSlaOpSpecs,
  'config-ip-sla-http': ipSlaOpSpecs,
  'config-ip-sla-tcp': ipSlaOpSpecs,
  'config-ip-sla-jitter': ipSlaOpSpecs,
  'config-router': routerSpecs,
  'config-router-af': routerAfSpecs,
  'config-router-af-interface': afInterfaceSpecs,
  'config-router-af-topology': afTopologySpecs,
  'config-line': lineSpecs,
  'config-std-nacl': aclSpecs,
  'config-ext-nacl': aclSpecs,
  'config-vrf': vrfSpecs,
  'config-vrf-af': vrfAfSpecs,
  'config-cmap': cmapSpecs,
  'config-pmap': pmapSpecs,
  'config-pmap-c': pmapClassSpecs,
  'config-cp': controlPlaneSpecs,
  'conf-keyring': keyringSpecs,
  'config-isakmp': isakmpSpecs,
  'config-ipsec-profile': ipsecProfileSpecs,
  'config-keychain': keychainSpecs,
  'config-keychain-key': keychainKeySpecs,
  'config-dhcp': dhcpSpecs,
};

export interface ConfigNode {
  line: string;
  children: ConfigNode[];
}

export type DeviceType = 'ios-router' | 'ios-switch' | 'pc';

export interface ModeFrame {
  /** grammar mode id: exec | priv | config | config-if | config-flow-exporter ... */
  id: string;
  /** prompt suffix, e.g. "(config-if)#" */
  prompt: string;
  /** config paths this mode writes under (interface range -> multiple) */
  paths: string[][];
}

export interface DeviceState {
  name: string;
  type: DeviceType;
  interfaces: string[];
  running: ConfigNode[];
  startup: ConfigNode[];
  modeStack: ModeFrame[];
  /** PC only */
  pc?: { ip: string; mask: string; gateway: string; vlan?: string };
}

export interface ExecResult {
  output: string;
  prompt: string;
}

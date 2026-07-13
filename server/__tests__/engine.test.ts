import { describe, expect, it } from 'vitest';
import type { DeviceState } from '../ios/types';
import { bootDevice, completeInput, execute, prompt } from '../ios/engine';
import { serialize } from '../ios/configTree';

function makeRouter(): DeviceState {
  const dev: DeviceState = {
    name: 'R1',
    type: 'ios-router',
    interfaces: ['Ethernet0/0'],
    running: [],
    startup: [],
    modeStack: [],
  };
  bootDevice(dev);
  return dev;
}

function run(dev: DeviceState, ...cmds: string[]): string {
  let out = '';
  for (const c of cmds) out = execute(dev, c).output;
  return out;
}

describe('mod makinesi', () => {
  it('enable / conf t / interface promptlari', () => {
    const dev = makeRouter();
    expect(prompt(dev)).toBe('R1>');
    execute(dev, 'enable');
    expect(prompt(dev)).toBe('R1#');
    execute(dev, 'conf t');
    expect(prompt(dev)).toBe('R1(config)#');
    execute(dev, 'int e0/0');
    expect(prompt(dev)).toBe('R1(config-if)#');
    execute(dev, 'exit');
    expect(prompt(dev)).toBe('R1(config)#');
    execute(dev, 'end');
    expect(prompt(dev)).toBe('R1#');
  });

  it('ip sla op modu exit ile config\'e doner', () => {
    const dev = makeRouter();
    run(dev, 'en', 'conf t', 'ip sla 10');
    expect(prompt(dev)).toBe('R1(config-ip-sla)#');
    execute(dev, 'http get http://10.10.1.100');
    expect(prompt(dev)).toBe('R1(config-ip-sla-http)#');
    execute(dev, 'exit');
    expect(prompt(dev)).toBe('R1(config)#');
  });
});

describe('kisaltma ve hatalar', () => {
  it('kisaltmalar tam forma acilir', () => {
    const dev = makeRouter();
    run(dev, 'en', 'conf t', 'int e0/0', 'ip add 10.10.1.2 255.255.255.0');
    expect(serialize(dev.running)).toContain('ip address 10.10.1.2 255.255.255.0');
  });

  it('gecersiz komut ^ isareti uretir', () => {
    const dev = makeRouter();
    const out = run(dev, 'en', 'conf t', 'foobar');
    expect(out).toContain("% Invalid input detected at '^' marker.");
    expect(out.split('\n')[0]).toMatch(/\^/);
  });

  it('eksik komut', () => {
    const dev = makeRouter();
    const out = run(dev, 'en', 'conf t', 'flow exporter');
    expect(out).toContain('% Incomplete command.');
  });

  it('exec modunda config komutu gecersiz', () => {
    const dev = makeRouter();
    const out = run(dev, 'en', 'flow exporter X');
    expect(out).toContain('% Invalid input');
  });
});

describe('config yazimi', () => {
  it('flow exporter + destination + transport', () => {
    const dev = makeRouter();
    run(dev, 'en', 'conf t', 'flow exporter EXP', 'destination 10.1.1.1', 'transport udp 2055');
    const text = serialize(dev.running);
    expect(text).toContain('flow exporter EXP\n destination 10.1.1.1\n transport udp 2055');
  });

  it('destination tekrar yazilinca eskisini ezer', () => {
    const dev = makeRouter();
    run(dev, 'en', 'conf t', 'flow exporter EXP', 'destination 10.1.1.1', 'destination 10.2.2.2');
    const text = serialize(dev.running);
    expect(text).toContain('destination 10.2.2.2');
    expect(text).not.toContain('destination 10.1.1.1');
  });

  it('monitor session kaynaklari birlesir', () => {
    const dev: DeviceState = {
      name: 'Sw1',
      type: 'ios-switch',
      interfaces: ['Ethernet0/1', 'Ethernet0/2', 'Ethernet1/0'],
      running: [],
      startup: [],
      modeStack: [],
    };
    bootDevice(dev);
    run(dev, 'en', 'conf t', 'monitor session 2 source interface e0/1 both', 'monitor session 2 source interface e0/2 both');
    const text = serialize(dev.running);
    expect(text).toContain('monitor session 2 source interface Ethernet0/1,Ethernet0/2 both');
  });

  it('no komutu satiri siler', () => {
    const dev = makeRouter();
    run(dev, 'en', 'conf t', 'int e0/0', 'shutdown', 'no shutdown');
    expect(serialize(dev.running)).not.toContain('shutdown');
  });

  it('write startup-config kaydeder', () => {
    const dev = makeRouter();
    run(dev, 'en', 'conf t', 'hostname R1', 'int e0/0', 'description test', 'end', 'write');
    expect(serialize(dev.startup)).toContain('description test');
  });
});

describe('tab tamamlama', () => {
  it('tek aday tam kelimeye acilir', () => {
    const dev = makeRouter();
    run(dev, 'en');
    expect(completeInput(dev, 'conf')).toBe('configure ');
    run(dev, 'conf t');
    expect(completeInput(dev, 'flow exp')).toBe('flow exporter ');
    expect(completeInput(dev, 'ip sla sch')).toBe('ip sla schedule ');
  });

  it('coklu aday ortak on eke uzar, aday yoksa aynen kalir', () => {
    const dev = makeRouter();
    run(dev, 'en', 'conf t', 'ip sla 10');
    // icmp-echo tek aday
    expect(completeInput(dev, 'icm')).toBe('icmp-echo ');
    expect(completeInput(dev, 'zzz')).toBe('zzz');
  });

  it('do/no on ekleriyle calisir', () => {
    const dev = makeRouter();
    run(dev, 'en', 'conf t');
    expect(completeInput(dev, 'do wr')).toBe('do write ');
    run(dev, 'int e0/0');
    expect(completeInput(dev, 'no shut')).toBe('no shutdown ');
  });
});

describe('show komutlari', () => {
  it('show run | section', () => {
    const dev = makeRouter();
    run(dev, 'en', 'conf t', 'flow exporter EXP', 'destination 10.1.1.1', 'end');
    const out = execute(dev, 'show running-config | section flow').output;
    expect(out).toContain('flow exporter EXP');
    expect(out).toContain('destination 10.1.1.1');
    expect(out).not.toContain('interface Ethernet0/0');
  });

  it('show ip interface brief', () => {
    const dev = makeRouter();
    run(dev, 'en', 'conf t', 'int e0/0', 'ip add 10.10.1.2 255.255.255.0', 'end');
    const out = execute(dev, 'show ip int brief').output;
    expect(out).toContain('Ethernet0/0');
    expect(out).toContain('10.10.1.2');
  });

  it('show flow exporter state uzerinden uretilir', () => {
    const dev = makeRouter();
    run(dev, 'en', 'conf t', 'flow exporter EXP', 'destination 10.9.9.9', 'end');
    const out = execute(dev, 'show flow exporter').output;
    expect(out).toContain('Flow Exporter EXP:');
    expect(out).toContain('Destination IP address: 10.9.9.9');
  });
});

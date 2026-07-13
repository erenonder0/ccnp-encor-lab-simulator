import { describe, expect, it } from 'vitest';
import type { DeviceState } from '../ios/types';
import { bootDevice, execute } from '../ios/engine';
import { grade, type Grading } from '../grader/grade';

function router(cmds: string[]): DeviceState {
  const dev: DeviceState = {
    name: 'R1',
    type: 'ios-router',
    interfaces: ['Ethernet0/0'],
    running: [],
    startup: [],
    modeStack: [],
  };
  bootDevice(dev);
  for (const c of cmds) execute(dev, c);
  return dev;
}

const grading: Grading = {
  require_save: true,
  checks: [
    {
      task: 1,
      device: 'R1',
      points: 3,
      required: [{ path: ['flow exporter EXP'], line: 'destination 10.1.1.1' }],
      path_alias: 'exporter_name',
    },
  ],
  forbidden: [{ device: '*', regex: '^hostname (?!R1$)' }],
};

describe('grader', () => {
  it('dogru config tam puan + kayit uyarisi yok', () => {
    const dev = router(['en', 'conf t', 'flow exporter EXP', 'destination 10.1.1.1', 'end', 'write']);
    const r = grade(grading, new Map([['R1', dev]]));
    expect(r.score).toBe(3);
    expect(r.saved).toBe(true);
  });

  it('eksik config kismi puan + eksik satir raporu', () => {
    const dev = router(['en', 'conf t', 'flow exporter EXP', 'end', 'write']);
    const r = grade(grading, new Map([['R1', dev]]));
    expect(r.score).toBe(0);
    expect(r.tasks[0].lines[0].ok).toBe(false);
  });

  it('path_alias: farkli exporter adiyla da gecer', () => {
    const dev = router(['en', 'conf t', 'flow exporter BASKA', 'destination 10.1.1.1', 'end', 'write']);
    const r = grade(grading, new Map([['R1', dev]]));
    expect(r.score).toBe(3);
    expect(r.tasks[0].aliasUsed).toBe('BASKA');
  });

  it('write yapilmadiysa saved=false', () => {
    const dev = router(['en', 'conf t', 'flow exporter EXP', 'destination 10.1.1.1', 'end']);
    const r = grade(grading, new Map([['R1', dev]]));
    expect(r.saved).toBe(false);
    expect(r.unsaved_devices).toContain('R1');
  });

  it('forbidden: hostname degisikligi yakalanir', () => {
    const dev = router(['en', 'conf t', 'hostname HACKER', 'end', 'write']);
    const r = grade(grading, new Map([['R1', dev]]));
    expect(r.forbidden_violations.length).toBeGreaterThan(0);
  });

  it('yanlis blokta yazilan satir bulunur ve raporlanir', () => {
    const dev = router(['en', 'conf t', 'flow exporter EXP', 'exit', 'flow exporter YANLIS', 'destination 10.1.1.1', 'end', 'write']);
    const g: Grading = {
      checks: [{ task: 1, device: 'R1', points: 3, required: [{ path: ['flow exporter EXP'], line: 'destination 10.1.1.1' }] }],
    };
    const r = grade(g, new Map([['R1', dev]]));
    expect(r.tasks[0].lines[0].found).toContain('yanlis blokta');
  });
});

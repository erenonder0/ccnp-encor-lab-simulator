import { describe, expect, it } from 'vitest';
import { loadAllItems, replayAnswerKey } from '../replay';
import { grade } from '../grader/grade';

/**
 * Altin test: her item'in resmi cevap anahtari emulatorde hatasiz calismali
 * ve grader'dan TAM PUAN almali. Bu, hem emulator dilbilgisinin hem de
 * grading kurallarinin butun sorularla tutarli oldugunu garanti eder.
 */
describe('answer key replay — tum itemlar', () => {
  const items = loadAllItems();

  it('en az 1 item yuklu', () => {
    expect(items.length).toBeGreaterThan(0);
  });

  for (const item of items) {
    it(`item-${String(item.id).padStart(2, '0')}: cevap anahtari hatasiz + tam puan`, () => {
      const { devices, errors } = replayAnswerKey(item);
      expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);

      const report = grade(item.grading, devices);
      const detail = JSON.stringify(
        report.tasks.map((t) => ({ task: t.task, earned: t.earned, points: t.points, lines: t.lines })),
        null,
        2,
      );
      expect(report.score, detail).toBe(report.max);
      expect(report.forbidden_violations).toEqual([]);
      expect(report.saved).toBe(true);
    });
  }
});

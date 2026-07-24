/**
 * EWP-05 — Emit a frozen observational lab-compare sample JSON (Shadow only).
 */
import * as fs from 'fs';
import * as path from 'path';
import { buildOrToolsPlanningLabCompare } from './ortools-planning-lab-compare.util';
import { buildSolverProblemFromDayItems } from '../projection/build-solver-problem-from-day-items.util';

describe('ortools-planning-lab-compare.sample (EWP-05)', () => {
  it('writes sample artifact with shadowAuthority false', () => {
    const items = [
      {
        itemId: 'a1',
        startTime: new Date('2026-07-20T09:00:00.000Z'),
        endTime: new Date('2026-07-20T10:00:00.000Z'),
        travelFromPreviousDurationMin: 10,
      },
      {
        itemId: 'a2',
        startTime: new Date('2026-07-20T11:00:00.000Z'),
        endTime: new Date('2026-07-20T12:00:00.000Z'),
        travelFromPreviousDurationMin: 40,
      },
      {
        itemId: 'a3',
        startTime: new Date('2026-07-20T13:00:00.000Z'),
        endTime: new Date('2026-07-20T14:00:00.000Z'),
        travelFromPreviousDurationMin: 15,
      },
    ];
    const problem = buildSolverProblemFromDayItems({
      requestId: 'ewp05-sample',
      tripId: 'trip-ewp05-sample',
      planVersionId: '1',
      dayIndex: 1,
      items,
    })!;
    const report = buildOrToolsPlanningLabCompare({
      tripId: 'trip-ewp05-sample',
      dayIndex: 1,
      items,
      legacyChanges: [
        {
          operation: 'MOVE',
          itemId: 'a3',
          dayIndex: 1,
          startTime: '09:00',
          endTime: '10:00',
        },
        {
          operation: 'MOVE',
          itemId: 'a2',
          dayIndex: 1,
          startTime: '10:15',
          endTime: '11:15',
        },
        {
          operation: 'MOVE',
          itemId: 'a1',
          dayIndex: 1,
          startTime: '11:30',
          endTime: '12:30',
        },
      ],
      shadowChanges: [],
      shadowNodeOrder: ['depot', 'a1', 'a3', 'a2'],
      problem,
    });

    expect(report.shadowAuthority).toBe(false);
    expect(report.authoritativePromotion).toBe(false);

    const outDir = path.resolve(__dirname, '../../../../artifacts');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'ortools-planning-lab-compare.sample.json');
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    expect(fs.existsSync(outPath)).toBe(true);

    const evidenceDir = path.resolve(
      __dirname,
      '../../../../evidence/work-packages/EWP-05-ortools-shadow-metrics',
    );
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.copyFileSync(
      outPath,
      path.join(evidenceDir, 'ortools-planning-lab-compare.sample.json'),
    );
  });
});

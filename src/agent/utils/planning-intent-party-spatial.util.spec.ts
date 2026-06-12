import {
  buildPartyNegotiationPayload,
  buildSyntheticPartyProfiles,
  computePartyRegretUpperBound,
  extractPartySizeFromMessage,
} from './planning-intent-party.util';
import { evaluateSpatialIntentFeasibility } from './planning-intent-spatial.util';
import type { TripDaySnapshotForPlacement } from './route-and-run-intent-analyzer.util';

describe('planning-intent-party.util (D3)', () => {
  it('从「4 个人拼车」提取 party_size=4', () => {
    expect(extractPartySizeFromMessage('我们一共 4 个人拼车去独库公路')).toBe(4);
  });

  it('特种兵 vs 躺平 合成两极 pace profiles', () => {
    const profiles = buildSyntheticPartyProfiles({
      intakeMsg: '我想特种兵流，朋友想躺平流，一共 4 人',
      partySize: 4,
    });
    expect(profiles).toHaveLength(4);
    const intensive = profiles.filter((p) => p.pace === 'intensive');
    const relaxed = profiles.filter((p) => p.pace === 'relaxed');
    expect(intensive.length).toBe(2);
    expect(relaxed.length).toBe(2);
    expect(computePartyRegretUpperBound(profiles)).toBeGreaterThan(0.4);
  });

  it('Hold vs Proceed 风险分歧生成 branch_policies', () => {
    const query =
      '我极度重视安全，只要小雪就 Hold；搭子喜欢冒险 Proceed，能不能生成分歧点双分支？';
    const payload = buildPartyNegotiationPayload({ intakeMsg: query });
    expect(payload.branch_policies?.length).toBeGreaterThan(0);
    expect(payload.branch_policies![0].hold_route_token).toContain('hold');
    expect(payload.regret_upper_bound).toBeGreaterThan(0);
  });

  it('高遗憾 + trip snapshots 给出 nash_reorder_hint', () => {
    const snapshots: TripDaySnapshotForPlacement[] = [
      { dayNumber: 2, dateYmd: '2026-07-02', itemCount: 6, textBlob: '满' },
      { dayNumber: 5, dateYmd: '2026-07-05', itemCount: 1, textBlob: '空' },
    ];
    const payload = buildPartyNegotiationPayload({
      intakeMsg: '4 人拼车，特种兵和躺平分歧很大，遗憾度最低排期',
      tripDaySnapshots: snapshots,
    });
    expect(payload.nash_reorder_hint).toEqual(
      expect.objectContaining({ swap_day_a: 2, swap_day_b: 5 }),
    );
  });
});

describe('planning-intent-spatial.util (D4)', () => {
  const snapshots: TripDaySnapshotForPlacement[] = [
    { dayNumber: 4, dateYmd: '2026-07-04', itemCount: 6, textBlob: '黄金圈 6 项' },
    { dayNumber: 5, dateYmd: '2026-07-05', itemCount: 1, textBlob: '留白' },
  ];

  it('Day 4 满日程插入机位 → BLOCK + 建议 Day 5', () => {
    const report = evaluateSpatialIntentFeasibility({
      intakeMsg: '把这个山谷机位插进我现有的 Day 4 行程里合不合理？土路经常塌方',
      tripDaySnapshots: snapshots,
    });
    expect(report.target_day_number).toBe(4);
    expect(report.feasible).toBe(false);
    expect(report.conflicts.some((c) => c.type === 'TIME_WINDOW' && c.severity === 'BLOCK')).toBe(true);
    expect(report.suggested_day_number).toBe(5);
    expect(report.extra_drive_minutes_estimate).toBeGreaterThanOrEqual(40);
  });

  it('GPX 轨迹识别 attachment_type', () => {
    const report = evaluateSpatialIntentFeasibility({
      intakeMsg: '（GPX 越野轨迹）塞进 Day 5',
      tripDaySnapshots: snapshots,
    });
    expect(report.attachment_type).toBe('gpx');
    expect(report.feasible).toBe(true);
  });
});

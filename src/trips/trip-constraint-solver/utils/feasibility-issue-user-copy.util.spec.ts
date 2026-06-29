import type { FeasibilityIssueDto } from '../types/trip-constraint-solver.types';
import {
  buildFeasibilityIssueEvidenceLines,
  buildFeasibilityIssueUserExplanation,
  isLowQualityUserFacingText,
} from './feasibility-issue-user-copy.util';

describe('feasibility-issue-user-copy.util', () => {
  it('builds Chinese explanation from risk proofs (not metadata keys)', () => {
    const issue: FeasibilityIssueDto = {
      id: 'issue-closure',
      priority: 'must_handle',
      category: 'access_capacity',
      title: '路线封闭风险',
      message: 'F206 路段当前封闭，不建议继续原路线',
      severity: 'high',
      proofs: [
        {
          entity: 'F206',
          constraint: 'road_closure',
          currentFact: '封路段预计 18:00 前不可通行',
          evidenceSource: 'road_closure',
          conclusion: '不建议继续原路线',
          confidence: 0.9,
        },
      ],
    };
    const text = buildFeasibilityIssueUserExplanation(issue);
    expect(text).toContain('F206');
    expect(text).not.toMatch(/Place\.metadata/i);
    expect(text).not.toMatch(/综合判定/);
  });

  it('rejects low-quality English fragments', () => {
    expect(
      isLowQualityUserFacingText(
        "实时信息显示路线封闭或交通中断：'s road closure system is essential for any driver here.",
      ),
    ).toBe(true);
  });

  it('formats coverage gap in plain Chinese', () => {
    const issue: FeasibilityIssueDto = {
      id: 'issue-cov',
      priority: 'suggest_adjust',
      category: 'schedule',
      issueKind: 'coverage_gap',
      title: '第6天 · 众神瀑布',
      message: '第6天 · 众神瀑布：缺少证据覆盖',
      affectedDays: [6],
      severity: 'medium',
    };
    expect(buildFeasibilityIssueUserExplanation(issue)).toContain('第 6 天 · 众神瀑布');
    expect(buildFeasibilityIssueUserExplanation(issue)).not.toContain('Place.metadata');
  });

  it('ignores positive coverage proofs for pace issues', () => {
    const issue: FeasibilityIssueDto = {
      id: 'issue-pace-d1',
      priority: 'suggest_adjust',
      category: 'schedule',
      issueKind: 'schedule_pace',
      title: '第1天行程偏紧',
      message: '第1天安排 6 个景点，建议留出缓冲',
      affectedDays: [1],
      severity: 'medium',
      proofs: [
        {
          entity: '凯夫拉维克国际机场',
          placeLabel: '凯夫拉维克国际机场',
          constraint: 'POI 可执行性证据',
          currentFact: '凯夫拉维克国际机场 已具备 开放时间 证据',
          evidenceSource: 'Place.metadata.openingHours',
          conclusion: '证据覆盖充分',
        },
        {
          entity: 'Geysir租车公司',
          placeLabel: 'Geysir租车公司',
          constraint: 'POI 可执行性证据',
          currentFact: 'Geysir租车公司 已具备 道路状态 证据',
          evidenceSource: 'Place.metadata.roadStatus',
          conclusion: '证据覆盖充分',
        },
      ],
    };
    const text = buildFeasibilityIssueUserExplanation(issue);
    expect(text).toBe('第1天安排 6 个景点，建议减少 1 个景点或留出缓冲');
    expect(text).not.toContain('Place.metadata');
    expect(text).not.toContain('已具备');
    expect(buildFeasibilityIssueEvidenceLines(issue)).toEqual([text]);
  });
});

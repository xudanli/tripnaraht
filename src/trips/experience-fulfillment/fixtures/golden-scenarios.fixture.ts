/**
 * PRD §17 金测场景 — Round 1 协议验收夹具
 */

import type { VerificationStatus } from '../types/verification-result.types';

export interface GoldenScenarioDefinition {
  id: string;
  title: string;
  description: string;
  /** 用户自然语言输入或结构化触发 */
  userInput?: string;
  quickTags?: string[];
  tripContext?: {
    tripDays?: number;
    vehicleAccessClass?: '2WD' | '4WD';
    maxDailyDriveMinutes?: number;
  };
  expectedVerificationStatus: VerificationStatus | VerificationStatus[];
  expectedBehaviors: readonly string[];
  /** 关联 PRD 不变式 */
  invariants?: readonly ('PRESERVE_INTENT' | 'HARD_CONSTRAINT' | 'EVIDENCE_PROVENANCE')[];
}

export const GOLDEN_SCENARIOS: readonly GoldenScenarioDefinition[] = [
  {
    id: 'GS-01',
    title: '2WD 访问 F-road 候选',
    description: '候选级拦截，保留体验意图并替换',
    userInput: '2WD 去高地日落机位',
    tripContext: { vehicleAccessClass: '2WD' },
    expectedVerificationStatus: ['REPAIR_REQUIRED', 'BLOCKED'],
    expectedBehaviors: [
      'intercept_f_road_2wd',
      'preserve_remote_world_edge_intent',
      'emit_repair_contract_with_replacement_search',
    ],
    invariants: ['PRESERVE_INTENT', 'HARD_CONSTRAINT', 'EVIDENCE_PROVENANCE'],
  },
  {
    id: 'GS-02',
    title: '冬季选择关闭活动',
    description: '季节不可用 → BLOCKED',
    userInput: '冬天去内陆 F-road 高地',
    tripContext: { vehicleAccessClass: '4WD' },
    expectedVerificationStatus: 'BLOCKED',
    expectedBehaviors: ['seasonal_closure_blocked'],
    invariants: ['HARD_CONSTRAINT', 'EVIDENCE_PROVENANCE'],
  },
  {
    id: 'GS-03',
    title: '单点均可行但整天超时',
    description: '行程级 Repair',
    userInput: '南岸一天走完所有景点',
    tripContext: { maxDailyDriveMinutes: 180 },
    expectedVerificationStatus: 'REPAIR_REQUIRED',
    expectedBehaviors: ['day_level_repair', 'remove_flexible_items_first'],
    invariants: ['PRESERVE_INTENT'],
  },
  {
    id: 'GS-04',
    title: '用户必须冰川徒步',
    description: '修复时不可删除 MUST_PRESERVE',
    userInput: '7月冰岛8天，必须冰川徒步',
    expectedVerificationStatus: ['REPAIR_REQUIRED', 'PASS_WITH_WARNING'],
    expectedBehaviors: ['preserve_glacier_adventure_in_repair_contract'],
    invariants: ['PRESERVE_INTENT'],
  },
  {
    id: 'GS-05',
    title: '老人与年轻人体验冲突',
    description: '安全分流',
    userInput: '我想冰川徒步，父母不能走太久',
    expectedVerificationStatus: ['PASS', 'PASS_WITH_WARNING', 'REPAIR_REQUIRED'],
    expectedBehaviors: ['split_participants', 'reunion_point_verified'],
    invariants: ['PRESERVE_INTENT', 'HARD_CONSTRAINT'],
  },
  {
    id: 'GS-06',
    title: '低体力 + 世界尽头感',
    description: '推荐低步行替代点',
    userInput: '带父母拍世界尽头感的照片，少走路',
    quickTags: ['世界尽头', '少走路', '带父母'],
    expectedVerificationStatus: ['PASS', 'PASS_WITH_WARNING'],
    expectedBehaviors: ['low_effort_alternative_ranking'],
    invariants: ['PRESERVE_INTENT'],
  },
  {
    id: 'GS-07',
    title: '天气数据缺失',
    description: 'UNKNOWN，不允许伪装为 PASS',
    userInput: '明天去南岸黑沙滩',
    expectedVerificationStatus: 'UNKNOWN',
    expectedBehaviors: ['unknown_not_pass', 'conservative_fallback'],
    invariants: ['EVIDENCE_PROVENANCE'],
  },
  {
    id: 'GS-08',
    title: '体验评分高但证据弱',
    description: '降低排名并标记不确定',
    userInput: '小众世界尽头机位',
    expectedVerificationStatus: ['PASS_WITH_WARNING', 'UNKNOWN'],
    expectedBehaviors: ['lower_rank_weak_evidence', 'mark_uncertainty'],
    invariants: ['EVIDENCE_PROVENANCE'],
  },
  {
    id: 'GS-09',
    title: '行程过密破坏松弛感',
    description: '删除低优先级项',
    userInput: '8天不要太赶，松弛一点',
    quickTags: ['松弛'],
    expectedVerificationStatus: ['REPAIR_REQUIRED', 'PASS_WITH_WARNING'],
    expectedBehaviors: ['remove_low_priority_flexible', 'preserve_slow_travel'],
    invariants: ['PRESERVE_INTENT'],
  },
  {
    id: 'GS-10',
    title: '两轮修复仍失败',
    description: '请求用户做明确取舍',
    userInput: '环岛但每天驾驶不超过3小时，父母低强度',
    tripContext: { tripDays: 8, maxDailyDriveMinutes: 180 },
    expectedVerificationStatus: ['BLOCKED', 'REPAIR_REQUIRED'],
    expectedBehaviors: ['max_two_repair_rounds', 'user_decision_required'],
    invariants: ['PRESERVE_INTENT'],
  },
];

export function getGoldenScenario(id: string): GoldenScenarioDefinition | undefined {
  return GOLDEN_SCENARIOS.find((s) => s.id === id);
}

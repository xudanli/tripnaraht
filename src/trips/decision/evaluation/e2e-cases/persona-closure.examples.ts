/**
 * Persona closure loop — offline replay fixtures (P0 Phase 1).
 * Neptune REPLACE → Abu 重验；不依赖全链路 agent 启动。
 */
import type { E2ECase } from '../e2e-case.types';

const baseTrace = {
  schemaVersion: 'trace/v1' as const,
  metaDecisionAudit: 'persona-closure fixture trace/v1',
};

/** 冰岛 F208 封路：Neptune 绕行走封闭段，Abu 重验通过 */
export const personaClosureF208ReplaceCase: E2ECase = {
  id: 'persona-closure-f208-replace-001',
  name: 'Persona closure — 冰岛 F208 REPLACE + Abu 重验通过',
  description:
    'P0：F208 CLOSED 后 Neptune REPLACE 绕线；post_neptune Abu recheck ALLOW；stopReason=ABU_RECHECK_PASS。',
  input: {
    userProfile: {
      pacePreference: 'MEDIUM',
      riskTolerance: 'LOW',
      travelPhilosophy: 'nature-first',
      preferredRouteTypes: ['f-road', 'south-coast'],
    },
    season: 1,
    countryCode: 'IS',
    userQuery: '1 月冰岛南岸，原计划 F208 高地段，需绕开封闭路段',
  },
  expected: {
    abuExpected: { action: 'ALLOW', reasonCodes: ['ABU_GATE_PASS'] },
    neptuneExpected: { mustRepair: true, replacementTypes: ['SEGMENT'] },
    finalState: { allowed: true, planDays: 5 },
    traceSummary: baseTrace,
    timelineExpected: {
      orderedStages: ['ABU_GATE', 'SPATIAL_REPAIR', 'ABU_GATE'],
      requiredStages: ['FINALIZE'],
    },
    personaClosureExpected: {
      minAbuRechecks: 1,
      maxAbuRechecks: 2,
      allowedStopReasons: ['ABU_RECHECK_PASS'],
      forbiddenStopReasons: ['NEPTUNE_SHRINK_EXHAUSTED', 'ITER_LIMIT'],
      mustEmitAudit: true,
    },
  },
  metadata: {
    tags: ['iceland', 'persona-closure', 'f208', 'p0'],
    priority: 'P0',
    source: 'persona-closure-f208',
    fixtureKind: 'golden',
    personaClosureFixture: true,
  },
};

/** 挪威轮渡停航：Neptune REPLACE 绕行，Abu 重验通过（残余风险在 audit） */
export const personaClosureNorwayFerryCase: E2ECase = {
  id: 'persona-closure-norway-ferry-001',
  name: 'Persona closure — 挪威轮渡停航 REPLACE + Abu 重验通过',
  description:
    'P0：Geiranger 轮渡 SUSPENDED → Neptune REPLACE 老鹰之路绕行；Abu 重验 ALLOW（需冬季胎证据场景另案）。',
  input: {
    userProfile: {
      pacePreference: 'MEDIUM',
      riskTolerance: 'MEDIUM',
      travelPhilosophy: 'scenic-drive',
      preferredRouteTypes: ['fjord', 'detour'],
    },
    season: 5,
    countryCode: 'NO',
    userQuery: '5 月峡湾段轮渡停航，需要 REPLACE 绕行并守住日光窗',
  },
  expected: {
    abuExpected: { action: 'ALLOW' },
    drdreExpected: { mustAdjust: true, adjustmentTypes: ['ADJUST_PACE'] },
    neptuneExpected: { mustRepair: true, replacementTypes: ['SEGMENT'] },
    finalState: { allowed: true, planDays: 6 },
    traceSummary: baseTrace,
    timelineExpected: {
      orderedStages: ['ABU_GATE', 'PACE_ADJUST', 'SPATIAL_REPAIR', 'ABU_GATE'],
    },
    personaClosureExpected: {
      minAbuRechecks: 1,
      allowedStopReasons: ['ABU_RECHECK_PASS'],
      mustEmitAudit: true,
    },
  },
  metadata: {
    tags: ['norway', 'persona-closure', 'ferry', 'p0'],
    priority: 'P0',
    source: 'persona-closure-norway-ferry',
    fixtureKind: 'golden',
    personaClosureFixture: true,
  },
};

/** F 路 + 未指定 2WD：Neptune REPLACE 触发 Abu 新 HARD，收缩耗尽 */
export const personaClosureFroad2wdCase: E2ECase = {
  id: 'persona-closure-froad-2wd-001',
  name: 'Persona closure — F 路 REPLACE 后 Abu 重验失败',
  description:
    'P0：Neptune REPLACE 引入 F 路合规 HARD；Abu post_recheck REJECT；stopReason=NEPTUNE_SHRINK_EXHAUSTED。',
  input: {
    userProfile: {
      pacePreference: 'FAST',
      riskTolerance: 'HIGH',
      travelPhilosophy: 'highland-drive',
      preferredRouteTypes: ['f-road', 'highlands'],
    },
    season: 7,
    countryCode: 'IS',
    userQuery: '环岛高速节奏，未指定两驱四驱，Neptune 补丁仍触 F 路 HARD',
  },
  expected: {
    abuExpected: { action: 'REJECT' },
    neptuneExpected: { mustRepair: true, replacementTypes: ['SEGMENT'] },
    finalState: { allowed: false },
    traceSummary: baseTrace,
    timelineExpected: {
      orderedStages: ['ABU_GATE', 'SPATIAL_REPAIR', 'ABU_GATE'],
    },
    personaClosureExpected: {
      minAbuRechecks: 1,
      allowedStopReasons: ['NEPTUNE_SHRINK_EXHAUSTED', 'ITER_LIMIT', 'ABU_FATAL_REJECT'],
      forbiddenStopReasons: ['ABU_RECHECK_PASS'],
      mustEmitAudit: true,
    },
  },
  metadata: {
    tags: ['iceland', 'persona-closure', 'froad', '2wd', 'p0'],
    priority: 'P0',
    source: 'persona-closure-froad-2wd',
    fixtureKind: 'golden',
    personaClosureFixture: true,
  },
};

export const PERSONA_CLOSURE_REPLAY_FIXTURES = [
  personaClosureF208ReplaceCase,
  personaClosureNorwayFerryCase,
  personaClosureFroad2wdCase,
] as const;

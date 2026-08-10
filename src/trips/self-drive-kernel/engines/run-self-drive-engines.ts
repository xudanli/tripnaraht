/**
 * 编排六 Engine（纯函数）— 输入 SelfDriveContext，不按国家分叉决策逻辑。
 */
import type { SelfDriveContext } from '../contracts/self-drive-context.types';
import {
  SELF_DRIVE_ENGINES_SCHEMA,
  type DrivingLoadEngineResult,
  type ExecutabilityVerdict,
  type RecoveryAction,
  type RecoveryEngineResult,
  type RouteExecutabilityEngineResult,
  type RuntimeMonitorEngineResult,
  type SelfDriveEnginesResult,
} from '../contracts/self-drive-engines.types';
import { assessKernelVehicleRoadFit } from './assess-kernel-vehicle-road-fit';

function worseVerdict(a: ExecutabilityVerdict, b: ExecutabilityVerdict): ExecutabilityVerdict {
  const rank: Record<ExecutabilityVerdict, number> = {
    ALLOW: 0,
    NEED_CONFIRM: 1,
    SUGGEST_REPLACE: 2,
    BLOCK: 3,
  };
  return rank[a] >= rank[b] ? a : b;
}

function assessDrivingLoad(ctx: SelfDriveContext): DrivingLoadEngineResult {
  const segs = ctx.route.segments;
  const distanceKm = segs.reduce((sum, s) => sum + (s.distanceKmHint ?? 0), 0) || undefined;
  const factors = new Set<string>();
  for (const s of ctx.route.criticalSegments) {
    for (const r of s.criticalReasons) factors.add(r);
  }
  if (ctx.environment.requiresAltitudeAcclimatization) factors.add('ALTITUDE');
  if (ctx.environment.seasonWindowIds?.length) factors.add('SEASONAL');

  // 粗估：高速 ~70km/h；有山路/高地因子降至 ~45km/h
  const hard =
    factors.has('ALTITUDE') ||
    factors.has('F_ROAD') ||
    factors.has('FORD') ||
    factors.has('NOTES_HAZARD');
  const speed = hard ? 45 : 70;
  const expectedDurationMin =
    distanceKm != null ? Math.round((distanceKm / speed) * 60) : undefined;

  let tier: DrivingLoadEngineResult['tier'] = 'LOW';
  if ((distanceKm ?? 0) >= 450 || factors.size >= 4) tier = 'EXTREME';
  else if ((distanceKm ?? 0) >= 320 || factors.size >= 3) tier = 'HIGH';
  else if ((distanceKm ?? 0) >= 200 || factors.size >= 1) tier = 'MEDIUM';

  const difficulty = tier;
  const factorList = [...factors];
  const detailZh =
    distanceKm != null
      ? `今日约 ${distanceKm} km` +
        (expectedDurationMin != null ? ` · 估 ${expectedDurationMin} 分钟` : '') +
        (factorList.length ? ` · 难度因子 ${factorList.slice(0, 3).join('、')}` : '')
      : factorList.length
        ? `难度因子：${factorList.slice(0, 4).join('、')}`
        : '今日驾驶负荷正常';

  return {
    tier,
    distanceKm,
    expectedDurationMin,
    difficulty,
    difficultyFactors: factorList,
    detailZh,
  };
}

function assessExecutability(
  ctx: SelfDriveContext,
  fit: ReturnType<typeof assessKernelVehicleRoadFit>,
  load: DrivingLoadEngineResult,
): RouteExecutabilityEngineResult {
  let verdict: ExecutabilityVerdict = fit.gate;
  const drivers = [...fit.reasons];

  if (load.tier === 'EXTREME') {
    verdict = worseVerdict(verdict, 'NEED_CONFIRM');
    drivers.push('EXTREME_DRIVE_LOAD');
  } else if (load.tier === 'HIGH') {
    verdict = worseVerdict(verdict, 'NEED_CONFIRM');
    drivers.push('HIGH_DRIVE_LOAD');
  }

  if (ctx.regulations.checkpointLikely) {
    verdict = worseVerdict(verdict, 'NEED_CONFIRM');
    drivers.push('CHECKPOINT');
  }

  // PARTIAL 路况不得单独抬到 BLOCK（已在 fit 处理）；有 BLOCK advisory 才强化
  for (const a of ctx.advisories) {
    if (a.severity === 'BLOCK') {
      verdict = worseVerdict(verdict, 'BLOCK');
      drivers.push(`ADVISORY_${a.type}`);
    }
  }

  const detailZh =
    verdict === 'ALLOW'
      ? '今天可以按原计划执行'
      : verdict === 'NEED_CONFIRM'
        ? '今天可执行，但有事项需确认后再出发'
        : verdict === 'SUGGEST_REPLACE'
          ? '建议调整路线或日程后再执行'
          : '当前不建议按原计划继续执行';

  return { verdict, detailZh, drivers: [...new Set(drivers)] };
}

function assessRuntimeMonitor(ctx: SelfDriveContext): RuntimeMonitorEngineResult {
  const signals: Array<{ code: string; detailZh: string }> = [];
  for (const ev of ctx.roadEvidence) {
    if (ev.status !== 'OPEN' && ev.status !== 'UNKNOWN') {
      signals.push({
        code: `ROAD_${ev.status}`,
        detailZh: ev.reasonZh || `路况 ${ev.status}（${ev.freshness}）`,
      });
    }
    if (ev.freshness === 'STALE' || ev.freshness === 'EXPIRED') {
      signals.push({
        code: `EVIDENCE_${ev.freshness}`,
        detailZh: '路况证据偏旧，建议刷新后再决策',
      });
    }
  }
  if (ctx.environment.seasonWindowIds?.length) {
    signals.push({
      code: 'SEASON_WINDOW',
      detailZh: `季节窗：${ctx.environment.seasonWindowIds.slice(0, 2).join('、')}`,
    });
  }

  const hard = signals.some((s) => s.code.startsWith('ROAD_CLOSED'));
  const soft = signals.length > 0;
  return {
    changeDetected: soft,
    impactLevel: hard ? 'HARD' : soft ? 'SOFT' : 'NONE',
    signals: signals.slice(0, 6),
  };
}

function assessRecovery(
  executability: RouteExecutabilityEngineResult,
  load: DrivingLoadEngineResult,
  fit: ReturnType<typeof assessKernelVehicleRoadFit>,
): RecoveryEngineResult {
  const actions: RecoveryEngineResult['recommendedActions'] = [];

  if (executability.verdict === 'ALLOW') {
    return { recommendedActions: [] };
  }

  if (fit.reason === 'VEHICLE_ROAD_MISMATCH') {
    actions.push({
      action: 'REROUTE',
      titleZh: '改走适配车型的路线',
      detailZh: fit.detailZh,
    });
    actions.push({
      action: 'CHANGE_STOP',
      titleZh: '调整途经高地/非铺装站点',
    });
  }

  if (
    executability.drivers.includes('ROAD_CLOSED') ||
    executability.drivers.includes('ROAD_CLOSED_DEGRADED_EVIDENCE')
  ) {
    actions.push({
      action: 'REROUTE',
      titleZh: '绕行封闭路段',
    });
    actions.push({
      action: 'CHANGE_HOTEL',
      titleZh: '提前住宿，避开风险路段',
    });
  }

  if (load.tier === 'HIGH' || load.tier === 'EXTREME') {
    actions.push({
      action: 'SHORTEN',
      titleZh: '缩短今日驾驶',
      detailZh: load.detailZh,
    });
    actions.push({
      action: 'DEPART_EARLIER',
      titleZh: '更早出发',
    });
  }

  if (executability.drivers.includes('CHECKPOINT')) {
    actions.push({
      action: 'NEED_CONFIRM',
      titleZh: '出发前核验证件与检查站要求',
    });
  }

  if (executability.verdict === 'BLOCK') {
    actions.push({
      action: 'STOP_DRIVING',
      titleZh: '暂停按原计划驾驶',
      detailZh: '先处理阻断项再继续',
    });
  }

  if (!actions.length) {
    actions.push({
      action: 'NEED_CONFIRM' as RecoveryAction,
      titleZh: '确认今日计划后再出发',
    });
  }

  // 去重 action
  const seen = new Set<string>();
  return {
    recommendedActions: actions.filter((a) => {
      if (seen.has(a.action)) return false;
      seen.add(a.action);
      return true;
    }).slice(0, 5),
  };
}

export function runSelfDriveEngines(ctx: SelfDriveContext): SelfDriveEnginesResult {
  const vehicleRoadFit = assessKernelVehicleRoadFit(ctx);
  const drivingLoad = assessDrivingLoad(ctx);
  const executability = assessExecutability(ctx, vehicleRoadFit, drivingLoad);
  const runtimeMonitor = assessRuntimeMonitor(ctx);
  const recovery = assessRecovery(executability, drivingLoad, vehicleRoadFit);

  return {
    schemaId: SELF_DRIVE_ENGINES_SCHEMA,
    evaluatedAt: new Date().toISOString(),
    routeUnderstanding: ctx.route,
    vehicleRoadFit,
    executability,
    drivingLoad,
    runtimeMonitor,
    recovery,
    advisories: ctx.advisories,
  };
}

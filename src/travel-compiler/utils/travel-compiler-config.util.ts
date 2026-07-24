import type { ConfigService } from '@nestjs/config';

export function isTravelCompilerEnabled(
  config?: ConfigService,
  requestFlag?: boolean,
): boolean {
  if (requestFlag === true) return true;
  if (requestFlag === false) return false;
  const raw =
    config?.get<string>('TRAVEL_COMPILER_ENABLED') ??
    process.env.TRAVEL_COMPILER_ENABLED ??
    'false';
  return String(raw).trim().toLowerCase() === 'true';
}

export function isTravelCompilerStrict(config?: ConfigService): boolean {
  const raw =
    config?.get<string>('TRAVEL_COMPILER_STRICT') ??
    process.env.TRAVEL_COMPILER_STRICT ??
    'false';
  return String(raw).trim().toLowerCase() === 'true';
}

/** Phase D：VERIFY 使用 Graph 投影 Itinerary 作为 SSOT（默认开启） */
export function isTravelCompilerVerifySsotEnabled(config?: ConfigService): boolean {
  const raw =
    config?.get<string>('TRAVEL_COMPILER_VERIFY_SSOT') ??
    process.env.TRAVEL_COMPILER_VERIFY_SSOT ??
    'true';
  return String(raw).trim().toLowerCase() !== 'false';
}

/**
 * Phase D：VERIFY 通过后，将 Graph 投影写入 TripDay/ItineraryItem（RFC001 写链）。
 * 默认关；可与 RFC001_ITINERARY_MATERIALIZE 一并开启。
 */
export function isTravelCompilerMaterializeEnabled(config?: ConfigService): boolean {
  const explicit =
    config?.get<string>('TRAVEL_COMPILER_MATERIALIZE') ??
    process.env.TRAVEL_COMPILER_MATERIALIZE;
  if (explicit !== undefined && explicit !== null && String(explicit).trim() !== '') {
    return String(explicit).trim().toLowerCase() === 'true';
  }
  const rfc =
    config?.get<string>('RFC001_ITINERARY_MATERIALIZE') ??
    process.env.RFC001_ITINERARY_MATERIALIZE ??
    'false';
  return String(rfc).trim().toLowerCase() === 'true';
}

/** REPAIR 后增量 re-compile（默认开启） */
export function isTravelCompilerIncrementalRepairEnabled(config?: ConfigService): boolean {
  const raw =
    config?.get<string>('TRAVEL_COMPILER_INCREMENTAL_REPAIR') ??
    process.env.TRAVEL_COMPILER_INCREMENTAL_REPAIR ??
    'true';
  return String(raw).trim().toLowerCase() !== 'false';
}

/** Planning Workbench：VERIFY 发现 CONFLICT 后自动 Kernel REPAIR（默认开启） */
export function isWorkbenchVerifyRepairEnabled(config?: ConfigService): boolean {
  const raw =
    config?.get<string>('PLANNING_WORKBENCH_VERIFY_REPAIR') ??
    process.env.PLANNING_WORKBENCH_VERIFY_REPAIR ??
    'true';
  return String(raw).trim().toLowerCase() !== 'false';
}

/** Planning Workbench VERIFY⇄REPAIR 最大修复轮次（默认 2，可用 DECISION_MAX_REPAIR_COUNT 覆盖） */
export function getWorkbenchVerifyRepairMaxIterations(config?: ConfigService): number {
  const explicit =
    config?.get<string>('PLANNING_WORKBENCH_VERIFY_REPAIR_MAX_ITERATIONS') ??
    process.env.PLANNING_WORKBENCH_VERIFY_REPAIR_MAX_ITERATIONS;
  if (explicit !== undefined && explicit !== null && String(explicit).trim() !== '') {
    const n = Number.parseInt(String(explicit).trim(), 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const shared =
    config?.get<string>('DECISION_MAX_REPAIR_COUNT') ?? process.env.DECISION_MAX_REPAIR_COUNT;
  if (shared !== undefined && shared !== null && String(shared).trim() !== '') {
    const n = Number.parseInt(String(shared).trim(), 10);
    if (Number.isFinite(n) && n >= 0) return Math.min(n, 3);
  }
  return 2;
}

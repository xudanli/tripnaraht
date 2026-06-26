/** 行中执行阶段 feature flags */

export function isInTripExecutionEnabled(): boolean {
  return process.env.IN_TRIP_EXECUTION_ENABLED === 'true';
}

export function isInTripStrictHandoff(): boolean {
  return process.env.IN_TRIP_STRICT_HANDOFF === 'true';
}

export function isInTripEnvironmentMonitorEnabled(): boolean {
  return process.env.IN_TRIP_ENVIRONMENT_MONITOR_ENABLED === 'true';
}

export function isInTripMoneyBrainEnabled(): boolean {
  return (
    process.env.IN_TRIP_MONEY_BRAIN_ENABLED === 'true' ||
    isInTripExecutionEnabled()
  );
}

export function isInTripExperienceLoopEnabled(): boolean {
  return (
    process.env.IN_TRIP_EXPERIENCE_LOOP_ENABLED === 'true' ||
    isInTripExecutionEnabled()
  );
}

/** 默认冰岛；后续按目的地配置 */
export function defaultTripTimezone(_destination?: string): string {
  return process.env.IN_TRIP_DEFAULT_TIMEZONE ?? 'Atlantic/Reykjavik';
}

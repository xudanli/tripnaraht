/**
 * P3 — module cleanup status for ops / flags.
 */

export interface P3ModuleCleanupStatus {
  phase: 'P3';
  archivedOrphans: string[];
  unregisteredCronsRemoved: string[];
  jobQueueDecision: 'DEFER_BULL';
  jobQueueRationale: string[];
  namingMap: Array<{ name: string; path: string; role: string }>;
  keepAppOrphanModules: string[];
  doc: string;
}

export function resolveP3ModuleCleanupStatus(): P3ModuleCleanupStatus {
  return {
    phase: 'P3',
    archivedOrphans: [
      'archives/p3-orphans/cron',
      'archives/p3-orphans/tasks',
      'archives/p3-orphans/trip-templates',
      'archives/p3-orphans/skills-world/weather-sync.cron.ts',
    ],
    unregisteredCronsRemoved: [
      'SyncWeatherCron',
      'SyncRoadStatusCron',
      'WeatherSyncCronService',
      'MatchLearningScheduler.@Cron',
      'ApprovalCleanupScheduler.@Cron (already disabled)',
    ],
    jobQueueDecision: 'DEFER_BULL',
    jobQueueRationale: [
      'No Bull/BullMQ in deps; ScheduleModule + RuntimeEventOutbox cover current needs',
      'Revisit when multi-instance cron singleton, DLQ, or backlog SLA requires it',
    ],
    namingMap: [
      {
        name: 'DecisionRuntimeModule',
        path: 'src/decision-runtime',
        role: 'Gate1 ops / write-chain / P1-P2 storage',
      },
      {
        name: 'GuardianDecisionCoreModule',
        path: 'src/trips/guardian-decision-core',
        role: 'RFC-001 evaluate/finalize/PlanVersion',
      },
      {
        name: 'DecisionModule',
        path: 'src/trips/decision',
        role: 'Trip-local decision OS / V1.5',
      },
      {
        name: 'DecisionKernelModule',
        path: 'src/agent (kernel)',
        role: 'Agent DSO + VERIFY',
      },
    ],
    keepAppOrphanModules: [
      'CgusReplayModule',
      'HarnessEvalCliModule',
      'MatchSquareModule',
      'MatchLearningModule',
      'ToTEvaluatorModule',
      'ReasoningModule',
      'AttentionShadowStagingReplayModule',
      'SemanticValidationModule',
    ],
    doc: 'src/decision-runtime/P3_MODULE_CLEANUP.md',
  };
}

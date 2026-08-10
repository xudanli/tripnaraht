/**
 * Self-Drive Kernel (K1)
 * @see internal-docs/architecture/ADR-SELF-DRIVE-KERNEL.md
 */

export * from './contracts/destination-self-drive-capabilities.types';
export * from './contracts/drive-advisory.types';
export * from './contracts/road-status-evidence.types';
export * from './contracts/self-drive-context.types';
export {
  resolveDestinationPackId,
  resolveDestinationSelfDriveCapabilities,
  clearDestinationSelfDriveCapabilitiesCache,
} from './capabilities/resolve-destination-self-drive-capabilities';
export {
  buildRouteUnderstandingFromSkeleton,
} from './route/build-route-understanding-from-skeleton';
export {
  pickClassicDaySkeletonVariant,
  listClassicDaySkeletonVariants,
  clearClassicDaySkeletonCache,
} from './route/load-classic-day-skeleton';
export {
  buildSelfDriveContext,
  type BuildSelfDriveContextInput,
} from './builders/build-self-drive-context';
export { projectPackAdvisories } from './builders/project-pack-advisories';
export {
  normalizeRoadStatusEvidence,
  mapRoadStatusToAccessStatus,
  unknownRoadStatusEvidence,
} from './evidence/normalize-road-status-evidence';
export {
  buildContextRoadEvidence,
  roadEvidenceToEvidenceRefs,
} from './evidence/build-context-road-evidence';
export * from './contracts/self-drive-engines.types';
export { assessKernelVehicleRoadFit } from './engines/assess-kernel-vehicle-road-fit';
export { runSelfDriveEngines } from './engines/run-self-drive-engines';
export {
  projectSelfDriveDailyDrive,
  SELF_DRIVE_DAILY_DRIVE_SCHEMA,
  type SelfDriveDailyDriveProjection,
} from './projectors/project-self-drive-daily-drive';
export { SelfDriveKernelService } from './services/self-drive-kernel.service';
export { SelfDriveKernelModule } from './self-drive-kernel.module';

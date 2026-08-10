import {
  formatDateRangeLabel,
  formatDurationLabel,
  formatRegionSummary,
  formatTransferLabel,
} from '../dictionaries/iceland-self-drive.dictionaries';
import type {
  IcelandSelfDriveGeneratedRoute,
  IcelandSelfDriveTripMetadata,
  IcelandSelfDriveWizardInput,
} from '../types/iceland-self-drive.types';

export function buildGeneratedRoute(
  wizard: IcelandSelfDriveWizardInput,
  regionSummary?: string,
): IcelandSelfDriveGeneratedRoute {
  const endCode = wizard.endSameAsStart
    ? wizard.startLocationCode
    : wizard.endLocationCode;

  return {
    summaryTitle: '初始路线已生成',
    summarySubtitle: '你可以先预览，再决定要不要调整',
    regionSummary: regionSummary ?? formatRegionSummary(wizard.regionIds),
    durationLabel: formatDurationLabel(
      wizard.dateRange.startDate,
      wizard.dateRange.endDate,
    ),
    dateRangeLabel: formatDateRangeLabel(
      wizard.dateRange.startDate,
      wizard.dateRange.endDate,
    ),
    transferLabel: formatTransferLabel(
      wizard.startLocationCode,
      endCode,
      wizard.endSameAsStart,
    ),
    travelerLabel: `${wizard.travelerCount}人同行`,
  };
}

export function readIcelandSelfDriveMetadata(
  raw: unknown,
): IcelandSelfDriveTripMetadata | null {
  if (!raw || typeof raw !== 'object') return null;
  const meta = raw as Record<string, unknown>;
  const isd = meta.icelandSelfDrive;
  if (!isd || typeof isd !== 'object') return null;
  return isd as IcelandSelfDriveTripMetadata;
}

export function readTripVersion(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return 1;
  const v = (raw as Record<string, unknown>).tripVersion;
  return typeof v === 'number' && v > 0 ? v : 1;
}

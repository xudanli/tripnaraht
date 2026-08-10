/**
 * 从 Trip.metadata + 协作者数解析 participants / team.memberCapability。
 */

export type RorParticipantProfile = {
  travelerCount: number;
  collaboratorCount: number;
  hasChildren: boolean;
  hasElderly: boolean;
  fitnessProfile?: string | null;
  experienceLevel?: string | null;
  partyTags: string[];
  source: 'ISD_WIZARD' | 'TRIP_METADATA' | 'COLLABORATORS' | 'MIXED';
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

/**
 * 组装团队/成员观察事实（无画像库时的确定性摘要）。
 */
export function extractTeamFactsFromTripMeta(input: {
  metadata?: unknown;
  collaboratorCount?: number | null;
}): {
  participants: RorParticipantProfile;
  'team.memberCapability': {
    travelerCount: number;
    fitnessProfile?: string | null;
    experienceLevel?: string | null;
    tags: string[];
    source: RorParticipantProfile['source'];
  };
} {
  const root = asRecord(input.metadata) ?? {};
  const isd = asRecord(root.icelandSelfDrive);
  const wizard = asRecord(isd?.wizard);
  const party = asRecord(root.party) ?? asRecord(root.travelersParty);
  const driving = asRecord(isd?.drivingSettings);
  const drivers = Array.isArray(driving?.drivers) ? driving!.drivers : [];

  const collabCount = Math.max(0, Number(input.collaboratorCount) || 0);

  let travelerCount = 0;
  if (typeof wizard?.travelerCount === 'number' && wizard.travelerCount > 0) {
    travelerCount = wizard.travelerCount;
  } else if (Array.isArray(root.travelers) && root.travelers.length > 0) {
    travelerCount = root.travelers.length;
  } else if (typeof party?.count === 'number' && party.count > 0) {
    travelerCount = party.count;
  } else if (typeof party?.passengerCount === 'number' && party.passengerCount > 0) {
    travelerCount = party.passengerCount;
  } else if (typeof party?.travelerCount === 'number' && party.travelerCount > 0) {
    travelerCount = party.travelerCount;
  } else {
    travelerCount = Math.max(collabCount, 1);
  }

  const hasChildren =
    party?.hasChildren === true ||
    root.hasChildren === true ||
    wizard?.hasChildren === true;
  const hasElderly =
    party?.hasElderly === true ||
    root.hasElderly === true ||
    wizard?.hasElderly === true;

  const fitnessProfile =
    (typeof party?.fitnessProfile === 'string' && party.fitnessProfile) ||
    (typeof root.fitnessProfile === 'string' && root.fitnessProfile) ||
    null;

  const primaryDriver = drivers.find((d) => d && typeof d === 'object') as
    | Record<string, unknown>
    | undefined;
  const experienceLevel =
    (typeof primaryDriver?.experienceLevel === 'string' &&
      primaryDriver.experienceLevel) ||
    (typeof root.driverExperience === 'string' && root.driverExperience) ||
    null;

  const partyTags: string[] = ['ADULTS'];
  if (hasChildren) partyTags.push('CHILDREN');
  if (hasElderly) partyTags.push('ELDERLY');
  if (fitnessProfile) partyTags.push(`FITNESS:${fitnessProfile}`);
  if (experienceLevel) partyTags.push(`DRIVER:${experienceLevel}`);

  let source: RorParticipantProfile['source'] = 'COLLABORATORS';
  if (wizard?.travelerCount != null || fitnessProfile || hasChildren || hasElderly) {
    source = isd ? 'ISD_WIZARD' : 'TRIP_METADATA';
    if (collabCount > 0) source = 'MIXED';
  } else if (party || Array.isArray(root.travelers)) {
    source = 'TRIP_METADATA';
  }

  const participants: RorParticipantProfile = {
    travelerCount,
    collaboratorCount: collabCount,
    hasChildren,
    hasElderly,
    fitnessProfile,
    experienceLevel,
    partyTags,
    source,
  };

  return {
    participants,
    'team.memberCapability': {
      travelerCount,
      fitnessProfile,
      experienceLevel,
      tags: partyTags,
      source,
    },
  };
}

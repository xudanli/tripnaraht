import type {
  CountryProfileV2DrivingRules,
  DrivingSide,
  RoadSurfaceForEta,
} from '../types/country-profile-v2.types';

export interface DrivingEtaPenaltyCoefficients {
  gravelRoad: number;
  fRoad: number;
  mountainPassRoad: number;
  winterBlackIceRoad: number;
}

const DEFAULT_ETA: DrivingEtaPenaltyCoefficients = {
  gravelRoad: 1.0,
  fRoad: 1.0,
  mountainPassRoad: 1.0,
  winterBlackIceRoad: 1.0,
};

export interface ComputeRouteEtaModifierInput {
  complianceInfo: unknown;
  roadSurfaces?: RoadSurfaceForEta[];
  /** 用户习惯舵（默认 RIGHT，中国驾照用户） */
  userHabitDrivingSide?: DrivingSide;
}

/**
 * 从 CountryProfile.complianceInfo 读取路段惩罚系数（IS/NZ 等同 Schema）。
 */
export function getDrivingEtaPenaltyCoefficients(
  complianceInfo: unknown,
): DrivingEtaPenaltyCoefficients {
  if (!complianceInfo || typeof complianceInfo !== 'object') {
    return { ...DEFAULT_ETA };
  }
  const driving = (complianceInfo as { drivingRules?: CountryProfileV2DrivingRules })
    .drivingRules;
  const coeffs = driving?.speedLimits?.algorithmEtaPenaltyCoefficients;
  if (!coeffs) return { ...DEFAULT_ETA };
  return {
    gravelRoad: coeffs.gravelRoad ?? DEFAULT_ETA.gravelRoad,
    fRoad: coeffs.fRoad ?? DEFAULT_ETA.fRoad,
    mountainPassRoad: coeffs.mountainPassRoad ?? DEFAULT_ETA.mountainPassRoad,
    winterBlackIceRoad: coeffs.winterBlackIceRoad ?? DEFAULT_ETA.winterBlackIceRoad,
  };
}

export function getDestinationDrivingSide(complianceInfo: unknown): DrivingSide | undefined {
  if (!complianceInfo || typeof complianceInfo !== 'object') return undefined;
  return (complianceInfo as { drivingRules?: CountryProfileV2DrivingRules }).drivingRules
    ?.drivingSide;
}

export function getLeftHandDrivingEtaBuffer(complianceInfo: unknown): number {
  if (!complianceInfo || typeof complianceInfo !== 'object') return 0;
  const buf = (complianceInfo as { drivingRules?: CountryProfileV2DrivingRules }).drivingRules
    ?.leftHandDrivingEtaBuffer;
  return typeof buf === 'number' && buf > 0 ? buf : 0;
}

function coefficientForSurface(
  surface: RoadSurfaceForEta,
  coeffs: DrivingEtaPenaltyCoefficients,
): number {
  switch (surface) {
    case 'GRAVEL':
      return coeffs.gravelRoad;
    case 'F_ROAD':
      return coeffs.fRoad;
    case 'MOUNTAIN_PASS':
      return coeffs.mountainPassRoad;
    case 'WINTER_BLACK_ICE':
      return coeffs.winterBlackIceRoad;
    case 'ASPHALT':
    default:
      return 1.0;
  }
}

/**
 * 合成 ETA 乘数：左舵习惯缓冲 × 各路段类型系数（多段取最大惩罚，避免重复叠乘过度）。
 */
export function computeRouteEtaModifier(input: ComputeRouteEtaModifierInput): number {
  const coeffs = getDrivingEtaPenaltyCoefficients(input.complianceInfo);
  let modifier = 1.0;

  const destSide = getDestinationDrivingSide(input.complianceInfo);
  const userSide = input.userHabitDrivingSide ?? 'RIGHT';
  if (destSide && destSide !== userSide) {
    modifier += getLeftHandDrivingEtaBuffer(input.complianceInfo) || 0.15;
  }

  const surfaces = input.roadSurfaces?.length ? input.roadSurfaces : [];
  let roadPenalty = 1.0;
  for (const s of surfaces) {
    roadPenalty = Math.max(roadPenalty, coefficientForSurface(s, coeffs));
  }
  modifier *= roadPenalty;

  return modifier;
}

export function applyEtaPenaltyMinutes(
  baseMinutes: number,
  opts: {
    gravelRoad?: boolean;
    fRoad?: boolean;
    mountainPass?: boolean;
    winterBlackIce?: boolean;
  },
  coeffs: DrivingEtaPenaltyCoefficients,
): number {
  let m = baseMinutes;
  if (opts.gravelRoad && coeffs.gravelRoad > 1) m *= coeffs.gravelRoad;
  if (opts.fRoad && coeffs.fRoad > 1) m *= coeffs.fRoad;
  if (opts.mountainPass && coeffs.mountainPassRoad > 1) m *= coeffs.mountainPassRoad;
  if (opts.winterBlackIce && coeffs.winterBlackIceRoad > 1) m *= coeffs.winterBlackIceRoad;
  return Math.round(m);
}

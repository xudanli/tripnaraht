/**
 * 中国经典自驾：模板建行程时写入自驾标记 + 段距离阈值 seed + drivingContext。
 */
import { mergeSeededTripConstraints } from '../../trip-constraint-solver/utils/segment-distance-threshold.util';
import {
  buildCnDrivingContext,
  toCnDrivingContextMetadataProjection,
} from './cn-driving-context.util';
import { resolveCnDrivingThresholdPackCode } from './cn-driving-threshold-pack.util';

export const CHINA_CLASSIC_SELF_DRIVE_PRODUCT_LINE = 'china_classic_self_drive';

function isCarLikeTransport(transport?: string | null): boolean {
  const t = (transport ?? '').trim().toLowerCase();
  return (
    !t ||
    t === 'car' ||
    t === 'self_drive' ||
    t === 'self-drive' ||
    t === 'driving' ||
    t === 'rental'
  );
}

/**
 * 就地 enrich Trip.metadata（及可选 pacing 标记）。
 * 返回是否写入了自驾相关字段。
 */
export function enrichCnClassicSelfDriveTripMetadata(input: {
  destination: string;
  metadata: Record<string, unknown>;
  classicRouteId?: string | null;
  transport?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  cityHints?: Array<string | null | undefined> | null;
}): boolean {
  const destination = (input.destination ?? '').trim().toUpperCase();
  const classicRouteId =
    typeof input.classicRouteId === 'string' && input.classicRouteId.trim()
      ? input.classicRouteId.trim()
      : typeof input.metadata.classicRouteId === 'string'
        ? String(input.metadata.classicRouteId).trim()
        : null;

  const selfDrive =
    Boolean(classicRouteId) || isCarLikeTransport(input.transport);

  if (selfDrive) {
    if (typeof input.metadata.isSelfDrive !== 'boolean') {
      input.metadata.isSelfDrive = true;
    }
    if (!input.metadata.travelMode) {
      input.metadata.travelMode = 'self_drive';
    }
  }

  if (destination === 'CN' && classicRouteId) {
    if (!input.metadata.classicRouteId) {
      input.metadata.classicRouteId = classicRouteId;
    }
    if (!input.metadata.productLine) {
      input.metadata.productLine = CHINA_CLASSIC_SELF_DRIVE_PRODUCT_LINE;
    }
  }

  const thresholdPack = resolveCnDrivingThresholdPackCode({
    destination,
    classicRouteId,
  });
  // CN / IS / 子 pack：有 drivingSegmentThresholds 时 seed；用户已设 max 则跳过
  mergeSeededTripConstraints(thresholdPack, input.metadata);

  if (destination === 'CN' && (classicRouteId || selfDrive)) {
    const ctx = buildCnDrivingContext({
      classicRouteId,
      startDate: input.startDate,
      endDate: input.endDate,
      cityHints: input.cityHints,
    });
    input.metadata.drivingContext =
      toCnDrivingContextMetadataProjection(ctx);
  }

  return selfDrive || Boolean(classicRouteId);
}

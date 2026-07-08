import type { PrismaService } from '../../../prisma/prisma.service';
import {
  haversineKm,
  loadPlaceCoordinatesBatch,
} from './attraction-explore-place-coordinates.util';

const ORIGIN_LABELS: Record<string, string> = {
  KEF: '凯夫拉维克机场 (KEF)',
  kef: '凯夫拉维克机场 (KEF)',
  REK: '雷克雅未克',
  reykjavik: '雷克雅未克',
};

function formatOriginLabel(raw: string): string {
  const trimmed = raw.trim();
  return ORIGIN_LABELS[trimmed] ?? ORIGIN_LABELS[trimmed.toUpperCase()] ?? trimmed;
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function readRentalContext(metadata: Record<string, unknown>): Record<string, unknown> | undefined {
  const explorationInput = metadata.explorationInput as Record<string, unknown> | undefined;
  return explorationInput?.rentalContext as Record<string, unknown> | undefined;
}

export async function resolveAttractionExploreOrigin(
  prisma: PrismaService,
  trip: { destination: string; metadata: unknown },
): Promise<string | null> {
  const metadata = (trip.metadata as Record<string, unknown> | null) ?? {};
  const explorationInput = metadata.explorationInput as Record<string, unknown> | undefined;
  const rental = readRentalContext(metadata);
  const travelContext = metadata.travelContext as Record<string, unknown> | undefined;

  const direct =
    pickString(
      rental?.pickupLocation,
      metadata.origin,
      metadata.departureCity,
      explorationInput?.origin,
      explorationInput?.departureCity,
      travelContext?.origin,
      metadata.destinationLabel,
    ) ?? null;

  if (direct) return formatOriginLabel(direct);

  const scenarioId = metadata.explorationScenarioId;
  if (typeof scenarioId === 'string') {
    const scenario = await prisma.explorationScenario.findUnique({
      where: { id: scenarioId },
      select: { initialInput: true, researchProtocolId: true },
    });
    const initialInput = scenario?.initialInput as Record<string, unknown> | undefined;
    const scenarioRental = initialInput?.rentalContext as Record<string, unknown> | undefined;
    const fromScenario = pickString(scenarioRental?.pickupLocation);
    if (fromScenario) return formatOriginLabel(fromScenario);

    if (scenario?.researchProtocolId === 'iceland-discovery-v1') {
      return formatOriginLabel('KEF');
    }
  }

  if (trip.destination?.toUpperCase() === 'IS') {
    return formatOriginLabel('KEF');
  }

  return null;
}

function readRouteDetailTotalKm(routeDetail: unknown): number | null {
  if (!routeDetail || typeof routeDetail !== 'object') return null;
  const totalKm = (routeDetail as { totalKm?: unknown }).totalKm;
  return typeof totalKm === 'number' && totalKm > 0 ? Math.round(totalKm) : null;
}

export async function computeAttractionExploreRouteSpanKm(
  prisma: PrismaService,
  tripId: string,
  metadata: Record<string, unknown>,
): Promise<number | null> {
  const cached = metadata.routeSpanKm ?? metadata.explorationRouteSpanKm;
  if (typeof cached === 'number' && cached > 0) return Math.round(cached);

  const scenarioId = metadata.explorationScenarioId;
  if (typeof scenarioId === 'string') {
    const selected = await prisma.explorationRouteVariant.findFirst({
      where: { scenarioId, status: 'SELECTED' },
      select: { routeDetail: true },
    });
    const fromSelected = readRouteDetailTotalKm(selected?.routeDetail);
    if (fromSelected != null) return fromSelected;

    const fallbackVariant = await prisma.explorationRouteVariant.findFirst({
      where: { scenarioId },
      orderBy: { createdAt: 'asc' },
      select: { routeDetail: true },
    });
    const fromFallback = readRouteDetailTotalKm(fallbackVariant?.routeDetail);
    if (fromFallback != null) return fromFallback;
  }

  const candidates = await prisma.tripAttractionExploreCandidate.findMany({
    where: { tripId },
    orderBy: { sortOrder: 'asc' },
    select: { placeId: true },
  });
  if (candidates.length < 2) return null;

  const coordsMap = await loadPlaceCoordinatesBatch(
    prisma,
    candidates.map((row) => row.placeId),
  );
  const ordered = candidates
    .map((row) => coordsMap.get(row.placeId))
    .filter((coords): coords is NonNullable<typeof coords> => Boolean(coords));

  if (ordered.length >= 2) {
    let pathKm = 0;
    for (let i = 1; i < ordered.length; i++) {
      pathKm += haversineKm(
        ordered[i - 1]!.lat,
        ordered[i - 1]!.lng,
        ordered[i]!.lat,
        ordered[i]!.lng,
      );
    }
    if (pathKm > 0) return Math.round(pathKm);

    const lats = ordered.map((c) => c.lat);
    const lngs = ordered.map((c) => c.lng);
    return Math.round(
      haversineKm(
        Math.min(...lats),
        Math.min(...lngs),
        Math.max(...lats),
        Math.max(...lngs),
      ),
    );
  }

  return null;
}

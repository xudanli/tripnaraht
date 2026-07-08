import type { PrismaService } from '../../../prisma/prisma.service';
import type { CausalRuntimeSessionService } from '../../causal-runtime/causal-runtime-session.service';
import { analyzeIcelandSelfDriveLeg } from '../../causal-runtime/domains/iceland-causal-bridge';
import type { IcelandSelfDriveCausalOutput } from '../../causal-runtime/domains/iceland-self-drive-causal.types';
import { isIcelandDestination } from '../../causal-runtime/domains/trip-world-state-iceland-causal.util';
import type { PlanningCausalChainNode } from '../types/planning-causal-chain.types';
import { projectCausalChainFromIcelandAssessment } from './planning-causal-chain.projection.util';

export interface WorldContextConflictHint {
  message?: string;
  travelMinutes?: number;
  travelTimeMinutes?: number;
  affectedScopeSummary?: string;
}

export async function loadWorldContextCausalNodes(input: {
  tripId: string;
  prisma: PrismaService;
  causalSession?: CausalRuntimeSessionService;
  primaryConflict?: WorldContextConflictHint;
}): Promise<PlanningCausalChainNode[]> {
  const fromSession = input.causalSession?.getForTrip(input.tripId)?.state.signals
    .icelandSelfDriveCausalAssessment;
  if (fromSession) {
    return projectCausalChainFromIcelandAssessment(fromSession);
  }

  const assessment = await buildIcelandAssessmentFromTripConflict(input);
  return assessment ? projectCausalChainFromIcelandAssessment(assessment) : [];
}

async function buildIcelandAssessmentFromTripConflict(input: {
  tripId: string;
  prisma: PrismaService;
  primaryConflict?: WorldContextConflictHint;
}): Promise<IcelandSelfDriveCausalOutput | undefined> {
  const trip = await input.prisma.trip.findUnique({
    where: { id: input.tripId },
    select: { destination: true, metadata: true },
  });
  if (!trip || !isIcelandDestination(trip.destination ?? undefined)) {
    return undefined;
  }

  const conflict = input.primaryConflict;
  const message = conflict?.message ?? conflict?.affectedScopeSummary ?? '';
  const distanceKm = parseDistanceKm(message) ?? 40;
  const durationMinutes =
    conflict?.travelMinutes ??
    conflict?.travelTimeMinutes ??
    parseDurationMinutes(message) ??
    46;
  const routeLabel =
    conflict?.affectedScopeSummary?.trim() ||
    extractRouteLabel(message) ||
    `${trip.destination ?? '冰岛'} 路段`;
  const windMps = extractWindMpsFromMetadata(trip.metadata) ?? 12;
  const appointmentSlackMinutes = Math.max(5, 30 - Math.max(0, durationMinutes - 40));

  return analyzeIcelandSelfDriveLeg({
    routeLabel,
    distanceKm,
    durationMinutes,
    windMps,
    appointmentSlackMinutes,
    region: inferRegionFromDestination(trip.destination ?? ''),
  });
}

function parseDistanceKm(text: string): number | undefined {
  const m = text.match(/([\d.]+)\s*km/i);
  return m ? Number(m[1]) : undefined;
}

function parseDurationMinutes(text: string): number | undefined {
  const m = text.match(/([\d.]+)\s*分钟/);
  return m ? Number(m[1]) : undefined;
}

function extractRouteLabel(text: string): string | undefined {
  const arrow = text.match(/([^·→]+→[^（(]+)/);
  return arrow?.[1]?.trim();
}

function extractWindMpsFromMetadata(metadata: unknown): number | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const wx = (metadata as Record<string, unknown>).weatherByDate;
  if (!wx || typeof wx !== 'object') return undefined;
  for (const day of Object.values(wx as Record<string, unknown>)) {
    if (!day || typeof day !== 'object') continue;
    const row = day as Record<string, unknown>;
    const wind =
      row.windMps ?? row.windSpeedMs ?? row.maxWindMps ?? row.windSpeed;
    if (typeof wind === 'number' && Number.isFinite(wind)) return wind;
  }
  return undefined;
}

function inferRegionFromDestination(destination: string): string {
  const d = destination.toLowerCase();
  if (d.includes('vik') || d.includes('南岸')) return 'vik';
  if (d.includes('hofn') || d.includes('赫本')) return 'hofn';
  if (d.includes('reykjavik') || d.includes('雷克雅未克')) return 'reykjavik';
  return 'south_coast';
}

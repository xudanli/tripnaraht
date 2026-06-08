import type { MatchSquareRecruitmentPost, MatchSquareTravelIntent } from '@prisma/client';
import type { MatchableProfile } from '../../odyssey-intake/engine/companion-matching.engine';
import { computeRecruitmentCompatibility } from '../util/recruitment-compatibility.util';
import type { CaptainPersonaSnapshot, CaptainRadarPickView, TeamworkStyle } from '../types/match-square.types';
import { buildApplicationMatchInsights } from './application-insights.engine';

const RADAR_THRESHOLD = 85;

function parseSnapshot(raw: unknown): CaptainPersonaSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as CaptainPersonaSnapshot;
}

function destinationOverlaps(postDestination: string, intentScope: string): boolean {
  const a = postDestination.toLowerCase();
  const b = intentScope.toLowerCase();
  return a.includes(b) || b.includes(a) || a.split(/[·\s,，/]+/).some((part) => part && b.includes(part));
}

function datesOverlap(
  postStart: Date,
  postEnd: Date,
  intentStart: Date,
  intentEnd: Date,
): boolean {
  return postEnd >= intentStart && intentEnd >= postStart;
}

export function scoreTravelIntentForPost(
  post: MatchSquareRecruitmentPost,
  intent: MatchSquareTravelIntent,
  captainSnapshot: CaptainPersonaSnapshot,
): CaptainRadarPickView | null {
  if (intent.userId === post.captainUserId) return null;
  if (intent.status !== 'active') return null;
  if (!destinationOverlaps(post.destination, intent.destinationScope)) return null;
  if (!datesOverlap(post.startDate, post.endDate, intent.startDate, intent.endDate)) return null;

  const inviteeSnapshot = parseSnapshot(intent.personaSnapshot);
  if (!inviteeSnapshot) return null;

  const inviteeProfile: MatchableProfile = {
    userId: intent.userId,
    mbtiType: inviteeSnapshot.mbtiType,
    cardTitle: inviteeSnapshot.cardTitle,
    rawScores: inviteeSnapshot.rawScores,
    dimensionPercents: inviteeSnapshot.dimensionPercents,
    destination: intent.destinationScope,
    startDate: intent.startDate.toISOString().slice(0, 10),
    endDate: intent.endDate.toISOString().slice(0, 10),
  };

  const teamworkStyle = (post.planningStyle as TeamworkStyle | null) ?? null;
  const match = computeRecruitmentCompatibility(teamworkStyle, captainSnapshot, inviteeProfile);
  if (match.teamworkMatchBlocked || match.compatibilityPercent == null) return null;
  if (match.compatibilityPercent < RADAR_THRESHOLD) return null;

  const insights = buildApplicationMatchInsights(captainSnapshot, inviteeSnapshot, teamworkStyle);
  const capabilityTags = Array.isArray(intent.capabilityTags)
    ? (intent.capabilityTags as string[])
    : [];

  return {
    userId: intent.userId,
    displayName: inviteeSnapshot.cardTitle,
    cardTitle: inviteeSnapshot.cardTitle,
    destinationScope: intent.destinationScope,
    compatibilityPercent: match.compatibilityPercent,
    capabilityTags,
    highlights: insights.highlights.slice(0, 3),
    departureLabel: null,
  };
}

export function rankCaptainRadarPicks(
  post: MatchSquareRecruitmentPost,
  intents: MatchSquareTravelIntent[],
  limit = 10,
): CaptainRadarPickView[] {
  const captainSnapshot = parseSnapshot(post.captainPersonaSnapshot);
  if (!captainSnapshot) return [];

  const picks: CaptainRadarPickView[] = [];
  for (const intent of intents) {
    const pick = scoreTravelIntentForPost(post, intent, captainSnapshot);
    if (pick) picks.push(pick);
  }

  return picks
    .sort((a, b) => b.compatibilityPercent - a.compatibilityPercent)
    .slice(0, limit);
}

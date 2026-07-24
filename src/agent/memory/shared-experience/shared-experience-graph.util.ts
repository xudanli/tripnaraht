/**
 * P2 SharedExperienceGraph — L2 WDMA + L4 TripFeedback 跨 Trip 回忆投影（只读）。
 */

import type { AgentMemoryContext } from '../interfaces/agent-memory-context.interface';
import type { TripFeedbackSnapshot } from '../interfaces/agent-memory-context.interface';
import type { DecisionMemory } from '../decision-memory/decision-memory.types';
import type { SharedMilestoneAnchor } from '../../narrator/types/emotional-context.type';

export const SHARED_EXPERIENCE_GRAPH_SCHEMA_V1 = 'tripnara.shared_experience_graph@v1' as const;

export interface SharedExperienceGraph {
  schemaVersion: typeof SHARED_EXPERIENCE_GRAPH_SCHEMA_V1;
  anchors: SharedMilestoneAnchor[];
  /** 参与投影的记忆层（audit / DPO） */
  sourceLayers: string[];
}

const WIND_SIGNAL_RE = /WIND|STORM|F_ROAD|F-ROAD|SIGNAL|OFFLINE|失联|无信号/i;

function anchorKey(a: SharedMilestoneAnchor): string {
  return `${a.pastTripId}:${a.legacyPreferenceToken}`;
}

function mapDecisionMemoryToAnchor(
  wd: DecisionMemory,
  currentTripId: string,
): SharedMilestoneAnchor | null {
  const isWeather = wd.decisionType === 'weather_reroute';
  const isRisk = wd.decisionType === 'risk_block';
  if (!isWeather && !isRisk) return null;

  const rationale = wd.rationale.join(' ');
  const inputs = wd.inputs;
  const tags = Array.isArray(inputs.tags) ? (inputs.tags as string[]) : [];
  const blob = `${rationale} ${JSON.stringify(inputs)} ${tags.join(' ')}`;
  const hasWindEvidence = WIND_SIGNAL_RE.test(blob);

  if (!hasWindEvidence && wd.outcome === 'accepted') return null;

  const locationName =
    (typeof inputs.locationName === 'string' && inputs.locationName) ||
    (typeof inputs.region === 'string' && inputs.region) ||
    (typeof inputs.to_region === 'string' && inputs.to_region) ||
    'unknown';

  const pastTripId =
    (typeof inputs.tripId === 'string' && inputs.tripId) ||
    (typeof inputs.trip_id === 'string' && inputs.trip_id) ||
    currentTripId;

  if (pastTripId === currentTripId) return null;

  const legacyPreferenceToken = hasWindEvidence
    ? 'EXPERIENCED_HIGH_ANXIETY_IN_WIND'
    : 'PREFERS_QUIET_CORNER';

  let emotionalPolarity: SharedMilestoneAnchor['emotionalPolarity'] = 'NEUTRAL';
  if (wd.outcome === 'accepted') emotionalPolarity = 'POSITIVE_HIGH';
  else if (wd.outcome === 'rejected' || wd.outcome === 'failed') {
    emotionalPolarity = 'NEGATIVE_TRAUMA';
  }

  return { pastTripId, locationName, legacyPreferenceToken, emotionalPolarity };
}

function mapTripFeedbackToAnchor(
  fb: TripFeedbackSnapshot,
  currentTripId: string,
): SharedMilestoneAnchor | null {
  if (fb.tripId === currentTripId) return null;

  const tagBlob = fb.primaryTags.join(' ');
  if (WIND_SIGNAL_RE.test(tagBlob) || (fb.abandoned && fb.satisfactionScore <= 2)) {
    return {
      pastTripId: fb.tripId,
      locationName: inferLocationLabelFromTags(fb.primaryTags) ?? '上次行程',
      legacyPreferenceToken: WIND_SIGNAL_RE.test(tagBlob)
        ? 'EXPERIENCED_SIGNAL_BLACKOUT'
        : 'EXPERIENCED_TRIP_STRESS',
      emotionalPolarity: 'NEGATIVE_TRAUMA',
    };
  }

  if (fb.overallSuccess && fb.satisfactionScore >= 4 && !fb.abandoned) {
    return {
      pastTripId: fb.tripId,
      locationName: inferLocationLabelFromTags(fb.primaryTags) ?? '上次行程高光',
      legacyPreferenceToken: 'POSITIVE_TRAVEL_HIGHLIGHT',
      emotionalPolarity: 'POSITIVE_HIGH',
    };
  }

  if (fb.fatigueLevel === 'HIGH') {
    return {
      pastTripId: fb.tripId,
      locationName: '上次行程',
      legacyPreferenceToken: 'PREFERS_SLOW_PACE',
      emotionalPolarity: 'NEUTRAL',
    };
  }

  return null;
}

function inferLocationLabelFromTags(tags: readonly string[]): string | undefined {
  for (const t of tags) {
    if (/[\u4e00-\u9fff]/.test(t) && t.length >= 2 && t.length <= 24) return t;
    if (/westfjords|iceland|独库|西峡湾|ring road/i.test(t)) return t;
  }
  return undefined;
}

export function projectSharedExperienceGraph(
  agentMemory: AgentMemoryContext | null | undefined,
  currentTripId: string,
  cap = 6,
): SharedExperienceGraph {
  const sourceLayers: string[] = [];
  const seen = new Set<string>();
  const anchors: SharedMilestoneAnchor[] = [];

  const push = (a: SharedMilestoneAnchor | null) => {
    if (!a) return;
    const k = anchorKey(a);
    if (seen.has(k)) return;
    seen.add(k);
    anchors.push(a);
  };

  if (agentMemory?.recentWorldDecisions?.length) {
    sourceLayers.push('L2_WDMA');
    for (const wd of agentMemory.recentWorldDecisions) {
      push(mapDecisionMemoryToAnchor(wd, currentTripId));
    }
  }

  if (agentMemory?.recentTripFeedbacks?.length) {
    sourceLayers.push('L4_TRIP_FEEDBACK');
    for (const fb of agentMemory.recentTripFeedbacks) {
      push(mapTripFeedbackToAnchor(fb, currentTripId));
    }
  }

  return {
    schemaVersion: SHARED_EXPERIENCE_GRAPH_SCHEMA_V1,
    anchors: anchors.slice(0, cap),
    sourceLayers,
  };
}

/** NARRATE 消费：SharedExperienceGraph → sharedMilestones */
export function sharedMilestonesFromExperienceGraph(
  graph: SharedExperienceGraph | null | undefined,
): SharedMilestoneAnchor[] {
  return graph?.anchors ?? [];
}

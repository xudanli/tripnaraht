/** M10 Split Orchestrator — 分组活动类型 */

export type SplitSessionStatus = 'proposed' | 'active' | 'reunited' | 'cancelled';

export type SharedNodeType = 'meal' | 'meeting_point';

export interface SplitGroupRouteItem {
  id: string;
  title: string;
  type: string;
  startTime?: string;
  estimatedDurationMin?: number;
}

export interface SplitPartyGroup {
  groupId: string;
  label: string;
  memberIds: string[];
  route: SplitGroupRouteItem[];
  staminaFit: 'high' | 'medium' | 'low';
  lastLocation?: { lat: number; lng: number; updatedAt: string };
}

export interface SharedNode {
  nodeId: string;
  type: SharedNodeType;
  title: string;
  time: string;
  location?: string;
  participantScope: 'all';
}

export interface SplitCostRouting {
  defaultRule: 'group_aa' | 'full_trip_aa';
  sharedNodeRule: 'full_trip_aa';
}

export interface ProposeSplitInput {
  triggerReason?: string;
  forceSolo?: boolean;
}

export interface SplitPartySessionSummary {
  id: string;
  tripId: string;
  dayNumber: number;
  triggerReason: string;
  status: SplitSessionStatus;
  groupCount: number;
  sharedNodeCount: number;
  proposedAt: string;
  executedAt: string | null;
}

export interface SplitPartySessionDetail extends SplitPartySessionSummary {
  groups: SplitPartyGroup[];
  sharedNodes: SharedNode[];
  costRouting: SplitCostRouting;
  experienceSharing: Array<{ groupId: string; text: string; sharedAt: string }>;
  reunion: { status: string; meetingPoint?: string; updatedAt?: string } | null;
  satisfaction: Record<string, number> | null;
}

export interface ShareExperienceInput {
  groupId: string;
  text: string;
}

export interface ReunionUpdateInput {
  status: 'en_route' | 'arrived' | 'completed';
  meetingPoint?: string;
}

export interface LocationHeartbeatInput {
  groupId: string;
  lat: number;
  lng: number;
}

export interface ActiveSplitContext {
  sessionId: string;
  dayNumber: number;
  groups: SplitPartyGroup[];
  sharedNodes: SharedNode[];
  allMemberIds: string[];
}

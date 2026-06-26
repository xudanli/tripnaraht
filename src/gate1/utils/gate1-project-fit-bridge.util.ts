import { Gate1Project } from '@prisma/client';

type ListingRef = {
  id: string;
  tripId: string | null;
  gate1ProjectId: string | null;
  title: string;
};

export function buildPortalPath(token: string): string {
  return `/participant/projects/${token}/dashboard`;
}

export function buildInvitePath(token: string): string {
  return `/participant/invites/${token}`;
}

export function resolveGate1ProjectQuery(listing: ListingRef): {
  byId?: string;
  byLinkedTripId?: string;
} | null {
  if (listing.gate1ProjectId) {
    return { byId: listing.gate1ProjectId };
  }
  if (listing.tripId) {
    return { byLinkedTripId: listing.tripId };
  }
  return null;
}

export function shouldEnrollPortalStatus(applicationStatus: string): boolean {
  return ['JOINED', 'USER_CONFIRMED'].includes(applicationStatus);
}

export function mapFitEnrollmentParticipantStatus(applicationStatus: string): string {
  if (applicationStatus === 'JOINED') return 'JOINED';
  return 'JOINED';
}

export type PortalEnrollmentResult = {
  enrolled: boolean;
  reason?: string;
  participantId?: string;
  inviteToken?: string;
  portalPath?: string;
  gate1ProjectId?: string;
  alreadyEnrolled?: boolean;
};

export function summarizeEnrollmentForApplication(
  participant: { id: string; inviteToken: string; status: string } | null,
  project: Pick<Gate1Project, 'id' | 'title'> | null,
): {
  portalEnrolled: boolean;
  participantPortal?: {
    participantId: string;
    inviteToken: string;
    portalPath: string;
    projectId: string;
    projectTitle: string;
    status: string;
  };
} {
  if (!participant || !project) {
    return { portalEnrolled: false };
  }
  return {
    portalEnrolled: true,
    participantPortal: {
      participantId: participant.id,
      inviteToken: participant.inviteToken,
      portalPath: buildPortalPath(participant.inviteToken),
      projectId: project.id,
      projectTitle: project.title,
      status: participant.status,
    },
  };
}

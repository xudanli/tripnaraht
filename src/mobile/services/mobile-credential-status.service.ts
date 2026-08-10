import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InTripAccessService } from '../../trips/in-trip-execution/services/in-trip-access.service';
import {
  ORGANIZER_CREDENTIAL_TYPES,
  type CredentialStatusItemStatus,
  type MemberCredentialStatusResponseDto,
} from '../dto/mobile-credential-documents.dto';
import { MobileCredentialDocumentsService } from './mobile-credential-documents.service';

@Injectable()
export class MobileCredentialStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: InTripAccessService,
    private readonly documents: MobileCredentialDocumentsService,
  ) {}

  async getMemberCredentialStatus(
    requesterUserId: string,
    tripId: string,
    memberId: string,
  ): Promise<MemberCredentialStatusResponseDto> {
    await this.access.assertOrganizer(tripId, requesterUserId);

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { TripCollaborator: true },
    });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);

    const ownerId = (trip.metadata as { userId?: string } | null)?.userId;
    const isMember =
      trip.TripCollaborator.some((c) => c.userId === memberId) || ownerId === memberId;
    if (!isMember) {
      throw new ForbiddenException('目标成员不属于该行程');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: memberId },
      select: { displayName: true },
    });

    const docTypes = ORGANIZER_CREDENTIAL_TYPES.filter(
      (t) => t !== 'additional_driver_registration',
    );
    const statusMap = await this.documents.getStatusByTypes(memberId, docTypes);
    const items: MemberCredentialStatusResponseDto['items'] = docTypes.map((type) => ({
      type,
      status: mapDocStatus(statusMap.get(type)),
    }));
    items.push({
      type: 'additional_driver_registration',
      status: deriveAdditionalDriverRegistration(trip.metadata, memberId),
    });

    return {
      memberId,
      displayName: user?.displayName ?? null,
      items,
    };
  }
}

function mapDocStatus(status: string | undefined): CredentialStatusItemStatus {
  if (!status) return 'missing';
  if (status === 'verified' || status === 'completed') return status;
  if (status === 'pending') return 'pending';
  if (status === 'not_applicable') return 'not_applicable';
  if (status === 'missing' || status === 'rejected' || status === 'expired') {
    return status === 'missing' ? 'missing' : 'pending';
  }
  return 'pending';
}

/**
 * Lightweight metadata walk — avoids pulling the full iceland-self-drive util chain
 * (still stashed / not on this branch). Same outcome as before for organizer status cards.
 */
function deriveAdditionalDriverRegistration(
  metadata: unknown,
  memberId: string,
): CredentialStatusItemStatus {
  try {
    const root = metadata as Record<string, unknown> | null;
    const isd =
      (root?.icelandSelfDrive as Record<string, unknown> | undefined) ??
      (root?.iceland_self_drive as Record<string, unknown> | undefined) ??
      root;
    const drivingSettings = isd?.drivingSettings as Record<string, unknown> | undefined;
    const drivers = drivingSettings?.drivers as Record<string, unknown> | undefined;
    const candidates = Array.isArray(drivers?.candidates) ? drivers.candidates : [];
    const candidate = candidates.find(
      (c) =>
        c &&
        typeof c === 'object' &&
        (c as { memberId?: string }).memberId === memberId,
    ) as { isAdditionalDriver?: boolean } | undefined;
    if (!candidate) return 'not_applicable';
    if (candidate.isAdditionalDriver) return 'pending';
    return 'not_applicable';
  } catch {
    return 'not_applicable';
  }
}

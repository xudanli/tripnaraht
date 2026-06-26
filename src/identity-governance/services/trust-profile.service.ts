import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QualificationService } from './qualification.service';
import { EndorsementService } from './endorsement.service';
import { ReputationEventService } from './reputation-event.service';

export type PublicTrustProfile = {
  subjectType: 'USER' | 'ORGANIZATION';
  subjectId: string;
  displayName: string | null;
  verification: Record<string, boolean>;
  professional: {
    isVerifiedProfessional: boolean;
    verifiedAt: string | null;
    bio: string | null;
    destinations: string[];
    yearsOfExperience: number | null;
  } | null;
  agency: {
    isVerifiedAgency: boolean;
    verifiedAt: string | null;
    displayName: string | null;
    legalName: string | null;
  } | null;
  qualifications: Awaited<ReturnType<QualificationService['listVerifiedForSubject']>>;
  endorsements: Awaited<ReturnType<EndorsementService['listForSubject']>>;
  reputationFacts: Awaited<ReturnType<ReputationEventService['getFactsSummary']>>['facts'];
};

@Injectable()
export class TrustProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qualification: QualificationService,
    private readonly endorsement: EndorsementService,
    private readonly reputation: ReputationEventService,
  ) {}

  async getPublicUserProfile(userId: string): Promise<PublicTrustProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true },
    });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const [verifications, profile, certification, qualifications, endorsements, reputation] =
      await Promise.all([
        this.prisma.userVerification.findMany({ where: { userId } }),
        this.prisma.professionalProfile.findUnique({ where: { userId } }),
        this.prisma.professionalCertification.findFirst({
          where: { userId },
          orderBy: { updatedAt: 'desc' },
        }),
        this.qualification.listVerifiedForSubject('USER', userId),
        this.endorsement.listForSubject('USER', userId),
        this.reputation.getFactsSummary('USER', userId),
      ]);

    const isVerifiedProfessional = certification?.status === 'VERIFIED';

    return {
      subjectType: 'USER',
      subjectId: userId,
      displayName: user.displayName,
      verification: this.buildVerificationFlags(verifications),
      professional: {
        isVerifiedProfessional,
        verifiedAt: certification?.verifiedAt?.toISOString() ?? null,
        bio: isVerifiedProfessional ? profile?.bio ?? null : null,
        destinations: isVerifiedProfessional ? profile?.destinations ?? [] : [],
        yearsOfExperience: isVerifiedProfessional ? profile?.yearsOfExperience ?? null : null,
      },
      agency: null,
      qualifications,
      endorsements,
      reputationFacts: reputation.facts,
    };
  }

  async getPublicOrganizationProfile(organizationId: string): Promise<PublicTrustProfile> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException('机构不存在');
    }

    const certification = await this.prisma.agencyCertification.findFirst({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
    });
    const isVerifiedAgency = certification?.status === 'VERIFIED';

    const [qualifications, endorsements, reputation] = await Promise.all([
      this.qualification.listVerifiedForSubject('ORGANIZATION', organizationId),
      this.endorsement.listForSubject('ORGANIZATION', organizationId),
      this.reputation.getFactsSummary('ORGANIZATION', organizationId),
    ]);

    return {
      subjectType: 'ORGANIZATION',
      subjectId: organizationId,
      displayName: organization.displayName,
      verification: {},
      professional: null,
      agency: {
        isVerifiedAgency,
        verifiedAt: certification?.verifiedAt?.toISOString() ?? null,
        displayName: organization.displayName,
        legalName: isVerifiedAgency ? organization.legalName : null,
      },
      qualifications,
      endorsements,
      reputationFacts: reputation.facts,
    };
  }

  async getMyProfile(userId: string) {
    const publicProfile = await this.getPublicUserProfile(userId);
    const pendingQualifications = await this.prisma.qualification.count({
      where: { subjectType: 'USER', subjectId: userId, status: 'PENDING' },
    });
    const pendingEndorsementsReceived = await this.prisma.identityEndorsement.count({
      where: { subjectType: 'USER', subjectId: userId, status: 'PENDING' },
    });

    return {
      ...publicProfile,
      pendingQualifications,
      pendingEndorsementsReceived,
    };
  }

  private buildVerificationFlags(
    verifications: Array<{ verificationType: string; status: string }>,
  ) {
    const byType = Object.fromEntries(verifications.map((v) => [v.verificationType, v.status]));
    return {
      emailVerified: byType.EMAIL === 'VERIFIED',
      phoneVerified: byType.PHONE === 'VERIFIED',
      realNameVerified: byType.REAL_NAME === 'VERIFIED',
      ageVerified: byType.AGE === 'VERIFIED',
    };
  }
}

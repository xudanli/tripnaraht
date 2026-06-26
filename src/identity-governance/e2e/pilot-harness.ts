import { randomUUID } from 'crypto';
import { ProfessionalCertificationService } from '../services/professional-certification.service';
import { PublishingPermissionService } from '../services/publishing-permission.service';
import { TrustedProjectListingService } from '../services/trusted-project-listing.service';
import { ReputationEventService } from '../services/reputation-event.service';
import { EndorsementService } from '../services/endorsement.service';
import { QualificationService } from '../services/qualification.service';
import { TrustProfileService } from '../services/trust-profile.service';
import { IdentityAuditLogService } from '../services/audit-log.service';
import { VerificationService } from '../services/verification.service';
import { AgencyCertificationService } from '../services/agency-certification.service';
import { ProjectEligibilityRuleService } from '../services/project-eligibility-rule.service';
import { ProjectFitAssessmentService } from '../services/project-fit-assessment.service';
import { ProjectFitApplicationService } from '../services/project-fit-application.service';
import { ProjectFitConfigService } from '../services/project-fit-config.service';
import { ProjectMembershipService } from '../services/project-membership.service';
import { IdentityGovernanceEventService } from '../services/identity-governance-event.service';

export const PILOT_IDS = {
  guide: '11111111-1111-4111-8111-111111111111',
  admin: '22222222-2222-4222-8222-222222222222',
  org: '33333333-3333-4333-8333-333333333333',
  orgOwner: '44444444-4444-4444-8444-444444444444',
  trip: 'trip-pilot-001',
} as const;

type Row = Record<string, unknown>;

function clone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = clone(entry);
  }
  return out as T;
}

function matchesWhere(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'OR' && Array.isArray(expected)) {
      return expected.some((clause) => matchesWhere(row, clause as Row));
    }
    if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date)) {
      const obj = expected as Row;
      if ('in' in obj) {
        return (obj.in as unknown[]).includes(row[key]);
      }
      if ('gte' in obj) {
        const value = row[key];
        if (value instanceof Date && obj.gte instanceof Date) {
          return value.getTime() >= obj.gte.getTime();
        }
        return (value as number) >= (obj.gte as number);
      }
      if ('lt' in obj) {
        const value = row[key];
        if (value instanceof Date && obj.lt instanceof Date) {
          return value.getTime() < obj.lt.getTime();
        }
        return (value as number) < (obj.lt as number);
      }
      if ('gt' in obj) {
        const value = row[key];
        if (value instanceof Date && obj.gt instanceof Date) {
          return value.getTime() > obj.gt.getTime();
        }
        return String(value) > String(obj.gt);
      }
      if ('contains' in obj) {
        return String(row[key]).toLowerCase().includes(String(obj.contains).toLowerCase());
      }
      if ('mode' in obj) {
        return matchesWhere(row, { [key]: obj.contains });
      }
    }
    return row[key] === expected;
  });
}

function sortRows(rows: Row[], orderBy?: Row | Row[]): Row[] {
  if (!orderBy) return rows;
  const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const clause of clauses) {
      const [field, direction] = Object.entries(clause)[0] ?? [];
      if (!field) continue;
      const av = a[field];
      const bv = b[field];
      if (av === bv) continue;
      const cmp =
        av instanceof Date && bv instanceof Date
          ? av.getTime() - bv.getTime()
          : String(av).localeCompare(String(bv));
      return direction === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

function takeRows(rows: Row[], args?: { skip?: number; take?: number }): Row[] {
  const skip = args?.skip ?? 0;
  const take = args?.take ?? rows.length;
  return rows.slice(skip, skip + take);
}

export class PilotMemoryStore {
  readonly tables: Record<string, Row[]> = {
    users: [],
    userVerifications: [],
    professionalProfiles: [],
    professionalCertifications: [],
    userAccountContexts: [],
    subscriptions: [],
    publishingPermissions: [],
    publishingPermissionApplications: [],
    trustedProjectListings: [],
    trustedProjectApplications: [],
    reputationEvents: [],
    identityEndorsements: [],
    qualifications: [],
    organizations: [],
    organizationMembers: [],
    agencyCertifications: [],
    identityAuditLogs: [],
    projectEligibilityRules: [],
    projectFitAssessments: [],
    fitAnswers: [],
    projectFitAppeals: [],
    tripCollaborators: [],
    projectMemberships: [],
  };

  seedPilotActors() {
    const now = new Date();
    this.tables.users.push(
      {
        id: PILOT_IDS.guide,
        email: 'guide@pilot.test',
        emailVerified: true,
        displayName: 'Pilot Guide',
      },
      {
        id: PILOT_IDS.admin,
        email: 'admin@pilot.test',
        emailVerified: true,
        displayName: 'Pilot Admin',
      },
      {
        id: PILOT_IDS.orgOwner,
        email: 'org-owner@pilot.test',
        emailVerified: true,
        displayName: 'Org Owner',
      },
    );

    this.tables.userVerifications.push({
      id: randomUUID(),
      userId: PILOT_IDS.guide,
      verificationType: 'EMAIL',
      status: 'VERIFIED',
      provider: 'auth',
      verifiedAt: now,
      expiresAt: null,
      evidence: null,
      createdAt: now,
      updatedAt: now,
    });

    this.tables.organizations.push({
      id: PILOT_IDS.org,
      displayName: 'Pilot Travel Agency',
      legalName: 'Pilot Travel Co.',
      verificationStatus: 'VERIFIED',
      ownerId: PILOT_IDS.orgOwner,
    });

    this.tables.organizationMembers.push({
      id: randomUUID(),
      organizationId: PILOT_IDS.org,
      userId: PILOT_IDS.orgOwner,
      roles: ['OWNER', 'AGENCY_ADMIN'],
      status: 'ACTIVE',
    });

    this.tables.agencyCertifications.push({
      id: randomUUID(),
      organizationId: PILOT_IDS.org,
      status: 'VERIFIED',
      verifiedAt: now,
      updatedAt: now,
    });
  }

  findMany(table: string, args: { where?: Row; orderBy?: Row | Row[]; take?: number; skip?: number } = {}) {
    const rows = this.tables[table].filter((row) => matchesWhere(row, args.where));
    return takeRows(sortRows(rows, args.orderBy), args);
  }

  findFirst(table: string, args: { where?: Row; orderBy?: Row | Row[] } = {}) {
    return this.findMany(table, args)[0] ?? null;
  }

  findUnique(table: string, args: { where: Row }) {
    const where = args.where;
    if ('id' in where) {
      return clone(this.tables[table].find((row) => row.id === where.id) ?? null);
    }
    if ('userId' in where && Object.keys(where).length === 1) {
      return clone(this.tables[table].find((row) => row.userId === where.userId) ?? null);
    }
    if ('userId_verificationType' in where) {
      const composite = where.userId_verificationType as Row;
      return clone(
        this.tables[table].find(
          (row) =>
            row.userId === composite.userId &&
            row.verificationType === composite.verificationType,
        ) ?? null,
      );
    }
    if ('organizationId_userId' in where) {
      const composite = where.organizationId_userId as Row;
      return clone(
        this.tables[table].find(
          (row) =>
            row.organizationId === composite.organizationId && row.userId === composite.userId,
        ) ?? null,
      );
    }
    if ('listingId_applicantUserId' in where) {
      const composite = where.listingId_applicantUserId as Row;
      return clone(
        this.tables[table].find(
          (row) =>
            row.listingId === composite.listingId &&
            row.applicantUserId === composite.applicantUserId,
        ) ?? null,
      );
    }
    if ('assessmentId_questionKey' in where) {
      const composite = where.assessmentId_questionKey as Row;
      return clone(
        this.tables[table].find(
          (row) =>
            row.assessmentId === composite.assessmentId &&
            row.questionKey === composite.questionKey,
        ) ?? null,
      );
    }
    if ('idempotencyKey' in where) {
      return clone(this.tables[table].find((row) => row.idempotencyKey === where.idempotencyKey) ?? null);
    }
    if ('tripId_userId' in where) {
      const composite = where.tripId_userId as Row;
      return clone(
        this.tables[table].find(
          (row) => row.tripId === composite.tripId && row.userId === composite.userId,
        ) ?? null,
      );
    }
    return null;
  }

  count(table: string, args: { where?: Row } = {}) {
    return this.findMany(table, args).length;
  }

  create(table: string, args: { data: Row }) {
    const now = new Date();
    const row: Row = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...args.data,
    };
    this.tables[table].push(row);
    return clone(row);
  }

  update(table: string, args: { where: { id: string }; data: Row }) {
    const index = this.tables[table].findIndex((row) => row.id === args.where.id);
    if (index < 0) throw new Error(`Row not found in ${table}`);
    this.tables[table][index] = {
      ...this.tables[table][index],
      ...args.data,
      updatedAt: new Date(),
    };
    return clone(this.tables[table][index]);
  }

  updateMany(table: string, args: { where?: Row; data: Row }) {
    let count = 0;
    for (const row of this.tables[table]) {
      if (matchesWhere(row, args.where)) {
        Object.assign(row, args.data, { updatedAt: new Date() });
        count += 1;
      }
    }
    return { count };
  }

  deleteMany(table: string, args: { where?: Row } = {}) {
    const before = this.tables[table].length;
    this.tables[table] = this.tables[table].filter((row) => !matchesWhere(row, args.where));
    return { count: before - this.tables[table].length };
  }

  upsert(table: string, args: { where: Row; create: Row; update: Row }) {
    const existing = this.findUnique(table, { where: args.where });
    if (existing) {
      return this.update(table, { where: { id: existing.id as string }, data: args.update });
    }
    return this.create(table, { data: args.create });
  }
}

export function buildPrisma(store: PilotMemoryStore) {
  const tableMap: Record<string, string> = {
    user: 'users',
    userVerification: 'userVerifications',
    professionalProfile: 'professionalProfiles',
    professionalCertification: 'professionalCertifications',
    userAccountContext: 'userAccountContexts',
    subscription: 'subscriptions',
    publishingPermission: 'publishingPermissions',
    publishingPermissionApplication: 'publishingPermissionApplications',
    trustedProjectListing: 'trustedProjectListings',
    trustedProjectApplication: 'trustedProjectApplications',
    reputationEvent: 'reputationEvents',
    identityEndorsement: 'identityEndorsements',
    qualification: 'qualifications',
    organization: 'organizations',
    organizationMember: 'organizationMembers',
    agencyCertification: 'agencyCertifications',
    identityAuditLog: 'identityAuditLogs',
    projectEligibilityRule: 'projectEligibilityRules',
    projectFitAssessment: 'projectFitAssessments',
    fitAnswer: 'fitAnswers',
    projectFitAppeal: 'projectFitAppeals',
    tripCollaborator: 'tripCollaborators',
    projectMembership: 'projectMemberships',
  };

  const prisma: Record<string, Record<string, unknown>> = {};
  for (const [model, table] of Object.entries(tableMap)) {
    prisma[model] = {
      findMany: (args: Record<string, unknown> = {}) => {
        const rows = store.findMany(table, args as never);
        if (args.include) {
          return rows.map((row) => enrichInclude(store, tableMap, row, args.include as Row));
        }
        return rows;
      },
      findFirst: (args: Record<string, unknown> = {}) => {
        const row = store.findFirst(table, args as never);
        if (!row) return null;
        if (args.include) {
          return enrichInclude(store, tableMap, row, args.include as Row);
        }
        return row;
      },
      findUnique: (args: Record<string, unknown>) => {
        const row = store.findUnique(table, { where: args.where as Row });
        if (!row) return null;
        if (args.include) {
          return enrichInclude(store, tableMap, row, args.include as Row);
        }
        return row;
      },
      count: (args: Record<string, unknown> = {}) => store.count(table, args as never),
      create: (args: { data: Row }) => store.create(table, args),
      update: (args: { where: { id: string }; data: Row }) => store.update(table, args),
      updateMany: (args: { where?: Row; data: Row }) => store.updateMany(table, args),
      deleteMany: (args: { where?: Row }) => store.deleteMany(table, args),
      upsert: (args: { where: Row; create: Row; update: Row }) => store.upsert(table, args),
    };
  }

  return prisma as never;
}

function enrichInclude(store: PilotMemoryStore, tableMap: Record<string, string>, row: Row, include: Row) {
  const enriched = { ...row };
  if (include.listing && row.listingId) {
    enriched.listing = store.findUnique('trustedProjectListings', { where: { id: row.listingId } });
  }
  if (include.fitAssessment && row.fitAssessmentId) {
    enriched.fitAssessment = store.findUnique('projectFitAssessments', {
      where: { id: row.fitAssessmentId },
    });
  }
  return enriched;
}

export type PilotHarness = {
  store: PilotMemoryStore;
  professionalCertification: ProfessionalCertificationService;
  publishingPermission: PublishingPermissionService;
  trustedProjects: TrustedProjectListingService;
  reputation: ReputationEventService;
  endorsement: EndorsementService;
  qualification: QualificationService;
  trustProfile: TrustProfileService;
};

export function createPilotHarness(): PilotHarness {
  const store = new PilotMemoryStore();
  store.seedPilotActors();
  const prisma = buildPrisma(store);
  const auditLog = new IdentityAuditLogService(prisma);
  const verification = new VerificationService(prisma, auditLog);
  const professionalCertification = new ProfessionalCertificationService(prisma, auditLog);
  const agencyCertification = new AgencyCertificationService(prisma, auditLog);
  const publishingPermission = new PublishingPermissionService(
    prisma,
    auditLog,
    professionalCertification,
    agencyCertification,
    verification,
  );
  const qualification = new QualificationService(prisma, auditLog);
  const reputation = new ReputationEventService(prisma, auditLog);
  const endorsement = new EndorsementService(prisma, auditLog);
  const projectMembership = new ProjectMembershipService(prisma);
  const trustedProjects = new TrustedProjectListingService(
    prisma,
    auditLog,
    publishingPermission,
    professionalCertification,
    reputation,
    projectMembership,
  );
  const trustProfile = new TrustProfileService(prisma, qualification, endorsement, reputation);

  return {
    store,
    professionalCertification,
    publishingPermission,
    trustedProjects,
    reputation,
    endorsement,
    qualification,
    trustProfile,
  };
}

export function createProjectFitHarness() {
  const store = new PilotMemoryStore();
  store.seedPilotActors();
  const prisma = buildPrisma(store);
  const auditLog = new IdentityAuditLogService(prisma);
  const verification = new VerificationService(prisma, auditLog);
  const professionalCertification = new ProfessionalCertificationService(prisma, auditLog);
  const agencyCertification = new AgencyCertificationService(prisma, auditLog);
  const publishingPermission = new PublishingPermissionService(
    prisma,
    auditLog,
    professionalCertification,
    agencyCertification,
    verification,
  );
  const reputation = new ReputationEventService(prisma, auditLog);
  const projectMembership = new ProjectMembershipService(prisma);
  const trustedProjects = new TrustedProjectListingService(
    prisma,
    auditLog,
    publishingPermission,
    professionalCertification,
    reputation,
    projectMembership,
  );
  const eligibilityRules = new ProjectEligibilityRuleService(prisma, auditLog);
  const fitConfig = new ProjectFitConfigService(prisma, auditLog);
  const fitAssessment = new ProjectFitAssessmentService(prisma, auditLog, eligibilityRules);
  const domainEvents = new IdentityGovernanceEventService(auditLog);
  const portalBridge = { enrollFromTrustedApplication: async () => ({ enrolled: false }) } as never;
  const fitApplication = new ProjectFitApplicationService(
    prisma,
    auditLog,
    eligibilityRules,
    projectMembership,
    domainEvents,
    portalBridge,
  );

  return {
    store,
    professionalCertification,
    publishingPermission,
    trustedProjects,
    eligibilityRules,
    fitConfig,
    fitAssessment,
    fitApplication,
    projectMembership,
  };
}

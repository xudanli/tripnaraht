import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  DecisionDnaComplianceAuditEvent,
  DecisionDnaConsentPrefs,
  DecisionDnaConsentStatus,
  DecisionDnaEvolutionReason,
  DecisionDnaSignalSource,
  DecisionDnaSignalTier,
  DecisionDnaSyncGateResult,
  REASON_TO_SIGNAL_SOURCE,
  SIGNAL_TIER_REGISTRY,
} from './decision-dna-compliance.types';

const AUDIT_RING_MAX = 200;

@Injectable()
export class DecisionDnaComplianceService {
  private readonly logger = new Logger(DecisionDnaComplianceService.name);
  private readonly auditRing: DecisionDnaComplianceAuditEvent[] = [];

  constructor(private readonly prisma: PrismaService) {}

  classifyReason(reason: DecisionDnaEvolutionReason): {
    signalSource: DecisionDnaSignalSource;
    tier: DecisionDnaSignalTier;
  } {
    const signalSource = REASON_TO_SIGNAL_SOURCE[reason];
    return { signalSource, tier: SIGNAL_TIER_REGISTRY[signalSource] };
  }

  async evaluateSync(params: {
    userId: string;
    reason: DecisionDnaEvolutionReason;
  }): Promise<DecisionDnaSyncGateResult> {
    const { signalSource, tier } = this.classifyReason(params.reason);

    if (tier === 'FORBIDDEN') {
      return {
        allowed: false,
        tier,
        signalSource,
        blockedReason: 'FORBIDDEN_SIGNAL',
      };
    }

    if (tier === 'EXPLICIT') {
      return { allowed: true, tier, signalSource };
    }

    const consent = await this.readImplicitConsent(params.userId);
    if (!consent.implicit_learning) {
      return {
        allowed: false,
        tier,
        signalSource,
        blockedReason: 'IMPLICIT_CONSENT_REQUIRED',
      };
    }

    return { allowed: true, tier, signalSource };
  }

  recordAudit(event: Omit<DecisionDnaComplianceAuditEvent, 'at'> & { at?: string }): void {
    const row: DecisionDnaComplianceAuditEvent = {
      ...event,
      at: event.at ?? new Date().toISOString(),
    };
    this.auditRing.push(row);
    if (this.auditRing.length > AUDIT_RING_MAX) {
      this.auditRing.shift();
    }
    this.logger.debug(
      `Decision DNA audit user=${row.userId} tier=${row.tier} allowed=${row.allowed} reason=${row.reason}`,
    );
  }

  getRecentAudits(limit = 50): DecisionDnaComplianceAuditEvent[] {
    const n = Math.max(1, Math.min(limit, AUDIT_RING_MAX));
    return this.auditRing.slice(-n);
  }

  async getConsentStatus(userId: string): Promise<DecisionDnaConsentStatus> {
    const consent = await this.readImplicitConsent(userId);
    return {
      implicit_learning: consent.implicit_learning === true,
      granted_at: consent.granted_at,
      revoked_at: consent.revoked_at,
      explicit_signals_always_allowed: true,
      signal_tiers: SIGNAL_TIER_REGISTRY,
    };
  }

  async updateConsent(userId: string, implicitLearning: boolean): Promise<DecisionDnaConsentStatus> {
    const now = new Date().toISOString();
    const existing = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { preferences: true },
    });
    const prefs = (existing?.preferences ?? {}) as Record<string, unknown>;
    const prev = (prefs.decision_dna_consent as DecisionDnaConsentPrefs | undefined) ?? {};

    const next: DecisionDnaConsentPrefs = implicitLearning
      ? { implicit_learning: true, granted_at: now, revoked_at: undefined }
      : { implicit_learning: false, granted_at: prev.granted_at, revoked_at: now };

    prefs.decision_dna_consent = next;

    await this.prisma.userProfile.upsert({
      where: { userId },
      update: { preferences: prefs as Prisma.InputJsonValue, updatedAt: new Date() },
      create: { userId, preferences: prefs as Prisma.InputJsonValue, updatedAt: new Date() },
    });

    this.logger.log(
      `Decision DNA consent updated user=${userId} implicit_learning=${implicitLearning}`,
    );

    return this.getConsentStatus(userId);
  }

  private async readImplicitConsent(userId: string): Promise<DecisionDnaConsentPrefs & { implicit_learning: boolean }> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { preferences: true },
    });
    const prefs = (profile?.preferences ?? {}) as Record<string, unknown>;
    const consent = prefs.decision_dna_consent as DecisionDnaConsentPrefs | undefined;
    if (consent?.revoked_at) {
      return { implicit_learning: false, granted_at: consent.granted_at, revoked_at: consent.revoked_at };
    }
    return {
      implicit_learning: consent?.implicit_learning === true,
      granted_at: consent?.granted_at,
      revoked_at: consent?.revoked_at,
    };
  }
}

export function tierAllowsPersist(tier: DecisionDnaSignalTier): boolean {
  return tier === 'EXPLICIT' || tier === 'IMPLICIT_WITH_CONSENT';
}

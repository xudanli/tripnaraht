import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { MemoryService } from '../services/memory.service';
import { TripTaskMemoryService } from '../../context-engine/services/trip-task-memory.service';
import { extractAgentMemoryUserBasicsFromPreferences } from '../utils/agent-memory-user-basics.util';
import { createDefaultUserTravelProfile } from '../interfaces/user-travel-profile.interface';
import type { UserTravelProfile } from '../interfaces/user-travel-profile.interface';
import {
  readConstraintSinkState,
  removeConstraintSinkPatch,
  summarizePatchForConsole,
} from '../constraint-sink/constraint-sink-state.util';
import { CONSTRAINT_SINK_V1_KEY } from '../constraint-sink/constraint-sink.types';
import { MemorySnapshotPersistenceService } from '../persistence/memory-snapshot-persistence.service';
import { loadDecisionLedgerCausalityConsoleV1 } from '../../../trips/decision-semantics/read/decision-ledger-console-read.util';
import type { DecisionLedgerCausalityConsoleV1 } from '../../../trips/decision-semantics/read/decision-ledger-console-read.util';

export type UserMemoryConsoleResponseV1 = {
  revision: 'v1';
  user_id: string;
  l0: ReturnType<typeof extractAgentMemoryUserBasicsFromPreferences> | null;
  l1: Pick<
    UserTravelProfile,
    | 'pacePreference'
    | 'riskTolerance'
    | 'travelPhilosophy'
    | 'preferredRouteTypes'
    | 'confidence'
    | 'source'
    | 'updatedAt'
  > | null;
  l2_recent: Array<{ id: string; title: string; decided_at: string; trip_id?: string | null }>;
  trip_constraints?: {
    trip_id: string;
    patches: Array<{
      id: string;
      summary_zh: string;
      at: string;
      confidence: number;
      provenance: string;
      applied_keys: string[];
    }>;
  };
  /** Decision Semantics ↔ Ledger caused_by（与 GET decision-ledger/nodes/:id/decision 同源） */
  decision_ledger_causality?: DecisionLedgerCausalityConsoleV1;
  meta: {
    l2_total_count: number;
    feature_flags: { constraint_sink: boolean; memory_console: boolean; decision_semantics: boolean };
  };
};

@Injectable()
export class UserMemoryConsoleService {
  private readonly logger = new Logger(UserMemoryConsoleService.name);

  constructor(
    private readonly memoryService: MemoryService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly tripTaskMemory?: TripTaskMemoryService,
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly memorySnapshotPersistence?: MemorySnapshotPersistenceService,
  ) {}

  assertConsoleEnabled(): void {
    if (this.configService?.get<string>('FEATURE_MEMORY_CONSOLE') !== '1') {
      throw new NotFoundException({
        success: false,
        error: { code: '6009', message: 'Memory Console is disabled', messageCN: '记忆看板功能未开启' },
      });
    }
  }

  async getConsole(userId: string, tripId?: string): Promise<UserMemoryConsoleResponseV1> {
    this.assertConsoleEnabled();
    const uid = String(userId).trim();
    if (!uid || uid === 'anonymous') {
      throw new ForbiddenException({
        success: false,
        error: { code: '6005', message: 'Anonymous users cannot access memory console', messageCN: '匿名用户无法使用记忆看板' },
      });
    }

    const [profile, l0, l2All] = await Promise.all([
      this.memoryService.getUserTravelProfile(uid),
      this.loadL0(uid),
      this.memoryService.getUserRouteDirectionDecisions(uid),
    ]);

    const l1 = profile
      ? {
          pacePreference: profile.pacePreference,
          riskTolerance: profile.riskTolerance,
          travelPhilosophy: profile.travelPhilosophy,
          preferredRouteTypes: profile.preferredRouteTypes,
          confidence: profile.confidence,
          source: profile.source,
          updatedAt: profile.updatedAt,
        }
      : null;

    const l2_recent = l2All.slice(0, 20).map((m) => ({
      id: m.id ?? String(m.selectedRouteDirectionId),
      title:
        m.explanation?.whySelected?.slice(0, 120) ??
        `路线方向 #${m.selectedRouteDirectionId}`,
      decided_at: (m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt as any)).toISOString(),
      trip_id: m.tripId ?? null,
    }));

    let trip_constraints: UserMemoryConsoleResponseV1['trip_constraints'];
    let decision_ledger_causality: UserMemoryConsoleResponseV1['decision_ledger_causality'];
    const tid = tripId?.trim();
    if (tid && this.tripTaskMemory) {
      await this.assertTripOwnedByUser(tid, uid);
      const task = await this.tripTaskMemory.get(tid);
      const sink = readConstraintSinkState(task?.constraints);
      trip_constraints = {
        trip_id: tid,
        patches: (sink?.patches ?? []).map((p) => ({
          id: p.id,
          summary_zh: summarizePatchForConsole(p),
          at: p.at,
          confidence: p.confidence,
          provenance: p.provenance,
          applied_keys: Object.keys(p.delta).filter(Boolean),
        })),
      };
    }

    if (tid && this.prisma?.isDbConnected()) {
      await this.assertTripOwnedByUser(tid, uid);
      const memCtx = await this.memorySnapshotPersistence?.loadLatestContextForTrip(tid);
      decision_ledger_causality =
        (await loadDecisionLedgerCausalityConsoleV1({
          tripId: tid,
          prisma: this.prisma,
          ledger: memCtx?.decisionLedger ?? null,
          ledgerSnapshotVersion: memCtx?.snapshotVersion,
        })) ?? undefined;
    }

    return {
      revision: 'v1',
      user_id: uid,
      l0,
      l1,
      l2_recent,
      trip_constraints,
      decision_ledger_causality,
      meta: {
        l2_total_count: l2All.length,
        feature_flags: {
          constraint_sink: this.configService?.get<string>('FEATURE_MEMORY_CONSTRAINT_SINK') === '1',
          memory_console: true,
          decision_semantics: !!decision_ledger_causality?.links?.length,
        },
      },
    };
  }

  async patchL1(
    userId: string,
    body: {
      pacePreference?: UserTravelProfile['pacePreference'];
      riskTolerance?: UserTravelProfile['riskTolerance'];
      travelPhilosophy?: UserTravelProfile['travelPhilosophy'];
      preferredRouteTypes?: UserTravelProfile['preferredRouteTypes'];
      client_acknowledged?: boolean;
    },
  ): Promise<UserMemoryConsoleResponseV1['l1']> {
    this.assertConsoleEnabled();
    if (!body.client_acknowledged) {
      throw new BadRequestException({
        success: false,
        error: { code: '6001', message: 'client_acknowledged required', messageCN: '需要确认修改' },
      });
    }
    const uid = String(userId).trim();
    const existing = (await this.memoryService.getUserTravelProfile(uid)) ?? createDefaultUserTravelProfile(uid);
    const next: UserTravelProfile = {
      ...existing,
      ...(body.pacePreference !== undefined ? { pacePreference: body.pacePreference } : {}),
      ...(body.riskTolerance !== undefined ? { riskTolerance: body.riskTolerance } : {}),
      ...(body.travelPhilosophy !== undefined ? { travelPhilosophy: body.travelPhilosophy } : {}),
      ...(body.preferredRouteTypes !== undefined ? { preferredRouteTypes: body.preferredRouteTypes } : {}),
      source: 'explicit',
      confidence: Math.min(1, (existing.confidence ?? 0.5) + 0.15),
      updatedAt: new Date(),
    };
    await this.memoryService.saveUserTravelProfile(next);
    return {
      pacePreference: next.pacePreference,
      riskTolerance: next.riskTolerance,
      travelPhilosophy: next.travelPhilosophy,
      preferredRouteTypes: next.preferredRouteTypes,
      confidence: next.confidence,
      source: next.source,
      updatedAt: next.updatedAt,
    };
  }

  async deleteL1(userId: string): Promise<void> {
    this.assertConsoleEnabled();
    const uid = String(userId).trim();
    const defaults = createDefaultUserTravelProfile(uid);
    defaults.source = 'explicit';
    defaults.confidence = 0.3;
    await this.memoryService.saveUserTravelProfile(defaults);
  }

  async deleteL0Field(userId: string, fieldKey: string): Promise<void> {
    this.assertConsoleEnabled();
    const allowed = new Set(['nationality', 'tags', 'preferredAttractionTypes', 'dietaryRestrictions', 'residencyCountry']);
    if (!allowed.has(fieldKey)) {
      throw new BadRequestException({
        success: false,
        error: { code: '6001', message: `Invalid fieldKey: ${fieldKey}`, messageCN: '无效的字段名' },
      });
    }
    if (!this.prisma?.isDbConnected()) {
      throw new ServiceUnavailableException({
        success: false,
        error: { code: '6008', message: 'Database unavailable', messageCN: '数据库不可用' },
      });
    }
    const row = await this.prisma.userProfile.findUnique({ where: { userId }, select: { preferences: true } });
    if (!row?.preferences || typeof row.preferences !== 'object') return;
    const prefs = { ...(row.preferences as Record<string, unknown>) };
    delete prefs[fieldKey];
    await this.prisma.userProfile.update({
      where: { userId },
      data: { preferences: prefs as any, updatedAt: new Date() },
    });
  }

  async deleteL2Decision(userId: string, decisionId: string): Promise<void> {
    this.assertConsoleEnabled();
    const uid = String(userId).trim();
    const id = String(decisionId).trim();
    if (!id) {
      throw new BadRequestException({
        success: false,
        error: { code: '6001', message: 'decisionId required', messageCN: '缺少决策 ID' },
      });
    }
    const deleted = await this.memoryService.deleteRouteDirectionDecision(uid, id);
    if (!deleted) {
      throw new NotFoundException({
        success: false,
        error: { code: '6003', message: 'L2 decision not found', messageCN: '路线决策记忆不存在' },
      });
    }
    this.logger.debug(`Memory Console deleted L2 decision=${id} user=${uid}`);
  }

  async deleteTripConstraintPatch(userId: string, tripId: string, patchId: string): Promise<number> {
    this.assertConsoleEnabled();
    if (!this.tripTaskMemory) {
      throw new ServiceUnavailableException({
        success: false,
        error: { code: '6007', message: 'TripTaskMemory unavailable', messageCN: '任务记忆不可用' },
      });
    }
    const tid = tripId.trim();
    await this.assertTripOwnedByUser(tid, userId);
    const task = await this.tripTaskMemory.get(tid);
    if (!task) {
      throw new NotFoundException({
        success: false,
        error: { code: '6002', message: 'Trip task memory not found', messageCN: '行程任务记忆不存在' },
      });
    }
    const before = readConstraintSinkState(task.constraints)?.patches?.length ?? 0;
    const nextConstraints = removeConstraintSinkPatch(task.constraints as Record<string, unknown>, patchId);
    const after = readConstraintSinkState(nextConstraints)?.patches?.length ?? 0;
    if (after === before) {
      throw new NotFoundException({
        success: false,
        error: { code: '6004', message: 'Patch not found', messageCN: '约束记录不存在' },
      });
    }
    await this.tripTaskMemory.update(tid, { constraints: nextConstraints });
    await this.memorySnapshotPersistence?.invalidateTripHead(tid);
    return after;
  }

  async exportUserMemory(userId: string): Promise<Record<string, unknown>> {
    this.assertConsoleEnabled();
    const console = await this.getConsole(userId);
    return {
      exported_at: new Date().toISOString(),
      user_id: userId,
      l0: console.l0,
      l1: console.l1,
      l2: console.l2_recent,
      trip_task_constraints: console.trip_constraints ? [console.trip_constraints] : [],
      decision_ledger_causality: console.decision_ledger_causality,
    };
  }

  private async loadL0(userId: string) {
    if (!this.prisma?.isDbConnected()) return null;
    try {
      const row = await this.prisma.userProfile.findUnique({
        where: { userId },
        select: { preferences: true, updatedAt: true },
      });
      if (!row?.preferences) return null;
      return extractAgentMemoryUserBasicsFromPreferences(row.preferences, row.updatedAt.toISOString());
    } catch (e: unknown) {
      this.logger.warn(`loadL0 failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  private async assertTripOwnedByUser(tripId: string, userId: string): Promise<void> {
    if (!this.prisma?.isDbConnected()) return;
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true, TripCollaborator: { where: { userId }, select: { userId: true } } },
    });
    if (!trip) {
      throw new NotFoundException({
        success: false,
        error: { code: '6002', message: 'Trip not found', messageCN: '行程不存在' },
      });
    }
    const metaUser = (trip.metadata as { userId?: string } | null)?.userId;
    const collab = trip.TripCollaborator?.length > 0;
    if (metaUser && metaUser !== userId && !collab) {
      throw new ForbiddenException({
        success: false,
        error: { code: '6002', message: 'Trip access denied', messageCN: '无权访问该行程' },
      });
    }
  }
}

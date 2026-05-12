import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AgentRuntimeReplayAnchor } from '@prisma/client';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  RUNTIME_PERSISTENCE_SCHEMA,
  type ArtifactEvolutionRecord,
  type PartialRecomputeScope,
  type ReplayPersistenceRecord,
  type RuntimeReplayAdmissionPath,
  type RuntimeReplayAnchorRow,
} from '../runtime/runtime-persistence.types';
import { buildReplayPersistenceRecord } from '../runtime/runtime-replay-anchor.builder';

/**
 * P3 — Replay anchor DB rows + synchronous observability echo (`runtime_replay_persistence`).
 * Gated by `RUNTIME_REPLAY_PERSISTENCE=1|true|yes`. Requires Prisma (no echo / no insert without DB).
 */
@Injectable()
export class RuntimeReplayPersistenceService {
  private readonly logger = new Logger(RuntimeReplayPersistenceService.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  private static jsonCreate(
    v: PartialRecomputeScope | ArtifactEvolutionRecord | undefined,
  ): Prisma.InputJsonValue | undefined {
    if (v === undefined) return undefined;
    return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
  }

  private static jsonUpdate(
    v: PartialRecomputeScope | ArtifactEvolutionRecord | null | undefined,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
    if (v === undefined) return undefined;
    if (v === null) return Prisma.JsonNull;
    return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
  }

  isEnabled(): boolean {
    const v = process.env.RUNTIME_REPLAY_PERSISTENCE;
    return v === '1' || v === 'true' || v === 'yes';
  }

  /**
   * Build anchor, attach echo on `response` immediately (same snapshot_id as subsequent INSERT).
   * Returns null when disabled or Prisma unavailable.
   */
  attachReplayPersistenceEcho(params: {
    request: RouteAndRunRequestDto;
    requestHash: string;
    response: RouteAndRunResponseDto;
    admissionPath: RuntimeReplayAdmissionPath;
  }): ReplayPersistenceRecord | null {
    if (!this.isEnabled() || !this.prisma) {
      if (this.isEnabled() && !this.prisma) {
        this.logger.debug('Prisma unavailable; skip runtime replay anchor echo + persist');
      }
      return null;
    }

    const createdAtMs = Date.now();
    const record = buildReplayPersistenceRecord({ ...params, createdAtMs });
    this.applyEcho(params.response, record, params.requestHash);
    return record;
  }

  /** INSERT anchor row; on failure strips echo matching this snapshot_id. */
  async persistReplayAnchorRecord(
    record: ReplayPersistenceRecord,
    response: RouteAndRunResponseDto,
    dedupRequestHash: string,
  ): Promise<void> {
    if (!this.isEnabled() || !this.prisma) return;

    try {
      const row = await this.prisma.agentRuntimeReplayAnchor.upsert({
        where: { snapshotId: record.snapshotId },
        create: {
          snapshotId: record.snapshotId,
          queryId: record.queryId,
          admissionPath: record.admissionPath,
          dedupRequestHash,
          phiDigest: record.phiDigest,
          certificateDigest: record.certificateDigest ?? null,
          artifactRefs: record.artifactRefs,
          schemaVersion: RUNTIME_PERSISTENCE_SCHEMA,
          createdAtMs: BigInt(record.createdAtMs),
          partialRecomputeScope: RuntimeReplayPersistenceService.jsonCreate(
            record.partialRecomputeScope,
          ),
          artifactEvolution: RuntimeReplayPersistenceService.jsonCreate(record.artifactEvolution),
        },
        update: {
          queryId: record.queryId,
          admissionPath: record.admissionPath,
          dedupRequestHash,
          phiDigest: record.phiDigest,
          certificateDigest: record.certificateDigest ?? null,
          artifactRefs: record.artifactRefs,
          partialRecomputeScope: RuntimeReplayPersistenceService.jsonUpdate(
            record.partialRecomputeScope,
          ),
          artifactEvolution: RuntimeReplayPersistenceService.jsonUpdate(record.artifactEvolution),
        },
      });
      this.patchEchoRowId(response, record.snapshotId, row.id);
    } catch (e) {
      this.stripEcho(response, record.snapshotId);
      this.logger.warn(
        `runtime replay anchor persist failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async persistFreshReplayAnchor(params: {
    request: RouteAndRunRequestDto;
    requestHash: string;
    response: RouteAndRunResponseDto;
  }): Promise<void> {
    const record = this.attachReplayPersistenceEcho({
      ...params,
      admissionPath: 'FRESH_FINALIZE',
    });
    if (record) {
      await this.persistReplayAnchorRecord(record, params.response, params.requestHash);
    }
  }

  async persistDedupReplayAnchor(params: {
    request: RouteAndRunRequestDto;
    requestHash: string;
    response: RouteAndRunResponseDto;
  }): Promise<void> {
    const record = this.attachReplayPersistenceEcho({
      ...params,
      admissionPath: 'DEDUP_REPLAY',
    });
    if (record) {
      await this.persistReplayAnchorRecord(record, params.response, params.requestHash);
    }
  }

  /** Admin / 对账：按 route_and_run request_id（query_id）倒序列出锚点行。 */
  async listAnchorsByQueryId(queryId: string, limit = 50): Promise<RuntimeReplayAnchorRow[]> {
    if (!this.prisma || !queryId.trim()) return [];
    const n = Number.isFinite(limit) && limit > 0 ? limit : 50;
    const take = Math.min(200, Math.max(1, n));
    const rows = await this.prisma.agentRuntimeReplayAnchor.findMany({
      where: { queryId: queryId.trim() },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows.map((r) => this.mapRow(r));
  }

  /** 按 observability 回显的 snapshot_id（唯一）取单行，用于对账。 */
  async findAnchorBySnapshotId(snapshotId: string): Promise<RuntimeReplayAnchorRow | null> {
    if (!this.prisma || !snapshotId.trim()) return null;
    const r = await this.prisma.agentRuntimeReplayAnchor.findUnique({
      where: { snapshotId: snapshotId.trim() },
    });
    return r ? this.mapRow(r) : null;
  }

  private mapRow(r: AgentRuntimeReplayAnchor): RuntimeReplayAnchorRow {
    return {
      id: r.id,
      snapshot_id: r.snapshotId,
      query_id: r.queryId,
      admission_path: r.admissionPath as RuntimeReplayAdmissionPath,
      dedup_request_hash: r.dedupRequestHash,
      phi_digest: r.phiDigest,
      certificate_digest: r.certificateDigest,
      artifact_refs: RuntimeReplayPersistenceService.normalizeArtifactRefs(r.artifactRefs),
      schema_version: r.schemaVersion,
      created_at_ms: r.createdAtMs.toString(),
      created_at: r.createdAt.toISOString(),
      partial_recompute_scope: RuntimeReplayPersistenceService.castPartialScope(r.partialRecomputeScope),
      artifact_evolution: RuntimeReplayPersistenceService.castArtifactEvolution(r.artifactEvolution),
    };
  }

  private static castPartialScope(raw: unknown): PartialRecomputeScope | null | undefined {
    if (raw === undefined) return undefined;
    if (raw === null) return null;
    if (typeof raw !== 'object') return null;
    const o = raw as PartialRecomputeScope;
    if (!Array.isArray(o.artifactIds) || typeof o.invalidation !== 'string') return null;
    return o;
  }

  private static castArtifactEvolution(raw: unknown): ArtifactEvolutionRecord | null | undefined {
    if (raw === undefined) return undefined;
    if (raw === null) return null;
    if (typeof raw !== 'object') return null;
    const o = raw as ArtifactEvolutionRecord;
    if (typeof o.artifactId !== 'string' || typeof o.version !== 'number') return null;
    return o;
  }

  private static normalizeArtifactRefs(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is string => typeof x === 'string');
  }

  private applyEcho(
    response: RouteAndRunResponseDto,
    record: ReplayPersistenceRecord,
    dedupRequestHash: string,
  ): void {
    if (!response.observability) return;
    const o = response.observability as Record<string, unknown>;
    o.runtime_replay_persistence = {
      schema: RUNTIME_PERSISTENCE_SCHEMA,
      snapshot_id: record.snapshotId,
      admission_path: record.admissionPath,
      phi_digest: record.phiDigest,
      dedup_request_hash: dedupRequestHash,
      ...(record.certificateDigest ? { certificate_digest: record.certificateDigest } : {}),
    };
  }

  private stripEcho(response: RouteAndRunResponseDto, snapshotId: string): void {
    const o = response.observability as Record<string, unknown> | undefined;
    if (!o) return;
    const echo = o.runtime_replay_persistence as { snapshot_id?: string } | undefined;
    if (echo?.snapshot_id === snapshotId) {
      delete o.runtime_replay_persistence;
    }
  }

  /** Best-effort：INSERT 成功后写入 DB 主键（异步 persist 完成时响应可能已序列化发出）。 */
  private patchEchoRowId(response: RouteAndRunResponseDto, snapshotId: string, rowId: string): void {
    const o = response.observability as Record<string, unknown> | undefined;
    const echo = o?.runtime_replay_persistence as { snapshot_id?: string; anchor_row_id?: string } | undefined;
    if (echo?.snapshot_id === snapshotId) {
      echo.anchor_row_id = rowId;
    }
  }
}

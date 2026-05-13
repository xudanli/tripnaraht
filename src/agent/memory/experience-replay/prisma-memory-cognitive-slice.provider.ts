import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { DecisionLogCognitiveSlice } from './user-cognitive-profile.types';
import type { IMemoryCognitiveSliceProvider } from './memory-cognitive-slice.provider';
import { COGNITIVE_NEGATIVE_FEEDBACK_TAGS, MEMORY_KERNEL_SLICE_FETCH_LIMIT } from './memory-replay.constants';

type RagCognitiveRow = {
  step: string;
  timestamp: Date;
  metadata: Prisma.JsonValue | null;
};

/**
 * 从 `rag_decision_logs` 投影认知切片（无 PII：仅 step / timestamp / 白名单 metadata 键）。
 *
 * 说明：`subjectRef` 当前与 `MemoryKernelService` 一致，优先对应行的 `request_id`（与 Gate / RAG 持久化路径对齐）。
 * 若生产上 `request_id` 与 `userId` 不一致，需在写入侧统一主语键或扩展本查询（例如按 trip 反查 user）后再设置
 * `EXPERIENCE_REPLAY_PRISMA_SLICE_PROVIDER=1`（见 `memory-replay.constants.ts` 中的 `EXPERIENCE_REPLAY_PRISMA_SLICE_PROVIDER_ENV`）。
 */
@Injectable()
export class PrismaMemoryCognitiveSliceProvider implements IMemoryCognitiveSliceProvider {
  private readonly logger = new Logger(PrismaMemoryCognitiveSliceProvider.name);

  constructor(private readonly prisma: PrismaService) {}

  async loadRecentNarrateSlices(
    subjectRef: string,
    limit = MEMORY_KERNEL_SLICE_FETCH_LIMIT,
  ): Promise<readonly DecisionLogCognitiveSlice[]> {
    const ref = subjectRef?.trim();
    if (!ref) return [];

    const take = Math.min(Math.max(Number(limit) || MEMORY_KERNEL_SLICE_FETCH_LIMIT, 1), MEMORY_KERNEL_SLICE_FETCH_LIMIT);

    let rows: RagCognitiveRow[];
    try {
      rows = await this.prisma.$queryRaw<RagCognitiveRow[]>(Prisma.sql`
        SELECT step, timestamp, metadata
        FROM rag_decision_logs
        WHERE request_id = ${ref}
          AND metadata IS NOT NULL
          AND (
            (step = 'NARRATE' AND COALESCE(metadata::jsonb->>'ebp_stance', '') <> '')
            OR (COALESCE(metadata::jsonb->'user_feedback_tags', '[]'::jsonb) @> '["USER_REJECTION"]'::jsonb)
            OR (COALESCE(metadata::jsonb->'user_feedback_tags', '[]'::jsonb) @> '["USER_NEGATIVE_FEEDBACK"]'::jsonb)
            OR (COALESCE(metadata::jsonb->'research_audit_tags', '[]'::jsonb) @> '["USER_REJECTION"]'::jsonb)
            OR (COALESCE(metadata::jsonb->'research_audit_tags', '[]'::jsonb) @> '["USER_NEGATIVE_FEEDBACK"]'::jsonb)
          )
        ORDER BY timestamp DESC
        LIMIT ${take}
      `);
    } catch (e) {
      this.logger.warn(
        `[PrismaMemoryCognitiveSliceProvider] query failed subjectRef=${ref.slice(0, 8)}… err=${(e as Error)?.message ?? e}`,
      );
      return [];
    }

    const chronological = [...rows].reverse();
    return chronological.map((row) => this.projectRow(row));
  }

  private filterWhitelistTags(md: Record<string, unknown>, key: string): string[] | undefined {
    const raw = md[key];
    const allow = new Set<string>(COGNITIVE_NEGATIVE_FEEDBACK_TAGS as readonly string[]);
    if (!Array.isArray(raw)) return undefined;
    const out = raw.filter((t): t is string => typeof t === 'string' && allow.has(t));
    return out.length ? out : undefined;
  }

  private projectRow(row: RagCognitiveRow): DecisionLogCognitiveSlice {
    const md =
      row.metadata !== null && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : undefined;
    const ts = row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp);
    if (!md) {
      return { step: row.step, timestamp: ts };
    }
    const user_feedback_tags = this.filterWhitelistTags(md, 'user_feedback_tags');
    const research_audit_tags = this.filterWhitelistTags(md, 'research_audit_tags');
    return {
      step: row.step,
      timestamp: ts,
      metadata: {
        ebp_stance: typeof md.ebp_stance === 'string' ? md.ebp_stance : undefined,
        effective_voice_tone:
          typeof md.effective_voice_tone === 'string' || md.effective_voice_tone === null
            ? (md.effective_voice_tone as string | null)
            : undefined,
        conflict_count: typeof md.conflict_count === 'number' ? md.conflict_count : undefined,
        decision_source: typeof md.decision_source === 'string' ? md.decision_source : undefined,
        ...(user_feedback_tags ? { user_feedback_tags } : {}),
        ...(research_audit_tags ? { research_audit_tags } : {}),
      },
    };
  }
}

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../../../llm/services/llm.service';
import type { RouteAndRunRequestDto } from '../../dto/route-and-run.dto';
import type { AgentMemoryContext } from '../interfaces/agent-memory-context.interface';
import { TripTaskMemoryService } from '../../context-engine/services/trip-task-memory.service';
import {
  buildEpisodicSummarizerLlmPrompt,
  parseEpisodicSummarizerLlmEnabled,
  parseEpisodicSummaryFromLlmJson,
} from '../utils/episodic-memory-summarizer-llm.util';
import {
  applyEpisodicCompactionToConversationContext,
  buildDeterministicEpisodicSummary,
  buildEpisodicSummarizerObservability,
  EPISODIC_SUMMARY_CONSTRAINT_KEY,
  estimateConversationTokens,
  parseEpisodicCompactionKeepRecent,
  parseEpisodicSummarizerEnabled,
  parseEpisodicSummarizeMinMessages,
  readEpisodicSummaryFromTripTask,
  shouldScheduleEpisodicSummarize,
  type EpisodicSummarizerObservabilityV1,
} from '../utils/episodic-memory-summarizer.util';
import {
  markEpisodicSummarizerSchedule,
  readEpisodicSummarizerScheduleMark,
} from '../utils/episodic-summarizer-request-mark.util';

/**
 * State P3：长 session 情景 memory 异步 summarizer（fire-and-forget，不阻塞 route_and_run）。
 */
@Injectable()
export class EpisodicMemorySummarizerService {
  private readonly logger = new Logger(EpisodicMemorySummarizerService.name);
  private readonly inFlight = new Set<string>();

  constructor(
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly tripTaskMemory?: TripTaskMemoryService,
    @Optional() private readonly llmService?: LlmService,
  ) {}

  isEnabled(): boolean {
    return parseEpisodicSummarizerEnabled({
      HARNESS_EPISODIC_SUMMARIZER:
        this.configService?.get<string>('HARNESS_EPISODIC_SUMMARIZER') ??
        process.env.HARNESS_EPISODIC_SUMMARIZER,
      EPISODIC_MEMORY_SUMMARIZER_ENABLED:
        this.configService?.get<string>('EPISODIC_MEMORY_SUMMARIZER_ENABLED') ??
        process.env.EPISODIC_MEMORY_SUMMARIZER_ENABLED,
    });
  }

  private isLlmEnabled(): boolean {
    return parseEpisodicSummarizerLlmEnabled({
      HARNESS_EPISODIC_SUMMARIZER_LLM:
        this.configService?.get<string>('HARNESS_EPISODIC_SUMMARIZER_LLM') ??
        process.env.HARNESS_EPISODIC_SUMMARIZER_LLM,
      EPISODIC_SUMMARIZER_USE_LLM:
        this.configService?.get<string>('EPISODIC_SUMMARIZER_USE_LLM') ??
        process.env.EPISODIC_SUMMARIZER_USE_LLM,
    });
  }

  /** 主链 memory hydrate 后：若有 episodic summary 则压缩 conversation_context */
  applyCompactionFromMemoryInPlace(
    request: RouteAndRunRequestDto,
    memory: AgentMemoryContext | undefined,
  ): EpisodicSummarizerObservabilityV1 {
    const enabled = this.isEnabled();
    const episodic = readEpisodicSummaryFromTripTask(memory?.activeTripState);
    if (!enabled || !episodic) {
      return buildEpisodicSummarizerObservability({
        enabled,
        scheduled: false,
        compactionApplied: false,
        episodicSummaryPresent: !!episodic,
      });
    }
    const keepRecent = parseEpisodicCompactionKeepRecent();
    const result = applyEpisodicCompactionToConversationContext(request, episodic, keepRecent);
    return buildEpisodicSummarizerObservability({
      enabled: true,
      scheduled: false,
      compactionApplied: result.applied,
      conversationTokensBefore: result.tokensBefore,
      conversationTokensAfter: result.tokensAfter,
      episodicSummaryPresent: true,
      summarySource: episodic.summary_source ?? null,
    });
  }

  /** route_and_run 完成后异步调度（不阻塞响应） */
  scheduleAfterRouteAndRun(request: RouteAndRunRequestDto): void {
    const requestId = String(request.request_id ?? '').trim();
    if (!this.isEnabled()) {
      if (requestId) {
        markEpisodicSummarizerSchedule(requestId, { scheduled: false, skip_reason: 'disabled' });
      }
      return;
    }
    const tripId = String(request.trip_id ?? '').trim();
    if (!tripId || !this.tripTaskMemory) {
      if (requestId) {
        markEpisodicSummarizerSchedule(requestId, {
          scheduled: false,
          skip_reason: 'no_trip_id',
        });
      }
      return;
    }
    const messages = request.conversation_context?.recent_messages ?? [];
    const minMessages = parseEpisodicSummarizeMinMessages();
    if (!shouldScheduleEpisodicSummarize(messages, minMessages)) {
      if (requestId) {
        markEpisodicSummarizerSchedule(requestId, {
          scheduled: false,
          skip_reason: 'below_threshold',
        });
      }
      return;
    }
    if (this.inFlight.has(tripId)) {
      if (requestId) {
        markEpisodicSummarizerSchedule(requestId, { scheduled: false, skip_reason: 'in_flight' });
      }
      return;
    }
    this.inFlight.add(tripId);
    markEpisodicSummarizerSchedule(requestId, { scheduled: true, scheduled_at: new Date().toISOString() });

    void this.persistSummary(tripId, messages, requestId)
      .catch((err) => {
        this.logger.warn(
          `[EpisodicSummarizer] persist failed trip=${tripId} request=${requestId}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      })
      .finally(() => this.inFlight.delete(tripId));
  }

  buildObservabilityForRequest(
    request: RouteAndRunRequestDto,
    ingressObs?: EpisodicSummarizerObservabilityV1,
  ): EpisodicSummarizerObservabilityV1 {
    const enabled = this.isEnabled();
    const mark = readEpisodicSummarizerScheduleMark(String(request.request_id ?? ''));
    if (ingressObs) {
      return {
        ...ingressObs,
        enabled,
        scheduled: mark?.scheduled ?? ingressObs.scheduled,
        skip_reason: mark?.skip_reason ?? ingressObs.skip_reason,
      };
    }
    return buildEpisodicSummarizerObservability({
      enabled,
      scheduled: mark?.scheduled ?? false,
      skipReason: mark?.skip_reason,
      compactionApplied: false,
      episodicSummaryPresent: false,
    });
  }

  private async persistSummary(
    tripId: string,
    messages: readonly string[],
    requestId: string,
  ): Promise<void> {
    const tokensBefore = estimateConversationTokens(messages);
    const built = await this.buildSummaryText(messages);
    const episodicSummary = {
      schemaId: 'tripnara.episodic_summary@v1' as const,
      version: 1 as const,
      summary: built.summary,
      source_message_count: messages.length,
      tokens_before: tokensBefore,
      tokens_after: built.tokensAfter,
      updated_at: new Date().toISOString(),
      summary_source: built.source,
    };

    const existing = await this.tripTaskMemory!.get(tripId);
    const constraints = {
      ...(existing?.constraints ?? {}),
      [EPISODIC_SUMMARY_CONSTRAINT_KEY]: episodicSummary,
    };
    await this.tripTaskMemory!.update(tripId, { constraints });
    markEpisodicSummarizerSchedule(requestId, {
      scheduled: true,
      tokens_before: tokensBefore,
      tokens_after: built.tokensAfter,
    });
    this.logger.debug(
      `[EpisodicSummarizer] trip=${tripId} source=${built.source} messages=${messages.length} tokens ${tokensBefore}->${built.tokensAfter}`,
    );
  }

  private async buildSummaryText(
    messages: readonly string[],
  ): Promise<{ summary: string; tokensAfter: number; source: 'deterministic' | 'llm' }> {
    const deterministic = buildDeterministicEpisodicSummary(messages);
    if (!this.isLlmEnabled() || !this.llmService) {
      return { ...deterministic, source: 'deterministic' };
    }
    try {
      const prompt = buildEpisodicSummarizerLlmPrompt(messages);
      const raw = await this.llmService.callLlmWithSchema(
        this.llmService.getDefaultProvider(),
        prompt,
        {
          type: 'object',
          properties: { summary: { type: 'string' } },
          required: ['summary'],
        },
        {
          request_id: 'episodic-summarizer',
          state_machine_step: 'STATE_UPDATE',
          sub_agent: 'Orchestrator',
        },
      );
      const llmSummary = parseEpisodicSummaryFromLlmJson(raw);
      if (llmSummary) {
        const wrapped = llmSummary.startsWith('[EpisodicSummary]')
          ? llmSummary
          : `[EpisodicSummary] ${llmSummary}`;
        return {
          summary: wrapped.slice(0, 900),
          tokensAfter: Math.ceil(wrapped.length / 4),
          source: 'llm',
        };
      }
    } catch (err) {
      this.logger.debug(
        `[EpisodicSummarizer] LLM fallback: ${err instanceof Error ? err.message : err}`,
      );
    }
    return { ...deterministic, source: 'deterministic' };
  }
}

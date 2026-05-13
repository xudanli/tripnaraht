import { Inject, Injectable, Optional } from '@nestjs/common';
import type { AgentMemoryContext } from '../interfaces/agent-memory-context.interface';
import { MemorySnapshotPersistenceService } from '../persistence/memory-snapshot-persistence.service';
import { assembleRecomputePayloadV1 } from './recompute-payload-assembler.util';
import {
  formatIncrementalKernelUserSegment,
  INCREMENTAL_KERNEL_SYSTEM_PROMPT_V1,
} from './incremental-kernel-formatter.util';
import { parseIncrementalKernelDecisionsFromLlmText } from './incremental-recompute-llm-parse.util';
import {
  INCREMENTAL_RECOMPUTE_LLM,
  type IncrementalRecomputeLlmPort,
} from './incremental-recompute-llm.port';
import type { IncrementalReconcileOptionsV1, ReconcileResultV1 } from './incremental-recompute-orchestrator.types';
import { LedgerRecomputeExecutorService } from './ledger-recompute-executor.service';
import { LedgerWritebackService } from './ledger-writeback.service';
import type { DecisionLedgerSnapshot } from './decision-ledger.types';
import { containsHardConstraintViolation } from './ledger-recompute-severity.config';
import { deriveMemoryLedgerPhaseFromTripTask } from './decision-ledger-world-anchor.util';

@Injectable()
export class IncrementalRecomputeOrchestratorService {
  constructor(
    private readonly persistence: MemorySnapshotPersistenceService,
    private readonly executor: LedgerRecomputeExecutorService,
    private readonly writeback: LedgerWritebackService,
    @Optional() @Inject(INCREMENTAL_RECOMPUTE_LLM) private readonly llm?: IncrementalRecomputeLlmPort,
  ) {}

  /**
   * 从快照头加载账本 → 计划 → Prompt+LLM → 解析 → 写回 →（收敛则）持久化；支持多轮直到 maxRetries。
   */
  async reconcile(tripId: string, options?: IncrementalReconcileOptionsV1): Promise<ReconcileResultV1> {
    const maxRetries = options?.maxRetries ?? 2;
    const trace: string[] = [];

    if (!this.llm) {
      return { status: 'LLM_NOT_CONFIGURED', trace: ['llm_port_missing'] };
    }

    const loaded = await this.persistence.loadLatestContextForTrip(tripId);
    if (!loaded?.decisionLedger) {
      return { status: 'NO_LEDGER', trace: ['no_snapshot_or_no_decision_ledger'] };
    }

    let currentLedger: DecisionLedgerSnapshot = loaded.decisionLedger;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      const plan = this.executor.buildExecutionPlan(currentLedger);
      if (plan.invalidatedSteps.length === 0) {
        trace.push(`idle: no INVALIDATED steps (stale=${plan.staleSteps.length})`);
        return {
          status: 'IDLE',
          trace,
          finalLedger: currentLedger,
          snapshotVersion: loaded.snapshotVersion,
        };
      }

      const payload = assembleRecomputePayloadV1(currentLedger, {
        driftContext: options?.driftContext ?? [],
      });
      const userPrompt = formatIncrementalKernelUserSegment(payload);

      let rawResponse: string;
      try {
        rawResponse = await this.llm.chat([
          { role: 'system', content: INCREMENTAL_KERNEL_SYSTEM_PROMPT_V1 },
          { role: 'user', content: userPrompt },
        ]);
      } catch (e: any) {
        trace.push(`llm_error: ${e?.message ?? e}`);
        return { status: 'LLM_ERROR', trace, reason: e?.message };
      }

      const parsed = parseIncrementalKernelDecisionsFromLlmText(rawResponse);
      if (parsed.ok === false) {
        trace.push(`parse_error: ${parsed.error}`);
        return { status: 'PARSE_ERROR', trace, parseError: parsed.error };
      }

      const memoryPhase = deriveMemoryLedgerPhaseFromTripTask(loaded.activeTripState);
      const wb = this.writeback.mergeIncrementalKernelDecisions(currentLedger, parsed.decisions, {
        memoryPhase,
        nowMs: Date.now(),
      });

      if (wb.errors?.length) {
        trace.push(`writeback_schema: ${wb.errors.join('; ')}`);
        return { status: 'SCHEMA_VIOLATION', trace, errors: wb.errors };
      }

      currentLedger = wb.ledger;
      trace.push(
        `loop_${retryCount}: merged=${parsed.decisions.length} secondary=${wb.secondaryInvalidated.length} stable=${wb.isStable}`,
      );

      if (!wb.isStable && containsHardConstraintViolation(wb.secondaryInvalidated, wb.ledger.nodes)) {
        trace.push(`escalate_hard_constraint: ids=[${wb.secondaryInvalidated.join(',')}]`);
        return {
          status: 'ESCALATED_HARD_CONSTRAINT',
          reason: `Secondary invalidation hit hard constraint: ${wb.secondaryInvalidated.join(',')}`,
          trace,
          finalLedger: currentLedger,
        };
      }

      if (wb.isStable) {
        const saved = await this.persistence.saveLedgerUpdate(tripId, currentLedger);
        if (!saved) {
          trace.push('persist_skipped_or_failed');
          return {
            status: 'PERSIST_SKIPPED',
            trace,
            finalLedger: currentLedger,
            snapshotVersion: loaded.snapshotVersion,
          };
        }
        trace.push(`converged: snapshot_version=${saved.snapshotVersion}`);
        return {
          status: 'CONVERGED',
          trace,
          finalLedger: saved.decisionLedger,
          snapshotVersion: saved.snapshotVersion,
        };
      }

      retryCount += 1;
    }

    trace.push('max_retries_reached');
    return {
      status: 'ESCALATED',
      reason: 'MAX_RETRIES_REACHED',
      trace,
      finalLedger: currentLedger,
    };
  }
}

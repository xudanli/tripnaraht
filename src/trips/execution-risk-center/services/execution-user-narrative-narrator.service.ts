/**
 * Optional LLM narrator for execution userNarrative — rules-first with async enhancement port.
 * Enable: EXECUTION_NARRATIVE_NARRATOR_ENABLED=1 (+ EXECUTION_NARRATIVE_NARRATOR_LLM=1 for future LLM)
 */

import { Injectable, Logger } from '@nestjs/common';
import type {
  ExecutionUserNarrativeDto,
} from '../../../mobile/dto/mobile-execution.types';
import type { RecoveryGraph } from '../../tep/contracts/tep-self-drive.types';

export interface ExecutionUserNarrativeFacts {
  tripId: string;
  place?: string;
  activities?: Array<{ label: string; time?: string }>;
  deadline?: string;
  semanticCapability?: string;
  recoveryGraph?: RecoveryGraph;
  ruleNarrative: ExecutionUserNarrativeDto;
}

export interface ExecutionUserNarrativeNarratorPort {
  isEnabled(): boolean;
  enhance(facts: ExecutionUserNarrativeFacts): Promise<ExecutionUserNarrativeDto | null>;
}

@Injectable()
export class ExecutionUserNarrativeNarratorService implements ExecutionUserNarrativeNarratorPort {
  private readonly logger = new Logger(ExecutionUserNarrativeNarratorService.name);

  isEnabled(): boolean {
    const v = process.env.EXECUTION_NARRATIVE_NARRATOR_ENABLED?.trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  }

  private llmEnabled(): boolean {
    const v = process.env.EXECUTION_NARRATIVE_NARRATOR_LLM?.trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  }

  async enhance(facts: ExecutionUserNarrativeFacts): Promise<ExecutionUserNarrativeDto | null> {
    if (!this.isEnabled()) return null;

    if (this.llmEnabled()) {
      this.logger.debug(
        `Narrator LLM not wired trip=${facts.tripId} — using rule fallback`,
      );
      return null;
    }

    return this.enhanceFromRecoveryGraph(facts);
  }

  /** Deterministic Phase D+ enhancement — no LLM. */
  private enhanceFromRecoveryGraph(
    facts: ExecutionUserNarrativeFacts,
  ): ExecutionUserNarrativeDto | null {
    const topOption = facts.recoveryGraph?.fallbackOptions?.[0];
    if (!topOption?.description?.trim()) return null;

    const recommendation = topOption.description.trim();
    if (
      facts.ruleNarrative.recommendation === recommendation ||
      isKeepOriginalPhrase(facts.ruleNarrative.recommendation)
    ) {
      return {
        ...facts.ruleNarrative,
        recommendation,
      };
    }

    if (facts.ruleNarrative.recommendation?.includes(recommendation.slice(0, 12))) {
      return null;
    }

    return {
      ...facts.ruleNarrative,
      recommendation,
    };
  }
}

function isKeepOriginalPhrase(text: string | undefined): boolean {
  return Boolean(text && /保持原计划|keep\s*original/i.test(text));
}

export async function applyOptionalNarratorEnhancement(
  facts: ExecutionUserNarrativeFacts,
  narrator?: ExecutionUserNarrativeNarratorPort,
): Promise<ExecutionUserNarrativeDto> {
  if (!narrator?.isEnabled()) return facts.ruleNarrative;
  try {
    const enhanced = await narrator.enhance(facts);
    return enhanced ?? facts.ruleNarrative;
  } catch {
    return facts.ruleNarrative;
  }
}

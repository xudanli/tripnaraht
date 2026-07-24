/**
 * decision.compress — P0 Agent Working Memory
 * Collapses long tool / turn history into stableFacts, unresolvedRisks, rejectedOptions, activePolicies.
 * (Distinct from context.compress which works on ContextBlock[] token budgets.)
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import type { DecisionCompressMemoryOutput } from './types/runtime-os.types';

export interface DecisionCompressInput extends SkillInput {
  /** Short summaries or JSON stringified tool payloads */
  toolResults?: Array<{
    tool?: string;
    ok?: boolean;
    summary?: string;
    data?: unknown;
  }>;
  conversationSnippet?: string[];
  maxFacts?: number;
}

@Injectable()
export class DecisionCompressSkill implements Skill<DecisionCompressInput, DecisionCompressMemoryOutput> {
  private readonly logger = new Logger(DecisionCompressSkill.name);

  metadata = {
    name: 'decision.compress',
    description:
      'decision.compress：OS: 将多轮 tool 结果压缩为工作记忆（stableFacts、unresolvedRisks、rejectedOptions、activePolicies），供后续推理续写。',
    version: '1.0.0',
    category: 'decision' as const,
    toolGroup: 'CONTEXT' as const,
  };

  async execute(input: DecisionCompressInput): Promise<DecisionCompressMemoryOutput> {
    this.logger.debug(`decision.compress: tools=${input.toolResults?.length ?? 0}`);
    const stableFacts: string[] = [];
    const unresolvedRisks: string[] = [];
    const rejectedOptions: string[] = [];
    const activePolicies: string[] = [];

    const cap = Math.min(40, Math.max(8, input.maxFacts ?? 20));

    for (const tr of input.toolResults || []) {
      const label = tr.tool || 'tool';
      const blob = [tr.summary, tr.data != null ? JSON.stringify(tr.data).slice(0, 1200) : '']
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (tr.ok === false || /\breject|denied|blocked|invalid|error\b/i.test(blob)) {
        rejectedOptions.push(`${label}:failed_or_rejected`);
      }
      if (/\bstorm|wind|closed|avalanche|flood|hard\b/i.test(blob)) {
        unresolvedRisks.push(`${label}:environment_or_constraint`);
      }
      if (/\bopen|ok|allowed|success|valid\b/i.test(blob) && tr.ok !== false) {
        stableFacts.push(`${label}:ok_signal`);
      }
      if (/policy|must|require|4x4|buffer/i.test(blob)) {
        activePolicies.push(`${label}:policy_hint`);
      }
    }

    for (const line of input.conversationSnippet || []) {
      const L = line.slice(0, 400);
      if (/拒|否|放弃|不选|blocked/i.test(L)) {
        rejectedOptions.push(`turn:${L.slice(0, 80)}`);
      }
      if (/风险|危险|注意/i.test(L)) {
        unresolvedRisks.push(`turn:${L.slice(0, 80)}`);
      }
    }

    const dedupe = (xs: string[]) => [...new Set(xs)].slice(0, cap);

    return {
      stableFacts: dedupe(stableFacts),
      unresolvedRisks: dedupe(unresolvedRisks),
      rejectedOptions: dedupe(rejectedOptions),
      activePolicies: dedupe(activePolicies),
    };
  }
}

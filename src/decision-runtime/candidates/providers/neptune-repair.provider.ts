/**
 * Neptune road-close repair → RepairProvider (Optimization layer artifact).
 */

import { Injectable } from '@nestjs/common';
import type {
  RepairProvider,
  RepairProviderInput,
  RepairProviderResult,
  RepairProposal,
} from '../contracts/decision-providers';
import {
  buildNeptuneRoadRepairCandidates,
  type BuildNeptuneRoadRepairInput,
} from '../../../trips/guardian-decision-core/adapters/neptune-road-repair.adapter';
import type { Rfc001RepairCandidate } from '../../../trips/guardian-decision-core/contracts/guardian-outputs.types';

export const NEPTUNE_REPAIR_PROVIDER_CONTEXT_KEY = 'neptune';

@Injectable()
export class NeptuneRepairProvider implements RepairProvider {
  readonly providerId = 'neptune-repair' as const;

  async proposeRepairs(input: RepairProviderInput): Promise<RepairProviderResult> {
    const neptuneInput = readNeptuneRepairContext(input);
    if (!neptuneInput) {
      return emptyResult(input.tripId);
    }

    const candidates = buildNeptuneRoadRepairCandidates(neptuneInput);
    return {
      schemaId: 'tripnara.repair_provider_result@v1',
      providerId: this.providerId,
      tripId: input.tripId,
      proposals: candidates.map(mapNeptuneCandidateToProposal),
      rfc001RepairCandidates: candidates,
      generatedAt: new Date().toISOString(),
    };
  }
}

function readNeptuneRepairContext(
  input: RepairProviderInput,
): BuildNeptuneRoadRepairInput | null {
  const raw = input.providerContext?.[NEPTUNE_REPAIR_PROVIDER_CONTEXT_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const ctx = raw as Partial<BuildNeptuneRoadRepairInput>;
  if (
    typeof ctx.workspaceId !== 'string' ||
    !ctx.problem ||
    !ctx.impact ||
    !ctx.basePlan
  ) {
    return null;
  }
  return ctx as BuildNeptuneRoadRepairInput;
}

function mapNeptuneCandidateToProposal(candidate: Rfc001RepairCandidate): RepairProposal {
  return {
    proposalId: candidate.candidateId,
    candidateId: candidate.candidateId,
    label: candidate.generationMethod,
    reasonCodes: [
      candidate.generationMethod,
      ...candidate.degradedIntentRefs.map((ref) => `degraded:${ref}`),
      ...candidate.lostIntentRefs.map((ref) => `lost:${ref}`),
    ],
  };
}

function emptyResult(tripId: string): RepairProviderResult {
  return {
    schemaId: 'tripnara.repair_provider_result@v1',
    providerId: 'neptune-repair',
    tripId,
    proposals: [],
    generatedAt: new Date().toISOString(),
  };
}

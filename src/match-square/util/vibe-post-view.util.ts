import { readVibePayloadFromSnapshot, resolveVibeTeamworkContractModelLabel } from '../engine/vibe-llm-parse.engine';
import { summarizeVibeHardGates } from './vibe-hard-gate.util';
import { buildPostPhysicalHardGateLines } from '../engine/physical-fitness-hard-gate.engine';
import type { VibeLlmPostView } from '../types/vibe-llm.types';

export function buildVibeLlmPostView(captainPersonaSnapshot: unknown): VibeLlmPostView | null {
  const payload = readVibePayloadFromSnapshot(captainPersonaSnapshot);
  if (!payload) return null;

  const vibeHardGates = summarizeVibeHardGates(payload.hard_gates);
  const physicalLines = buildPostPhysicalHardGateLines(payload.recruitment_script_id ?? null);
  const hardGatesSummary = [...vibeHardGates];
  for (const line of physicalLines) {
    if (!hardGatesSummary.some((existing) => existing.includes(line.slice(0, 6)))) {
      hardGatesSummary.push(line);
    }
  }

  return {
    visionText: payload.source_text?.trim() || null,
    chips: payload.vibe_chips.map((chip) => ({
      id: chip.id,
      label: chip.label,
    })),
    contractHint: payload.contract_hint,
    teamworkContractModel: payload.teamwork_contract_model,
    teamworkContractModelLabel: resolveVibeTeamworkContractModelLabel(payload.teamwork_contract_model),
    hardGatesSummary,
    behavioralContracts: payload.behavioral_contracts.map((c) => ({
      title: c.title,
      clauses: c.clauses,
    })),
    parseSource: payload.parse_source,
    recruitmentScriptId: payload.recruitment_script_id ?? null,
    recruitmentSceneCategory: payload.recruitment_scene_category ?? null,
  };
}

import type { GateResult, GuardianEvidenceAtom } from '../../interfaces/trip-plan.interface';
import type {
  DebateCompileInput,
  RedactedDebateArtifact,
  RedactedDebateGuardianSlice,
  RedactedGuardianVote,
} from '../interfaces/decision-trajectory.types';
import type { PIIAnonymizerService } from '../services/pii-anonymizer.service';

function mapAbuVerdict(v: string): RedactedGuardianVote {
  return v === 'ALLOW' ? 'PASS' : 'BLOCK';
}

function mapDreVerdict(v: string): RedactedGuardianVote {
  if (v === 'ALLOW') return 'PASS';
  if (v === 'ADJUST') return 'WARN';
  return 'BLOCK';
}

function mapNeptuneVerdict(v: string): RedactedGuardianVote {
  if (v === 'ALLOW') return 'PASS';
  if (v === 'REPLACE') return 'WARN';
  return 'BLOCK';
}

function extractAxiomRefs(atoms?: GuardianEvidenceAtom[]): string[] {
  if (!atoms?.length) return [];
  const refs = new Set<string>();
  for (const a of atoms) {
    const code = a.violation_code ?? a.tag;
    if (code && String(code).trim()) refs.add(String(code).trim());
  }
  return [...refs].slice(0, 16);
}

function buildReason(
  persona: string,
  verdict: string,
  evidence: string[],
  atoms?: GuardianEvidenceAtom[],
): string {
  const parts: string[] = [`[${persona}] ${verdict}`];
  const ax = extractAxiomRefs(atoms);
  if (ax.length) parts.push(`axioms=${ax.join(',')}`);
  const ev = evidence.filter(Boolean).slice(0, 4);
  if (ev.length) parts.push(ev.join(' | '));
  return parts.join(' — ');
}

function sliceToPersona(
  gr: NonNullable<GateResult['guardian_results']>,
  key: 'abu' | 'drdre' | 'neptune',
  personaLabel: string,
  mapVerdict: (v: string) => RedactedGuardianVote,
): RedactedDebateGuardianSlice | undefined {
  const slice = gr[key];
  if (!slice?.verdict) return undefined;
  return {
    vote: mapVerdict(slice.verdict),
    verdict_raw: slice.verdict,
    reason: buildReason(personaLabel, slice.verdict, slice.evidence ?? [], slice.evidence_atoms),
    axiom_refs: extractAxiomRefs(slice.evidence_atoms),
  };
}

function redactText(pii: PIIAnonymizerService | undefined, text: string): string {
  if (!pii || !text) return text;
  return pii.anonymizeJsonValue(text) as string;
}

/**
 * 将 Gate + LLM 辩论上下文编译为 RedactedDebateArtifact（保留对抗论据，剥离 PII）。
 */
export function compileDebateArtifact(
  input: DebateCompileInput,
  piiAnonymizer?: PIIAnonymizerService,
): RedactedDebateArtifact | undefined {
  const gr = input.gate.guardian_results;
  if (!gr) return undefined;

  const abu = sliceToPersona(gr, 'abu', 'Abu', mapAbuVerdict);
  const drDre = sliceToPersona(gr, 'drdre', 'Dr.Dre', mapDreVerdict);
  if (!abu || !drDre) return undefined;

  const neptune = sliceToPersona(gr, 'neptune', 'Neptune', mapNeptuneVerdict);

  const artifact: RedactedDebateArtifact = {
    source: input.source,
    tie_break_used: Boolean(input.tie_break_used),
    debate_gate_fusion: input.debate_gate_fusion,
    guardian_votes_redacted: {
      abu: {
        ...abu,
        reason: redactText(piiAnonymizer, abu.reason),
      },
      dr_dre: {
        ...drDre,
        reason: redactText(piiAnonymizer, drDre.reason),
      },
      ...(neptune
        ? {
            neptune: {
              ...neptune,
              reason: redactText(piiAnonymizer, neptune.reason),
            },
          }
        : {}),
    },
  };

  if (gr.debate_summary_zh?.trim()) {
    artifact.debate_summary_zh = redactText(piiAnonymizer, gr.debate_summary_zh.trim());
  }

  if (input.prompts) {
    artifact.prompts_redacted = {
      system_prompt: redactText(piiAnonymizer, input.prompts.system_prompt),
      user_prompt: redactText(piiAnonymizer, input.prompts.user_prompt),
    };
  }

  if (input.raw_completion?.trim()) {
    artifact.raw_completion_redacted = redactText(piiAnonymizer, input.raw_completion.trim());
  }

  return artifact;
}

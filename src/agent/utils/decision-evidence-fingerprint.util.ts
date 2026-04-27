import type { DecisionState, VerificationIssue } from '../../decision/kernel/decision-state.types';

export interface DecisionEvidenceSummary {
  cid: string;
  slack: number;
  unit: string;
  ref: string;
  isHard: boolean;
  evidenceRefIds?: string[];
}

export function collectDecisionEvidenceSummaries(
  decisionState: DecisionState | undefined,
): DecisionEvidenceSummary[] {
  const issues = (decisionState as any)?.verification?.issues as VerificationIssue[] | undefined;
  if (!Array.isArray(issues) || issues.length === 0) return [];

  const out: DecisionEvidenceSummary[] = [];
  for (const issue of issues) {
    const parsed = parseL3ProofPrefix(String((issue as any)?.message ?? ''));
    if (!parsed) continue;
    out.push({
      cid: parsed.cid,
      slack: parsed.slack,
      unit: parsed.unit,
      ref: parsed.ref,
      isHard: String((issue as any)?.class ?? '').toUpperCase() !== 'ADVISORY',
      ...(parsed.evidenceRefIds?.length ? { evidenceRefIds: parsed.evidenceRefIds } : {}),
    });
  }
  return out;
}

export function computeDecisionEvidenceFingerprint(
  decisionEvidence: DecisionEvidenceSummary[],
): {
  evidence_fingerprint: string;
  acknowledged_violations: string[];
  max_violation_slack: number | null;
} {
  const sorted = [...decisionEvidence].sort((a, b) => {
    const c = a.cid.localeCompare(b.cid);
    if (c !== 0) return c;
    const r = a.ref.localeCompare(b.ref);
    if (r !== 0) return r;
    return a.slack - b.slack;
  });

  const stable = JSON.stringify(
    sorted.map((e) => ({
      cid: e.cid,
      slack: e.slack,
      unit: e.unit,
      ref: e.ref,
      isHard: e.isHard,
      evidenceRefIds: e.evidenceRefIds ? [...e.evidenceRefIds].sort() : [],
    })),
  );

  // lightweight stable hash (djb2) to avoid crypto dependency
  let h = 5381;
  for (let i = 0; i < stable.length; i++) h = (h * 33) ^ stable.charCodeAt(i);
  const evidence_fingerprint = `djb2:${(h >>> 0).toString(16)}`;

  const violations = sorted.filter((e) => Number.isFinite(e.slack) && e.slack < 0);
  const acknowledged_violations = [...new Set(violations.map((v) => v.cid))];
  const max_violation_slack =
    violations.length > 0 ? Math.min(...violations.map((v) => v.slack)) : null;

  return { evidence_fingerprint, acknowledged_violations, max_violation_slack };
}

function parseL3ProofPrefix(message: string): {
  cid: string;
  slack: number;
  unit: string;
  ref: string;
  evidenceRefIds?: string[];
} | undefined {
  const s = String(message ?? '');
  if (!s.startsWith('[L3-PROOF|')) return undefined;
  const end = s.indexOf(']');
  if (end <= 0) return undefined;
  const inside = s.slice(1, end);
  const parts = inside.split('|').map((x) => x.trim());
  if (parts.length < 4) return undefined;
  if (parts[0] !== 'L3-PROOF') return undefined;

  const cid = parts[1];
  const entity = parts[2]; // "TYPE:ID"

  let unit = '';
  let slackStr: string | undefined;
  let evidenceRefIds: string[] | undefined;

  for (let i = 3; i < parts.length; i++) {
    const p = parts[i];
    if (p.startsWith('unit:')) unit = p.slice('unit:'.length);
    if (p.startsWith('slack:')) slackStr = p.slice('slack:'.length);
    if (p.startsWith('evidence:')) {
      const rest = p.slice('evidence:'.length);
      const segs = rest.split(':');
      const ids = segs.length >= 2 ? segs.slice(1).join(':') : '';
      const list = ids ? ids.split(',').map((x) => x.trim()).filter(Boolean) : [];
      if (list.length) evidenceRefIds = list;
    }
  }

  const slack = Number(slackStr);
  if (!cid || !entity || !Number.isFinite(slack)) return undefined;
  if (!unit) unit = 'unknown';

  return {
    cid,
    slack,
    unit,
    ref: entity,
    ...(evidenceRefIds?.length ? { evidenceRefIds } : {}),
  };
}


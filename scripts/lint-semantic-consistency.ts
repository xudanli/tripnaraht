import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assembleEvidenceCardUIProps } from '../src/agent/utils/evidence-ui-assembler.util';
import type { DecisionEvidenceCardPayload } from '../src/agent/utils/evidence-payload-assembler.util';
import type { EvidenceCardUIProps } from '../src/shared/interfaces/evidence-ui.interface';

type AnyObj = Record<string, any>;

type LintFinding = {
  level: 'error' | 'warn';
  rule: string;
  message: string;
  details?: Record<string, unknown>;
};

type LintRowResult = {
  ok: boolean;
  request_id?: string;
  early_warning_id?: string;
  dominant_cid?: string;
  tier?: number;
  findings: LintFinding[];
};

function containsCriticalWarningLanguage(text: string): boolean {
  const s = String(text ?? '');
  // Keep this intentionally broad (ZH + EN) and can be tuned later.
  return /请确认|需要确认|确认后|警告|注意|风险|谨慎|不可|禁止|warning|confirm|required/i.test(s);
}

function parseArgs(argv: string[]): { input: string; max: number; strict: boolean; json: boolean } {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : 'true';
    args.set(key, val);
  }
  return {
    input: args.get('input') ?? 'artifacts/smoke-dpo-tier3/gold_samples_v1_dpo.jsonl',
    max: parseInt(args.get('max') ?? '5000', 10),
    strict: args.get('strict') === 'true' || args.get('strict') === '1',
    json: args.get('json') === 'true' || args.get('json') === '1',
  };
}

function safeJsonParse(line: string): AnyObj | undefined {
  try {
    return JSON.parse(line) as AnyObj;
  } catch {
    return undefined;
  }
}

function extractNumbers(text: string): number[] {
  const out: number[] = [];
  // Skip common Chinese ordinal like "1号" (route names), which are not quantitative claims.
  const re = /(\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const idx = m.index;
    const nextCh = text[idx + m[0].length];
    if (nextCh === '号') continue;
    const prev = text.slice(Math.max(0, idx - 10), idx).toLowerCase();
    // Skip road naming like "Route 1" / "Rte 1".
    if (/\broute\s*$/.test(prev) || /\brte\s*$/.test(prev)) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function approxEqual(a: number, b: number, absTol: number, relTol: number): boolean {
  const diff = Math.abs(a - b);
  if (diff <= absTol) return true;
  const denom = Math.max(1, Math.abs(b));
  return diff / denom <= relTol;
}

function parseWallHitSecondsFromMetadata(s: unknown): number | undefined {
  if (typeof s !== 'string') return undefined;
  // Accept "9000s" or "9000s (Critical)".
  const m = s.trim().match(/^(\d+)\s*s\b/i);
  if (!m) return undefined;
  const sec = parseInt(m[1], 10);
  return Number.isFinite(sec) && sec > 0 ? sec : undefined;
}

function parsePrecedentPctFromPrompt(prompt: unknown): number | undefined {
  if (typeof prompt !== 'string') return undefined;
  // e.g. "Precedent: N=8, 92% accept"
  const m = prompt.match(/Precedent:\s*N=\s*\d+\s*,\s*(\d+(?:\.\d+)?)%\s*accept/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function toUiPropsFromDecisionMetadata(row: AnyObj): EvidenceCardUIProps[] {
  const md = (row?.metadata ?? {}) as AnyObj;
  const decisionMd = md?.decision_metadata as AnyObj | undefined;
  const cards = (decisionMd?.evidence_cards ?? []) as AnyObj[];
  if (!Array.isArray(cards) || cards.length === 0) return [];

  const tierRaw = md?.persuasion_tier;
  const tier = tierRaw === 1 || tierRaw === 2 || tierRaw === 3 ? tierRaw : undefined;
  const wallHitSeconds = parseWallHitSecondsFromMetadata(md?.wall_hit_distance);
  const wallHitDistanceMs = typeof wallHitSeconds === 'number' ? wallHitSeconds * 1000 : undefined;
  const precedentN = typeof md?.precedent_n === 'number' ? md.precedent_n : undefined;
  const precedentAcceptPct =
    typeof md?.precedent_accept_pct === 'number'
      ? md.precedent_accept_pct
      : typeof md?.accept_pct === 'number'
        ? md.accept_pct
        : parsePrecedentPctFromPrompt(row?.prompt) ?? (typeof precedentN === 'number' ? 90 : undefined);

  return cards
    .filter((c) => c && typeof c === 'object' && c.kind === 'iron_shield_evidence')
    .map((c) => {
      const withTier =
        tier === 1 || tier === 2 || tier === 3 ? ({ ...(c as AnyObj), persuasion_tier: tier } as AnyObj) : (c as AnyObj);
      return assembleEvidenceCardUIProps(withTier as DecisionEvidenceCardPayload, {
        ...(wallHitDistanceMs ? { wallHitDistanceMs } : {}),
        ...(precedentN ? { precedentN } : {}),
        ...(precedentAcceptPct ? { precedentAcceptPct } : {}),
      });
    });
}

function lintRow(row: AnyObj): LintRowResult {
  const md = (row?.metadata ?? {}) as AnyObj;
  const tier = md?.persuasion_tier;
  const chosen = String(row?.chosen ?? '');
  const findings: LintFinding[] = [];

  const uiCards = toUiPropsFromDecisionMetadata(row);
  if (uiCards.length === 0) {
    findings.push({ level: 'warn', rule: 'missing_ui_cards', message: 'No evidence cards available to lint.' });
    return { ok: findings.every((f) => f.level !== 'error'), findings, tier };
  }

  // Current pipeline: mostly single-card evidence in each row.
  const ui = uiCards[0];
  const chosenNums = extractNumbers(chosen);

  const allowedNums: Array<{ n: number; source: string }> = [];
  for (const n of extractNumbers(ui.valueDisplay)) allowedNums.push({ n, source: 'valueDisplay' });
  if (ui.benchmark) for (const n of extractNumbers(ui.benchmark)) allowedNums.push({ n, source: 'benchmark' });
  if (ui.impact?.hours != null) allowedNums.push({ n: ui.impact.hours, source: 'impact.hours' });
  if (ui.socialProof?.count != null) allowedNums.push({ n: ui.socialProof.count, source: 'socialProof.count' });
  if (ui.socialProof?.percentage != null) allowedNums.push({ n: ui.socialProof.percentage, source: 'socialProof.percentage' });

  // Heuristic: if valueDisplay contains "+ 60m", allow "1" hour mention.
  const mOffset = ui.valueDisplay.match(/\+\s*(\d+(?:\.\d+)?)m\b/i);
  if (mOffset) {
    const mins = Number(mOffset[1]);
    if (Number.isFinite(mins) && mins > 0) {
      const hours = mins / 60;
      if (Number.isFinite(hours) && hours > 0) allowedNums.push({ n: hours, source: 'derived.offset_hours' });
    }
  }

  const absTol = 0.6; // e.g. 19.5 ≈ 20
  const relTol = 0.05; // 5%

  const anyAnchorPresent =
    allowedNums.length > 0 &&
    chosenNums.some((x) => allowedNums.some((a) => approxEqual(x, a.n, absTol, relTol)));

  if (!anyAnchorPresent) {
    findings.push({
      level: 'error',
      rule: 'missing_numeric_anchor',
      message: 'Chosen text has no numeric anchor that matches UI evidence (value/benchmark/impact/socialProof).',
      details: {
        chosenNums,
        ui: { valueDisplay: ui.valueDisplay, benchmark: ui.benchmark, impact: ui.impact, socialProof: ui.socialProof },
      },
    });
  }

  // Guard against hallucinated numbers: every number mentioned should be explainable by UI props.
  const hallucinated = chosenNums.filter((x) => !allowedNums.some((a) => approxEqual(x, a.n, absTol, relTol)));
  if (hallucinated.length > 0) {
    findings.push({
      level: tier === 3 ? 'error' : 'warn',
      rule: 'unexplained_numbers',
      message: 'Chosen text contains numbers not supported by UI evidence dictionary.',
      details: { hallucinated, allowed: allowedNums },
    });
  }

  // Tier expectations (soft, because production copy may not always name rule_id/rule_name).
  if (tier === 1) {
    if (ui.impact != null || ui.socialProof != null) {
      findings.push({
        level: 'warn',
        rule: 'tier1_density_violation',
        message: 'Tier 1 should not carry impact/socialProof blocks in UI props.',
        details: { impact: ui.impact, socialProof: ui.socialProof },
      });
    }
  }

  if (tier === 3) {
    if (!ui.socialProof || ui.socialProof.count <= 0) {
      findings.push({
        level: 'error',
        rule: 'tier3_missing_social_proof',
        message: 'Tier 3 requires social proof in UI evidence dictionary.',
        details: { socialProof: ui.socialProof },
      });
    }
    if (!ui.policyReference?.ruleId) {
      findings.push({
        level: 'warn',
        rule: 'tier3_missing_policy_anchor',
        message: 'Tier 3 should carry a policy anchor (ruleId/ruleName) for auditability.',
      });
    }
  }

  // Drift contract: critical drift must be communicated explicitly.
  if (String(md?.drift_severity ?? '') === 'critical') {
    if (!containsCriticalWarningLanguage(chosen)) {
      findings.push({
        level: 'error',
        rule: 'critical_drift_requires_warning',
        message: 'drift_severity=critical requires explicit warning/confirmation language in chosen text.',
        details: { drift_severity: md.drift_severity },
      });
    }
  }

  return {
    ok: findings.every((f) => f.level !== 'error'),
    request_id: md?.request_id,
    early_warning_id: md?.early_warning_id,
    dominant_cid: md?.dominant_cid,
    tier,
    findings,
  };
}

async function main() {
  const { input, max, strict, json } = parseArgs(process.argv.slice(2));
  const inPath = resolve(process.cwd(), input);
  const raw = await readFile(inPath, 'utf8');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);

  const results: LintRowResult[] = [];
  for (const line of lines.slice(0, max)) {
    const row = safeJsonParse(line);
    if (!row) continue;
    results.push(lintRow(row));
  }

  const total = results.length;
  const errorRows = results.filter((r) => !r.ok);

  const summary = {
    input: inPath,
    rows_checked: total,
    rows_error: errorRows.length,
    strict,
  };

  if (json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ summary, error_rows: errorRows.slice(0, 50) }, null, 2));
  } else {
    // eslint-disable-next-line no-console
    console.log(`[semantic-consistency] rows=${total} error_rows=${errorRows.length} input=${inPath}`);
    for (const r of errorRows.slice(0, 20)) {
      const id = r.early_warning_id ?? r.dominant_cid ?? 'unknown';
      // eslint-disable-next-line no-console
      console.log(`- FAIL ${id} tier=${String(r.tier ?? '')}: ${r.findings.map((f) => `${f.level}:${f.rule}`).join(', ')}`);
    }
    if (errorRows.length > 20) {
      // eslint-disable-next-line no-console
      console.log(`... ${errorRows.length - 20} more failing rows`);
    }
  }

  if (strict && errorRows.length > 0) process.exit(1);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e?.stack || e);
  process.exit(1);
});

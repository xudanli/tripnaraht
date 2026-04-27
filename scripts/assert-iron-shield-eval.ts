import { readFile } from 'node:fs/promises';

type AnyObj = Record<string, any>;

function getAllStrings(x: any): string[] {
  if (typeof x === 'string') return [x];
  if (Array.isArray(x)) return x.flatMap(getAllStrings);
  if (x && typeof x === 'object') return Object.values(x).flatMap(getAllStrings);
  return [];
}

function hasSafetyTipPrefix(strings: string[]) {
  return strings.some((s) => s.includes('[安全贴士]'));
}

function hasPhysicalAnchor(strings: string[]) {
  // Keep this intentionally flexible: different rules may emit different anchors.
  // We prefer time anchor (e.g. 20:10) OR wind anchor (m/s).
  return strings.some((s) => /\b\d{1,2}:\d{2}\b/.test(s) || s.includes('m/s') || s.includes('mps'));
}

function isNonEmptyObject(x: any): boolean {
  return Boolean(x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length > 0);
}

async function main() {
  const path = process.env.EVAL_PATH ?? 'artifacts/eval/iron_shield_eval_result.json';
  const raw = await readFile(path, 'utf8');
  const json = JSON.parse(raw) as AnyObj;

  const baselineStrings = getAllStrings(json?.baseline?.narration);
  const ironStrings = getAllStrings(json?.iron_shield?.narration);

  const baselineHas = hasSafetyTipPrefix(baselineStrings);
  const ironHas = hasSafetyTipPrefix(ironStrings);
  const ironHasAnchor = hasPhysicalAnchor(ironStrings);

  const allowEvidenceSources = new Set([
    'civil_dusk',
    'sunset',
    'sunset_override',
    'segment_prediction',
    'date_prediction',
    'global_estimate',
  ]);

  const constraints = json?.iron_shield?.constraints;
  const allFindings = [
    ...((constraints?.violations as any[]) ?? []),
    ...((constraints?.warnings as any[]) ?? []),
  ];

  // Evidence contract (Level 3): every finding must carry rule_id + non-empty evidence + known source.
  for (const f of allFindings) {
    if (!f?.rule_id) throw new Error(`Missing rule_id on a constraints finding (path=${path}).`);
    const pt = Number(f?.details?.persuasion_tier);
    if (pt !== 1 && pt !== 2 && pt !== 3) {
      throw new Error(`Missing details.persuasion_tier for rule_id=${String(f?.rule_id)} (path=${path}).`);
    }
    const evidence = f?.details?.evidence;
    if (!isNonEmptyObject(evidence)) {
      throw new Error(`Missing/empty details.evidence for rule_id=${String(f?.rule_id)} (path=${path}).`);
    }
    const src = String(evidence?.source ?? '');
    if (!allowEvidenceSources.has(src)) {
      throw new Error(
        `Invalid evidence.source=${JSON.stringify(src)} for rule_id=${String(
          f?.rule_id,
        )}. Allowed=${Array.from(allowEvidenceSources).join(', ')} (path=${path}).`,
      );
    }
  }

  if (baselineHas) {
    throw new Error(`Baseline narration unexpectedly contains "[安全贴士]" (path=${path}).`);
  }
  if (!ironHas) {
    throw new Error(`Iron-shield narration missing "[安全贴士]" (path=${path}).`);
  }
  if (!ironHasAnchor) {
    throw new Error(
      `Iron-shield narration missing any obvious physical anchor (time HH:mm or wind m/s) (path=${path}).`,
    );
  }

  // Level 4: structured warnings (evidence cards) must surface on narration.warnings.
  const narrWarnings = (json?.iron_shield?.narration?.warnings ?? []) as any[];
  const evidenceCards = narrWarnings.filter((w) => w && typeof w === 'object' && w.kind === 'iron_shield_evidence');
  if (evidenceCards.length < 2) {
    throw new Error(
      `Expected at least 2 narration.warnings evidence cards (wind + fatigue), got ${evidenceCards.length} (path=${path}).`,
    );
  }
  for (const c of evidenceCards) {
    if (!String(c.rule_id ?? '').trim()) {
      throw new Error(`Evidence card missing rule_id (path=${path}).`);
    }
    if (!isNonEmptyObject(c.evidence)) {
      throw new Error(`Evidence card missing evidence object for rule_id=${String(c.rule_id)} (path=${path}).`);
    }
    const src = String(c.evidence?.source ?? '');
    if (!allowEvidenceSources.has(src)) {
      throw new Error(
        `Invalid evidence card source=${JSON.stringify(src)} for rule_id=${String(c.rule_id)} (path=${path}).`,
      );
    }
    const cardTier = Number(c.persuasion_tier);
    if (cardTier !== 1 && cardTier !== 2 && cardTier !== 3) {
      throw new Error(`Evidence card missing persuasion_tier (1|2|3) for rule_id=${String(c.rule_id)} (path=${path}).`);
    }
  }

  // Causal prefixes must appear in user-visible strings (tips / card messages).
  if (!ironStrings.some((s) => s.includes('segment_prediction'))) {
    throw new Error(`Iron-shield narration missing wind causal prefix "segment_prediction" (path=${path}).`);
  }
  if (!ironStrings.some((s) => s.includes('civil_dusk'))) {
    throw new Error(`Iron-shield narration missing solar causal prefix "civil_dusk" (path=${path}).`);
  }

  // Persuasion Tier 3: forced tier must select Tier3 wind template (engine-level contract).
  {
    const { ConstraintRuleManagerService } = await import('../src/agent/training/services/constraint-rule-manager.service');
    const { ConstraintsEngineService } = await import('../src/agent/training/services/constraints-engine.service');
    const dummyConfig: any = { get: () => undefined };
    const ruleManager = new ConstraintRuleManagerService(dummyConfig);
    const engine = new ConstraintsEngineService({} as any, ruleManager);
    const itinerary: any = {
      request_id: 'tier3-smoke',
      days: [
        {
          date: '2026-12-10',
          items: [
            {
              id: 'rt1_south',
              type: 'DRIVE',
              start_window: '15:00',
              end_window: '16:00',
              location_ref: { name: 'South', place_id: 'rt1_south' },
              metadata: { tags: ['drive'], segment_id: 'rt1_south' },
              evidence_refs: [],
              verified: false,
            },
          ],
        },
      ],
    };
    const res = await engine.checkConstraints(itinerary, {
      country_code: 'IS',
      windSpeedBySegment: { rt1_south: 25 },
      persuasion_tier: 3,
    } as any);
    const wind = res.violations.find((v: any) => v.rule_id === 'temp_wind_speed_drive_limit_v1');
    if (wind?.details?.persuasion_tier !== 3) throw new Error('Tier3 smoke: expected details.persuasion_tier=3');
    const t3 = String(wind?.details?.narrator_hint_rendered ?? '');
    if (!t3.includes('第三轮')) {
      throw new Error(`Tier3 smoke: expected wind copy to include 第三轮, got: ${t3.slice(0, 160)}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        eval_path: path,
        baseline_safety_tip: baselineHas,
        iron_shield_safety_tip: ironHas,
        iron_shield_has_anchor: ironHasAnchor,
        constraints_findings: allFindings.length,
        narration_evidence_cards: evidenceCards.length,
        persuasion_tier_smoke: 'tier3_wind_ok',
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e?.stack || e);
  process.exit(1);
});


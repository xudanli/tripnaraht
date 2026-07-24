/**
 * 解析行程 party 体能/资格，并对体验 / 日程触发做 Eligibility 判定。
 */

import type {
  ActivityEligibilityRequirement,
  AgeGroupHint,
  EligibilityCheck,
  EligibilityResult,
  ExperienceEligibilitySubject,
  PartyMemberCapabilities,
  TripPartyCapabilities,
} from './decision-eligibility.types';

const DEFAULT_FITNESS = 5;

export const ACTIVITY_REQUIREMENTS: Record<
  ExperienceEligibilitySubject,
  ActivityEligibilityRequirement
> = {
  glacier: {
    subject: 'glacier',
    activityBanIds: ['glacier', 'glacier_all'],
  },
  glacier_hike: {
    subject: 'glacier_hike',
    minAgeYears: 12,
    minFitnessLevel: 6,
    hardExclusions: ['pregnancy', 'heart_condition', 'recent_surgery', 'mobility_aid'],
    softExclusions: ['severe_asthma'],
    activityBanIds: ['glacier_hike', 'glacier'],
  },
  glacier_short: {
    subject: 'glacier_short',
    minAgeYears: 8,
    minFitnessLevel: 4,
    hardExclusions: ['pregnancy', 'heart_condition', 'mobility_aid'],
    activityBanIds: ['glacier_short', 'glacier'],
  },
  glacier_ice_cave: {
    subject: 'glacier_ice_cave',
    minAgeYears: 10,
    minFitnessLevel: 5,
    hardExclusions: ['pregnancy', 'heart_condition', 'recent_surgery'],
    activityBanIds: ['glacier_ice_cave', 'glacier', 'ice_cave'],
  },
  glacier_viewpoint: {
    subject: 'glacier_viewpoint',
    minAgeYears: 0,
    minFitnessLevel: 2,
    softExclusions: ['mobility_aid'],
    activityBanIds: ['glacier_viewpoint'],
  },
  whale: {
    subject: 'whale',
    minAgeYears: 0,
    minFitnessLevel: 2,
    softExclusions: ['motion_sickness', 'pregnancy'],
    activityBanIds: ['whale', 'whale_watching'],
  },
  silfra: {
    subject: 'silfra',
    minAgeYears: 12,
    minFitnessLevel: 5,
    requiredQualifications: ['swimming'],
    hardExclusions: ['pregnancy', 'heart_condition', 'severe_asthma', 'recent_surgery'],
    activityBanIds: ['silfra', 'snorkeling'],
  },
  snowmobile: {
    subject: 'snowmobile',
    minAgeYears: 16,
    minFitnessLevel: 4,
    requiredQualifications: ['drivers_license'],
    hardExclusions: ['pregnancy', 'heart_condition'],
    softExclusions: ['motion_sickness'],
    activityBanIds: ['snowmobile'],
  },
  super_jeep: {
    subject: 'super_jeep',
    minAgeYears: 4,
    minFitnessLevel: 2,
    softExclusions: ['motion_sickness'],
    activityBanIds: ['super_jeep'],
  },
};

const GLACIER_OPTION_SUBJECT: Record<string, ExperienceEligibilitySubject> = {
  glacier_hike: 'glacier_hike',
  glacier_short: 'glacier_short',
  glacier_ice_cave: 'glacier_ice_cave',
  glacier_viewpoint: 'glacier_viewpoint',
  glacier_skip: 'glacier_viewpoint', // skip 始终可选
};

export function parseTripPartyCapabilities(
  meta: Record<string, unknown>,
): TripPartyCapabilities {
  const evidenceRefs: string[] = [];
  const excludedActivityIds = normalizeStringList(
    meta.excludeActivities ??
      meta.excludedActivities ??
      (meta.partyProfile as Record<string, unknown> | undefined)?.excludeActivities,
  ).map(normalizeToken);

  const fromPartyProfile = parseMembersFromPartyProfile(meta.partyProfile);
  const fromTravelers = parseMembersFromTravelers(meta.travelers);
  const fromCapability = parseMembersFromCapability(meta);

  let members =
    fromPartyProfile.length > 0
      ? fromPartyProfile
      : fromTravelers.length > 0
        ? fromTravelers
        : fromCapability;

  if (fromPartyProfile.length > 0) evidenceRefs.push('party:partyProfile');
  else if (fromTravelers.length > 0) evidenceRefs.push('party:travelers');
  else if (fromCapability.length > 0) evidenceRefs.push('party:fitnessCapability');
  else {
    members = [
      {
        memberId: 'default_adult',
        ageGroup: 'ADULT',
        fitnessLevel: DEFAULT_FITNESS,
        qualifications: normalizeStringList(meta.qualifications),
        exclusions: normalizeStringList(meta.exclusions ?? meta.medicalExclusions),
      },
    ];
    evidenceRefs.push('party:default_adult');
  }

  if (excludedActivityIds.length) evidenceRefs.push(`party:exclude:${excludedActivityIds.join(',')}`);

  const teamFitnessFloor = Math.min(...members.map((m) => m.fitnessLevel));
  const ages = members
    .map((m) => m.ageYears)
    .filter((a): a is number => typeof a === 'number' && Number.isFinite(a));
  const youngestAgeYears = ages.length ? Math.min(...ages) : undefined;

  return {
    members,
    teamFitnessFloor,
    youngestAgeYears,
    hasChildren: members.some(
      (m) => m.ageGroup === 'CHILD' || (m.ageYears != null && m.ageYears < 18),
    ),
    hasElderly: members.some(
      (m) => m.ageGroup === 'ELDERLY' || (m.ageYears != null && m.ageYears >= 65),
    ),
    excludedActivityIds,
    teamQualifications: unique(
      members.flatMap((m) => m.qualifications.map(normalizeToken)),
    ),
    teamExclusions: unique(members.flatMap((m) => m.exclusions.map(normalizeToken))),
    evidenceRefs,
  };
}

export function evaluateExperienceEligibility(
  subject: ExperienceEligibilitySubject,
  party: TripPartyCapabilities,
): EligibilityResult {
  if (subject === 'glacier') {
    return evaluateGlacierMergedEligibility(party);
  }

  const req = ACTIVITY_REQUIREMENTS[subject];
  return evaluateAgainstRequirement(req, party, {
    alwaysAllowSkipOptionIds: subject.startsWith('glacier') ? ['glacier_skip'] : undefined,
  });
}

export function evaluateGlacierMergedEligibility(
  party: TripPartyCapabilities,
): EligibilityResult {
  const optionIds = Object.keys(GLACIER_OPTION_SUBJECT);
  const eligibleOptionIds: string[] = ['glacier_skip'];
  const ineligibleOptionReasons: Record<string, string> = {};
  const allChecks: EligibilityCheck[] = [];
  const softWarnings: string[] = [];

  if (isActivityBanned(party, ACTIVITY_REQUIREMENTS.glacier.activityBanIds ?? [])) {
    return {
      eligible: false,
      reason: '行程排除全部冰川体验',
      checks: [
        {
          code: 'ACTIVITY_BAN',
          dimension: 'ACTIVITY_BAN',
          passed: false,
          detail: 'excludeActivities 含 glacier / glacier_all',
        },
      ],
      softWarnings: [],
      eligibleOptionIds: ['glacier_skip'],
      ineligibleOptionReasons: {
        glacier_hike: '行程排除冰川体验',
        glacier_short: '行程排除冰川体验',
        glacier_ice_cave: '行程排除冰川体验',
        glacier_viewpoint: '行程排除冰川体验',
      },
    };
  }

  for (const optionId of optionIds) {
    if (optionId === 'glacier_skip') continue;
    const sub = GLACIER_OPTION_SUBJECT[optionId];
    const result = evaluateAgainstRequirement(ACTIVITY_REQUIREMENTS[sub], party);
    allChecks.push(...result.checks.map((c) => ({ ...c, code: `${optionId}.${c.code}` })));
    softWarnings.push(...result.softWarnings);
    if (result.eligible) {
      eligibleOptionIds.push(optionId);
    } else if (result.reason) {
      ineligibleOptionReasons[optionId] = result.reason;
    }
  }

  // 至少一种实际上冰川/观景产品可执行 → 主体 eligible
  const hasActiveProduct = eligibleOptionIds.some((id) => id !== 'glacier_skip');
  return {
    eligible: hasActiveProduct,
    reason: hasActiveProduct
      ? undefined
      : '团队体能/年龄/排除项导致无可选冰川产品',
    checks: allChecks,
    softWarnings: unique(softWarnings),
    eligibleOptionIds,
    ineligibleOptionReasons,
  };
}

export function evaluateScheduleTriggerEligibility(
  kind: 'landing_long_drive' | 'ring_vs_south' | 'excessive_daily_drive',
  party: TripPartyCapabilities,
): EligibilityResult {
  // 日程决策默认对全体「可讨论」；儿童/长者抬高 soft warning，不挡触发
  const softWarnings: string[] = [];
  if (party.hasChildren && kind === 'landing_long_drive') {
    softWarnings.push('团队含儿童，落地后长驾更需优先休息方案');
  }
  if (party.hasElderly && (kind === 'landing_long_drive' || kind === 'excessive_daily_drive')) {
    softWarnings.push('团队含长者，建议更严格控制单日驾驶');
  }
  if (party.teamFitnessFloor <= 3 && kind === 'ring_vs_south') {
    softWarnings.push('团队体能偏低，环岛压缩对体验伤害更大');
  }

  return {
    eligible: true,
    checks: [
      {
        code: 'SCHEDULE_DECISION_OPEN',
        dimension: 'TEAM',
        passed: true,
        detail: `${kind} 对全体旅伴可决策`,
      },
    ],
    softWarnings,
  };
}

/** 把不合格 option 标为不可执行 */
export function applyEligibilityToOptionExecutable(
  options: Array<{ optionId: string; executable?: boolean; description: string }>,
  eligibility: EligibilityResult,
): void {
  if (!eligibility.eligibleOptionIds && !eligibility.ineligibleOptionReasons) return;
  const allow = new Set(eligibility.eligibleOptionIds ?? []);
  for (const opt of options) {
    if (eligibility.eligibleOptionIds && !allow.has(opt.optionId)) {
      opt.executable = false;
      const reason = eligibility.ineligibleOptionReasons?.[opt.optionId];
      if (reason && !opt.description.includes(reason)) {
        opt.description = `${opt.description}（不可选：${reason}）`;
      }
    }
  }
}

function evaluateAgainstRequirement(
  req: ActivityEligibilityRequirement,
  party: TripPartyCapabilities,
  _opts?: { alwaysAllowSkipOptionIds?: string[] },
): EligibilityResult {
  const checks: EligibilityCheck[] = [];
  const softWarnings: string[] = [];

  if (isActivityBanned(party, req.activityBanIds ?? [])) {
    checks.push({
      code: 'ACTIVITY_BAN',
      dimension: 'ACTIVITY_BAN',
      passed: false,
      detail: `excludeActivities 命中 ${req.subject}`,
    });
    return fail(checks, softWarnings, `行程排除活动 ${req.subject}`);
  }

  if (req.minAgeYears != null && req.minAgeYears > 0) {
    const youngest = party.youngestAgeYears;
    const childWithoutAge = party.hasChildren && youngest == null;
    const ageOk =
      youngest == null
        ? !party.hasChildren || req.minAgeYears <= 0
        : youngest >= req.minAgeYears;
    // 有儿童但无年龄 → 保守判定：门槛 ≥12 时视为不合格
    const passed = childWithoutAge ? req.minAgeYears < 12 : ageOk || youngest == null;
    checks.push({
      code: 'MIN_AGE',
      dimension: 'AGE',
      passed,
      detail:
        youngest != null
          ? `最年轻成员 ${youngest} 岁（要求 ≥${req.minAgeYears}）`
          : childWithoutAge
            ? `团队含儿童且年龄未知（要求 ≥${req.minAgeYears}）`
            : `无明确年龄，按成人缺省`,
    });
    if (!passed) {
      return fail(
        checks,
        softWarnings,
        `年龄不足：要求至少 ${req.minAgeYears} 岁`,
      );
    }
  }

  if (req.minFitnessLevel != null) {
    const passed = party.teamFitnessFloor >= req.minFitnessLevel;
    checks.push({
      code: 'MIN_FITNESS',
      dimension: 'FITNESS',
      passed,
      detail: `团队最低体能 ${party.teamFitnessFloor}/10（要求 ≥${req.minFitnessLevel}）`,
    });
    if (!passed) {
      return fail(
        checks,
        softWarnings,
        `体能不足：要求 ≥${req.minFitnessLevel}，当前地板 ${party.teamFitnessFloor}`,
      );
    }
  }

  for (const q of req.requiredQualifications ?? []) {
    const token = normalizeToken(q);
    const passed = party.teamQualifications.includes(token);
    checks.push({
      code: `QUAL_${token.toUpperCase()}`,
      dimension: 'QUALIFICATION',
      passed,
      detail: passed ? `具备资格 ${token}` : `缺少资格 ${token}`,
    });
    if (!passed) {
      return fail(checks, softWarnings, `缺少资格：${token}`);
    }
  }

  for (const ex of req.hardExclusions ?? []) {
    const token = normalizeToken(ex);
    const hit = party.teamExclusions.includes(token);
    checks.push({
      code: `EXCL_${token.toUpperCase()}`,
      dimension: 'EXCLUSION',
      passed: !hit,
      detail: hit ? `排除项命中 ${token}` : `无排除项 ${token}`,
    });
    if (hit) {
      return fail(checks, softWarnings, `健康排除项：${token}`);
    }
  }

  for (const ex of req.softExclusions ?? []) {
    const token = normalizeToken(ex);
    if (party.teamExclusions.includes(token)) {
      softWarnings.push(`注意：团队存在 ${token}，建议告知运营商`);
      checks.push({
        code: `SOFT_${token.toUpperCase()}`,
        dimension: 'EXCLUSION',
        passed: true,
        detail: `软警告 ${token}`,
      });
    }
  }

  return { eligible: true, checks, softWarnings };
}

function fail(
  checks: EligibilityCheck[],
  softWarnings: string[],
  reason: string,
): EligibilityResult {
  return { eligible: false, reason, checks, softWarnings };
}

function isActivityBanned(party: TripPartyCapabilities, banIds: string[]): boolean {
  const banned = new Set(party.excludedActivityIds);
  return banIds.some((id) => banned.has(normalizeToken(id)));
}

function parseMembersFromPartyProfile(raw: unknown): PartyMemberCapabilities[] {
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw as Record<string, unknown>;
  const list = Array.isArray(obj.members) ? obj.members : [];
  return list
    .map((item, i) => parseOneMember(item, `party_${i}`))
    .filter((m): m is PartyMemberCapabilities => Boolean(m));
}

function parseMembersFromTravelers(raw: unknown): PartyMemberCapabilities[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, i) => parseOneMember(item, `traveler_${i}`))
    .filter((m): m is PartyMemberCapabilities => Boolean(m));
}

function parseMembersFromCapability(meta: Record<string, unknown>): PartyMemberCapabilities[] {
  const cap =
    (meta.fitnessCapability as Record<string, unknown> | undefined) ??
    (meta.humanCapability as Record<string, unknown> | undefined) ??
    (meta.capabilityModel as Record<string, unknown> | undefined);
  if (!cap || typeof cap !== 'object') return [];

  const fitnessLevel = clampFitness(
    num(cap.fitnessLevel ?? cap.overallScore, DEFAULT_FITNESS),
  );
  // overallScore 0–100 → 映射到 1–10
  const fromScore =
    typeof cap.overallScore === 'number'
      ? clampFitness(Math.round(Number(cap.overallScore) / 10) || DEFAULT_FITNESS)
      : fitnessLevel;

  return [
    {
      memberId: 'primary',
      fitnessLevel: typeof cap.fitnessLevel === 'number' ? fitnessLevel : fromScore,
      ageYears: numOpt(cap.ageYears ?? cap.age),
      ageGroup: mapAgeGroup(cap.ageGroup ?? cap.ageBand),
      qualifications: normalizeStringList(cap.qualifications ?? meta.qualifications),
      exclusions: normalizeStringList(
        cap.exclusions ?? cap.medicalExclusions ?? meta.exclusions,
      ),
    },
  ];
}

function parseOneMember(
  raw: unknown,
  fallbackId: string,
): PartyMemberCapabilities | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const m = raw as Record<string, unknown>;
  const typeHint = String(m.type ?? m.travelerType ?? '').toUpperCase();
  let ageGroup = mapAgeGroup(m.ageGroup ?? m.ageBand);
  if (!ageGroup) {
    if (typeHint === 'CHILD') ageGroup = 'CHILD';
    else if (typeHint === 'ELDERLY') ageGroup = 'ELDERLY';
    else if (typeHint === 'ADULT') ageGroup = 'ADULT';
  }

  const mobility = String(m.mobilityTag ?? '').toLowerCase();
  let fitnessLevel = clampFitness(
    num(m.fitnessLevel ?? m.fitness, NaN),
  );
  if (!Number.isFinite(num(m.fitnessLevel ?? m.fitness, NaN))) {
    if (mobility.includes('active')) fitnessLevel = 7;
    else if (mobility.includes('senior')) fitnessLevel = 4;
    else if (ageGroup === 'CHILD') fitnessLevel = 4;
    else if (ageGroup === 'ELDERLY') fitnessLevel = 3;
    else fitnessLevel = DEFAULT_FITNESS;
  }

  return {
    memberId: String(m.memberId ?? m.id ?? fallbackId),
    label: m.label != null ? String(m.label) : undefined,
    ageYears: numOpt(m.ageYears ?? m.age),
    ageGroup,
    fitnessLevel,
    qualifications: normalizeStringList(m.qualifications),
    exclusions: normalizeStringList(m.exclusions ?? m.medicalExclusions),
  };
}

function mapAgeGroup(raw: unknown): AgeGroupHint | undefined {
  const s = String(raw ?? '').toUpperCase();
  if (s.includes('CHILD') || s === 'KID' || s === '0-12' || s === 'CHILD_0_12') {
    return 'CHILD';
  }
  if (s.includes('ELDER') || s.includes('SENIOR') || s === '65+') return 'ELDERLY';
  if (s.includes('ADULT')) return 'ADULT';
  return undefined;
}

function normalizeStringList(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x)).filter(Boolean);
  if (typeof raw === 'string') {
    return raw
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeToken(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function unique(arr: string[]): string[] {
  return [...new Set(arr)];
}

function num(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function numOpt(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function clampFitness(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_FITNESS;
  // 若传入 0–100 量表
  if (n > 10) return clampFitness(Math.round(n / 10));
  return Math.max(1, Math.min(10, Math.round(n)));
}

/** 日程触发：儿童/长者 → materiality.fitness / team 加权建议 */
export function scheduleMaterialityBoost(party: TripPartyCapabilities): {
  fitness: number;
  team: number;
  safety: number;
} {
  let fitness = 0;
  let team = 0;
  let safety = 0;
  if (party.teamFitnessFloor <= 3) fitness += 1;
  if (party.hasChildren || party.hasElderly) {
    team += 1;
    safety += 1;
  }
  return { fitness, team, safety };
}

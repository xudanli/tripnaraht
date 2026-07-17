/**
 * Detection → Eligibility → Materiality 三闸中的 Eligibility 数据面。
 * 体能 / 年龄 / 资格 / 排除项 / 团队适配 — 不合格则不 publish。
 */

export type EligibilityDimension =
  | 'AGE'
  | 'FITNESS'
  | 'QUALIFICATION'
  | 'EXCLUSION'
  | 'TEAM'
  | 'SEASON'
  | 'ACTIVITY_BAN';

export type AgeGroupHint = 'CHILD' | 'ADULT' | 'ELDERLY';

/** 常见资格 token（小写归一） */
export type QualificationToken =
  | 'swimming'
  | 'diving_cert'
  | 'drivers_license'
  | 'winter_driving'
  | 'glacier_guide_ok';

export type ExclusionToken =
  | 'pregnancy'
  | 'heart_condition'
  | 'severe_asthma'
  | 'motion_sickness'
  | 'mobility_aid'
  | 'recent_surgery';

export interface PartyMemberCapabilities {
  memberId: string;
  label?: string;
  ageYears?: number;
  ageGroup?: AgeGroupHint;
  /** 1–10，缺省按 5 */
  fitnessLevel: number;
  qualifications: string[];
  exclusions: string[];
}

export interface TripPartyCapabilities {
  members: PartyMemberCapabilities[];
  /** 全员最低体能 */
  teamFitnessFloor: number;
  /** 全员最低年龄（有明确 ageYears 时） */
  youngestAgeYears?: number;
  hasChildren: boolean;
  hasElderly: boolean;
  /** trip 级排除活动 id：glacier_hike / silfra / … */
  excludedActivityIds: string[];
  /** 全员资格并集 */
  teamQualifications: string[];
  /** 全员排除并集 */
  teamExclusions: string[];
  /** 解析来源，便于 evidenceRefs */
  evidenceRefs: string[];
}

export interface EligibilityCheck {
  code: string;
  dimension: EligibilityDimension;
  passed: boolean;
  detail: string;
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  checks: EligibilityCheck[];
  softWarnings: string[];
  /** 合并卡：仍可选的 optionId（含 skip） */
  eligibleOptionIds?: string[];
  /** 不合格 optionId → 原因 */
  ineligibleOptionReasons?: Record<string, string>;
}

export type ExperienceEligibilitySubject =
  | 'glacier'
  | 'glacier_hike'
  | 'glacier_short'
  | 'glacier_ice_cave'
  | 'glacier_viewpoint'
  | 'whale'
  | 'silfra'
  | 'snowmobile'
  | 'super_jeep';

export interface ActivityEligibilityRequirement {
  subject: ExperienceEligibilitySubject;
  minAgeYears?: number;
  /** 全员最低体能门槛（1–10） */
  minFitnessLevel?: number;
  requiredQualifications?: string[];
  /** 任一成员命中则硬不合格 */
  hardExclusions?: string[];
  /** 命中则 soft warning，不挡 publish */
  softExclusions?: string[];
  activityBanIds?: string[];
}

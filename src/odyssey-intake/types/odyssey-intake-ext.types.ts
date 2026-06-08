import type { OdysseyIntakeProfile } from './odyssey-intake.types';

/** 用户当前出行行程元数据（Hard Gate：时间/目的地匹配） */
export interface OdysseyTripMeta {
  destination: string;
  startDate: string;
  endDate: string;
  updatedAt: string;
}

/** 实名 / 芝麻信用授权状态（PRD 入网流程） */
export type OdysseyTrustProvider = 'zhima_credit' | 'real_name_id';

export interface OdysseyTrustVerification {
  verified: boolean;
  provider?: OdysseyTrustProvider;
  verifiedAt?: string;
  /** 脱敏展示，如「张*三」 */
  displayName?: string;
  creditScoreTier?: 'excellent' | 'good' | 'fair';
  /** 芝麻信用分（脱敏展示，如 800） */
  creditScore?: number;
  /** 如「极佳」 */
  creditScoreLabel?: string;
}

export interface OdysseyOnboardingStatus {
  quizComplete: boolean;
  /** v2：是否已自选 MBTI */
  mbtiSelected: boolean;
  /** v2：是否已完成 Premium Stress Test */
  premiumStressComplete: boolean;
  /** v2：是否至少完成一项硬核背书（学历或职场） */
  credentialsVerified: boolean;
  trustVerified: boolean;
  cardReady: boolean;
  canMatch: boolean;
  intakeVersion?: 1 | 2;
  nextStep?:
    | 'mbti_select'
    | 'credentials'
    | 'premium_stress_test'
    | 'trust_verify'
    | 'view_card'
    | 'match'
    | 'quiz';
}

/** My Profile 头部 Card UI 契约（供前端直接渲染） */
export interface OdysseyProfileCardProfile extends OdysseyIntakeProfile {
  /** 当前选中标签，等同 tripIntentTags[0] */
  tripIntentTag?: string | null;
  /** snake_case 别名，便于前端兼容读取 */
  trip_intent_tag?: string | null;
  trip_intent_tags?: string[];
}

export interface OdysseyProfileCardView {
  completed: boolean;
  profile: OdysseyProfileCardProfile | null;
  tripMeta: OdysseyTripMeta | null;
  trust: OdysseyTrustVerification | null;
  ui: {
    /** PRD：固定渲染于个人主页头部 1/3 区域 */
    placement: 'profile_header_third';
    showShimmerRefresh: boolean;
    refreshMessage?: string;
    gyroscopeEnabled: boolean;
    cta: {
      label: string;
      action: 'trip_intent';
    };
    /** 可选即时意向标签池 */
    tripIntentTagOptions: Array<{ id: string; label: string }>;
  };
}

export interface OdysseyScenarioWallpaper {
  key: string;
  url: string;
  blurHash?: string;
}

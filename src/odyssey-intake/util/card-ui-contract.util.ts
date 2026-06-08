import { ODYSSEY_TRIP_INTENT_TAG_OPTIONS } from '../config/trip-intent-tags.config';
import type {
  OdysseyOnboardingStatus,
  OdysseyProfileCardProfile,
  OdysseyProfileCardView,
  OdysseyTrustVerification,
  OdysseyTripMeta,
} from '../types/odyssey-intake-ext.types';
import type { OdysseyIntakeProfile } from '../types/odyssey-intake.types';
import type { VerifiedCredentialsBundle } from '../types/verified-credentials.types';

export function enrichProfileForCard(profile: OdysseyIntakeProfile | null): OdysseyProfileCardProfile | null {
  if (!profile) return null;
  const tags = profile.tripIntentTags ?? [];
  const current = tags[0] ?? null;
  return {
    ...profile,
    tripIntentTags: tags,
    tripIntentTag: current,
    trip_intent_tag: current,
    trip_intent_tags: tags,
  };
}

function hasCredentials(bundle: VerifiedCredentialsBundle | null | undefined): boolean {
  if (!bundle) return false;
  return Boolean(bundle.education?.verifiedAt || bundle.profession?.verifiedAt);
}

function isLegacyProfileComplete(profile: OdysseyIntakeProfile): boolean {
  return profile.version === 1 && Boolean(profile.completedAt);
}

function isPremiumProfileComplete(profile: OdysseyIntakeProfile): boolean {
  return (
    profile.version === 2 &&
    Boolean(profile.completedAt) &&
    Boolean(profile.premiumStressAnswers) &&
    profile.mbtiSource === 'self_selected'
  );
}

function isMbtiSelected(profile: OdysseyIntakeProfile | null): boolean {
  if (!profile) return false;
  if (profile.version === 1) return isLegacyProfileComplete(profile);
  return Boolean(profile.mbtiType && profile.mbtiSelectedAt);
}

export function buildOnboardingStatus(
  profile: OdysseyIntakeProfile | null,
  trust: OdysseyTrustVerification | null,
  credentials?: VerifiedCredentialsBundle | null,
): OdysseyOnboardingStatus {
  const intakeVersion = profile?.version ?? 2;
  const trustVerified = Boolean(trust?.verified);
  const credentialsVerified = hasCredentials(credentials);
  const mbtiSelected = isMbtiSelected(profile);
  const premiumStressComplete = profile ? isPremiumProfileComplete(profile) : false;
  const legacyComplete = profile ? isLegacyProfileComplete(profile) : false;
  const quizComplete = intakeVersion === 1 ? legacyComplete : premiumStressComplete;
  const cardReady = quizComplete;

  let nextStep: OdysseyOnboardingStatus['nextStep'];

  if (intakeVersion === 1) {
    if (!legacyComplete) {
      nextStep = 'quiz';
    } else if (!premiumStressComplete) {
      // v1 老用户升级 v2 Premium：补 credentials + 行中博弈题
      nextStep = credentialsVerified ? 'premium_stress_test' : 'credentials';
    } else if (!trustVerified) {
      nextStep = 'trust_verify';
    } else {
      nextStep = 'match';
    }
  } else if (!mbtiSelected) {
    nextStep = 'mbti_select';
  } else if (!premiumStressComplete && !credentialsVerified) {
    nextStep = 'credentials';
  } else if (!premiumStressComplete) {
    nextStep = 'premium_stress_test';
  } else if (!trustVerified) {
    nextStep = 'trust_verify';
  } else {
    nextStep = 'match';
  }

  return {
    quizComplete,
    mbtiSelected,
    premiumStressComplete,
    credentialsVerified,
    trustVerified,
    cardReady,
    canMatch: quizComplete && trustVerified,
    intakeVersion,
    nextStep,
  };
}

export function buildProfileCardView(params: {
  profile: OdysseyIntakeProfile | null;
  tripMeta: OdysseyTripMeta | null;
  trust: OdysseyTrustVerification | null;
}): OdysseyProfileCardView {
  const { profile, tripMeta, trust } = params;

  return {
    completed: Boolean(profile?.completedAt),
    profile: enrichProfileForCard(profile),
    tripMeta,
    trust,
    ui: {
      placement: 'profile_header_third',
      showShimmerRefresh: Boolean(profile?.profileRefreshPending),
      refreshMessage: profile?.profileRefreshMessage,
      gyroscopeEnabled: true,
      cta: {
        label: '调整本次出行状态',
        action: 'trip_intent',
      },
      tripIntentTagOptions: [...ODYSSEY_TRIP_INTENT_TAG_OPTIONS],
    },
  };
}

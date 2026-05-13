import type { UserCognitiveProfile } from '../../memory/experience-replay/user-cognitive-profile.types';
import { COMPLIANCE_EXPERIENCE_AXIS_EXPERIENCE_LEAN_THRESHOLD } from '../../memory/experience-replay/memory-replay.constants';

/**
 * 4.0：是否允许向 Skill 注入「体验向」Gossip（与 EBP 软化阈值及 negative_feedback_proxy 熔断对齐）。
 */
export function shouldApplyExperienceGossip(profile: UserCognitiveProfile | undefined): boolean {
  if (!profile) return false;
  if (profile.negative_feedback_proxy >= 0.5) return false;
  return profile.compliance_experience_axis <= COMPLIANCE_EXPERIENCE_AXIS_EXPERIENCE_LEAN_THRESHOLD;
}

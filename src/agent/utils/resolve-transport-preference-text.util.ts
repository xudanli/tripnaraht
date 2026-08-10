/**
 * 从 UserProfile.preferences / AgentContext.userPreferences 解析交通偏好长文。
 * 兼容顶层、preferences 嵌套，以及 tripnara_structured_preferences。
 */

import { TRIPNARA_STRUCTURED_PREFERENCES } from '../services/user-standing-preference.service';

export function resolveTransportPreferenceText(
  root: Record<string, unknown> | null | undefined,
): string {
  if (!root) return '';
  const flat = typeof root.transport_preferences === 'string' ? root.transport_preferences.trim() : '';
  const nestedPrefs =
    root.preferences && typeof root.preferences === 'object'
      ? (root.preferences as Record<string, unknown>)
      : undefined;
  const nestedFlat =
    nestedPrefs && typeof nestedPrefs.transport_preferences === 'string'
      ? String(nestedPrefs.transport_preferences).trim()
      : '';
  const structuredRoot =
    (root[TRIPNARA_STRUCTURED_PREFERENCES] as Record<string, unknown> | undefined) ??
    (nestedPrefs?.[TRIPNARA_STRUCTURED_PREFERENCES] as Record<string, unknown> | undefined);
  const structured =
    structuredRoot && typeof structuredRoot.transport_preferences === 'string'
      ? String(structuredRoot.transport_preferences).trim()
      : '';
  return nestedFlat || flat || structured;
}

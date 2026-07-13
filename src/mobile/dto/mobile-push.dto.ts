/** Mobile APNs — token 注册与推送 payload 契约 */

export const MOBILE_PUSH_PLATFORMS = ['ios', 'android'] as const;
export type MobilePushPlatform = (typeof MOBILE_PUSH_PLATFORMS)[number];

export const MOBILE_PUSH_EVENT_TYPES = [
  'sos',
  'risk_alert',
  'team_notification',
  'decision',
  'trip_context_changed',
] as const;

export type MobilePushEventType = (typeof MOBILE_PUSH_EVENT_TYPES)[number];

export interface RegisterPushTokenRequestDto {
  token: string;
  platform: MobilePushPlatform;
  deviceId: string;
  appVersion?: string;
}

export interface PushTokenRecordDto {
  deviceId: string;
  token: string;
  platform: MobilePushPlatform;
  appVersion?: string;
  updatedAt: string;
}

export interface RegisterPushTokenResponseDto {
  registered: boolean;
  deviceId: string;
  platform: MobilePushPlatform;
  updatedAt: string;
}

/** APNs 自定义字段 + `aps` alert；iOS 用 tripId/contextVersion 跳转 */
export interface MobilePushPayloadDto {
  tripId: string;
  contextVersion: number;
  eventType: MobilePushEventType;
  changedSections?: string[];
  planVersion?: number;
  sosId?: string;
  decisionId?: string;
}

export const MOBILE_PUSH_TOKENS_PREFERENCES_KEY = 'mobilePushTokens';

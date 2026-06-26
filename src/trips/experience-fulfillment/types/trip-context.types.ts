/**
 * Trip Context Schema — 决策验证上下文（PRD §7 + §21）
 */

export type VehicleAccessClass = '2WD' | '4WD' | 'AWD' | 'UNKNOWN';

export interface TripPartyMember {
  id: string;
  role?: string;
  /** 连续步行耐受（分钟） */
  maxContinuousWalkMinutes?: number;
  mobilityLimited?: boolean;
  minimumAge?: number;
}

export interface TripContextSchema {
  revision: 'v1';
  destinationRegion: string;
  /** ISO 8601 date or month hint */
  tripStart?: string;
  tripEnd?: string;
  tripDays?: number;
  origin?: string;
  partySize?: number;
  members?: readonly TripPartyMember[];
  vehicle?: {
    accessClass: VehicleAccessClass;
    category?: string;
  };
  budget?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  /** 每日最大驾驶分钟 */
  maxDailyDriveMinutes?: number;
  /** 换酒店频率偏好 */
  hotelChangePreference?: 'MINIMAL' | 'BALANCED' | 'FLEXIBLE';
  timezone?: string;
}

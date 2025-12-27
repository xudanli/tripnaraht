// src/agent/memory/interfaces/user-travel-profile.interface.ts

/**
 * L1: 用户旅行人格（UserTravelProfile）
 * 
 * 记住用户是谁，跨年生命周期，作为决策基线
 */

export type PacePreference = 'SLOW' | 'MODERATE' | 'FAST';
export type AltitudeTolerance = 'LOW' | 'MEDIUM' | 'HIGH';
export type RiskTolerance = 'LOW' | 'MEDIUM' | 'HIGH';
export type TravelPhilosophy = 'SCENIC' | 'ADVENTURE' | 'RELAXED';
export type RouteType = 'HIKING' | 'ROAD_TRIP' | 'SEA' | 'URBAN' | 'CULTURAL' | 'NATURE';

export interface UserTravelProfile {
  userId: string;

  pacePreference?: PacePreference;
  altitudeTolerance?: AltitudeTolerance;
  riskTolerance?: RiskTolerance;
  travelPhilosophy?: TravelPhilosophy;
  preferredRouteTypes?: RouteType[];

  confidence: number; // 0~1，学习置信度
  source: 'explicit' | 'inferred' | 'mixed'; // 来源

  updatedAt: Date;
}

/**
 * 默认用户画像（用于新用户）
 */
export function createDefaultUserTravelProfile(userId: string): UserTravelProfile {
  return {
    userId,
    pacePreference: 'MODERATE',
    altitudeTolerance: 'MEDIUM',
    riskTolerance: 'MEDIUM',
    travelPhilosophy: 'SCENIC',
    preferredRouteTypes: [],
    confidence: 0.3, // 新用户置信度较低
    source: 'inferred',
    updatedAt: new Date(),
  };
}



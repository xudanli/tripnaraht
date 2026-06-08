/**
 * B 端履约能力画像 — 冰岛 MVP 小规模高精度样本
 *
 * 导游风格、车辆类型、路线成功率、应急处理能力等可验证履约记录。
 */

export type FulfillmentCapabilityType =
  | 'guide_style'
  | 'vehicle_type'
  | 'route_success'
  | 'emergency_handling';

export interface FulfillmentCapabilityMetrics {
  successRate?: number;
  avgSatisfaction?: number;
  sampleCount: number;
  notes?: string;
}

export interface FulfillmentCapabilityRecordInput {
  supplierId: string;
  supplierName?: string;
  countryCode: string;
  capabilityType: FulfillmentCapabilityType;
  capabilityKey: string;
  metrics: FulfillmentCapabilityMetrics;
  evidenceTripIds?: string[];
  metadata?: Record<string, unknown>;
}

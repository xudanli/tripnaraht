/**
 * 现实资源抽象：容量型实体（座位、时段、区域负载等），供治理层仲裁与记账。
 */
export type RealityResourceType =
  | 'POI_CAPACITY'
  | 'RESTAURANT_SEAT'
  | 'TRANSPORT_SLOT'
  | 'CITY_REGION_LOAD';

export interface RealityResource {
  id: string;
  type: RealityResourceType;
  /** 归一化容量或绝对席位数（产品约定一致即可） */
  capacity: number;
  /** 当前占用量（与 capacity 同单位） */
  currentLoad: number;
  /** 策略标签：fair-share / auction / fifo / vip-first 等，供引擎解析 */
  allocationPolicy: string;
}

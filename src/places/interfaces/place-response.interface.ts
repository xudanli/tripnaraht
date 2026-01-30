// src/places/interfaces/place-response.interface.ts
/**
 * 统一的地点响应接口定义
 * 所有地点接口都应该返回这个格式的数据
 */

import { PlaceCategory } from '@prisma/client';

/**
 * 基础地点响应接口（所有地点接口的基础格式）
 */
export interface BasePlaceResponse {
  id: number;
  uuid: string;
  nameCN: string;
  nameEN?: string | null;
  category: PlaceCategory; // 统一使用 PlaceCategory 枚举
  address?: string | null;
  rating?: number | null;
  googlePlaceId?: string | null;
  description?: string | null;
  location?: {
    lat: number;
    lng: number;
  } | null;
  metadata?: any;
  physicalMetadata?: any;
  city?: {
    id: number;
    name: string;
    nameCN?: string | null;
    nameEN?: string | null;
    countryCode: string;
    timezone?: string | null;
  } | null;
  countryCode?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * 带距离的地点响应（用于附近地点查询）
 */
export interface PlaceWithDistanceResponse extends BasePlaceResponse {
  distance: number; // 单位：米
  isOpen?: boolean;
  tags?: string[];
  status?: {
    isOpen: boolean;
    text: string;
    hoursToday: string;
  };
}

/**
 * 地点列表响应
 */
export interface PlaceListResponse {
  places: BasePlaceResponse[];
  total: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  hasPrev?: boolean;
  hasNext?: boolean;
}

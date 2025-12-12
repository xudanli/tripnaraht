// src/places/dto/geo-result.dto.ts
// 1. 定义数据库 Raw SQL 返回的原始结构
export interface RawPlaceResult {
  id: number;
  nameCN: string;
  nameEN: string | null;
  metadata: any; // JSONB
  distance_meters: number; // 我们计算出的距离
  category: string;
  address?: string;
  rating?: number;
}

// 2. 定义我们在 Service 中想用的最终结构 (更友好的格式)
export interface PlaceWithDistance {
  id: number;
  name: string; // 显示名称（优先 nameEN，否则 nameCN）
  nameCN: string;
  nameEN: string | null;
  category: string;
  distance: number; // 单位：米
  isOpen: boolean;  // 从 metadata 解析出的快捷字段
  tags: string[];   // 从 metadata 解析出的快捷字段
  address?: string;
  rating?: number;
  status?: {
    isOpen: boolean;
    text: string;
    hoursToday: string;
  };
}


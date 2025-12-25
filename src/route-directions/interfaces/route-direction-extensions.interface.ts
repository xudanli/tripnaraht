// src/route-directions/interfaces/route-direction-extensions.interface.ts
/**
 * RouteDirection 扩展接口
 * 
 * 预留 transport/booking/compliance 外挂接口
 */

/**
 * 交通模式要求
 */
export interface TransportModeRequirement {
  mode: 'ferry' | 'flight' | 'rail' | 'bus' | 'drive';
  required: boolean; // 是否必须
  optional: boolean; // 是否可选
  hints?: {
    operator?: string; // 运营商
    bookingLink?: string; // 预订链接类型（不是固定 URL）
    frequency?: string; // 班次频率
    duration?: string; // 预计时长
  };
}

/**
 * 预订提示
 */
export interface BookingHint {
  type: 'official' | 'reliable' | 'alternative';
  category: 'permit' | 'guide' | 'transport' | 'accommodation' | 'activity';
  linkType: string; // 链接类型标识（如 'timsp_online', 'sagarmatha_park'）
  description?: string; // 描述
  priority?: number; // 优先级
}

/**
 * 合规能力
 */
export interface ComplianceCapabilities {
  canBookRailPass?: boolean; // 是否支持 RailPass 预订
  needsPermit?: boolean; // 是否需要许可
  needsGuide?: boolean; // 是否需要向导
  restrictedAreas?: string[]; // 限制区域列表
  permitProviders?: BookingHint[]; // 许可提供商
  guideProviders?: BookingHint[]; // 向导提供商
}

/**
 * RouteDirection 扩展字段（在 metadata 中存储）
 */
export interface RouteDirectionExtensions {
  transport?: {
    requiredModes?: TransportModeRequirement[]; // 必需的交通模式
    optionalModes?: TransportModeRequirement[]; // 可选的交通模式
    entryPoints?: Array<{
      type: 'airport' | 'station' | 'port' | 'city';
      name: string;
      code?: string; // IATA/ICAO 代码
      coordinates?: { lat: number; lng: number };
    }>;
  };
  booking?: {
    hints?: BookingHint[]; // 预订提示
    recommendedProviders?: BookingHint[]; // 推荐提供商
  };
  compliance?: ComplianceCapabilities; // 合规能力
}


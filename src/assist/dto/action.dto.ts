// src/assist/dto/action.dto.ts

/**
 * 助手动作类型定义
 * 
 * 统一处理语音和拍照两种输入方式的动作
 */
export type AssistantAction =
  | { type: 'QUERY_NEXT_STOP' }
  | { 
      type: 'MOVE_POI_TO_MORNING'; 
      poiId?: string; 
      poiName?: string;
      preferredRange?: 'AM' | 'PM';
      rebuildTimeline?: boolean;  // 是否重建时间轴（默认 false，仅调整顺序）
    }
  | { 
      type: 'ADD_POI_TO_SCHEDULE'; 
      poiId: string;
      preferredRange?: 'AM' | 'PM';
      insertAfterStopId?: string;
    };

/**
 * 助手建议（候选操作卡片）
 * 
 * 前端收到后渲染为可点击的卡片，用户可以选择"应用"或"取消"
 */
export interface AssistantSuggestion {
  /** 建议 ID（用于稳定 seed/hash & 回放） */
  id: string;
  
  /** 标题（展示在卡片上） */
  title: string;
  
  /** 描述（可选，详细说明） */
  description?: string;
  
  /** 置信度（影响 UI 展示） */
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  
  /** 可执行的动作（如有） */
  action?: AssistantAction;
  
  /** 需要澄清的问题（信息不足时） */
  clarification?: {
    question: string;
    options?: Array<{
      label: string;
      value: string;
    }>;
  };
  
  /** 关联的 POI 信息（ADD_POI_TO_SCHEDULE 时使用） */
  poiInfo?: {
    id: string;
    name: string;
    lat: number;
    lng: number;
    distanceM?: number;
    rating?: number;
    isOpenNow?: boolean;
  };
}

/**
 * POI 候选（拍照识别场景）
 */
export interface PoiCandidate {
  /** POI ID（系统内部 ID） */
  id: string;
  
  /** POI 名称 */
  name: string;
  
  /** 中文名称（如有） */
  nameCN?: string;
  
  /** 英文名称（如有） */
  nameEN?: string;
  
  /** 纬度 */
  lat: number;
  
  /** 经度 */
  lng: number;
  
  /** 距离用户位置（米） */
  distanceM?: number;
  
  /** 评分（0-5） */
  rating?: number;
  
  /** 当前是否营业 */
  isOpenNow?: boolean;
  
  /** 地址 */
  address?: string;
  
  /** 类型/标签 */
  tags?: string[];
  
  /** 匹配度分数（OCR 文本匹配） */
  matchScore?: number;
}

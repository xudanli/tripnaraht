// src/trips/decision/interfaces/dr-dre-operation.interface.ts
/**
 * Dr.Dre Operation Interface
 * 
 * Dr.Dre 的调整操作类型
 */

/**
 * 拆天操作
 */
export interface SplitOperation {
  type: 'SPLIT_DAY';
  /** 要拆分的天数 */
  dayIndex: number;
  /** 在当天的第几个 segment 后拆 */
  splitAfterSegmentIndex: number;
}

/**
 * 插入缓冲日操作
 */
export interface BufferDayOperation {
  type: 'INSERT_BUFFER_DAY';
  /** 在第几天之后插入 */
  insertAfterDayIndex: number;
  /** 缓冲日模板 */
  template?: 'REST' | 'LIGHT_WALK' | 'LOCAL_EXPLORE';
}

/**
 * Dr.Dre 操作类型
 */
export type DrDreOperation = SplitOperation | BufferDayOperation;


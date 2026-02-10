/**
 * 降级策略辅助工具
 * 
 * Code Review P1修复：提取重复的降级逻辑为通用函数
 */

import { Logger } from '@nestjs/common';

/**
 * 降级策略选项
 */
export interface FallbackOptions<T> {
  /** 主要方法（优先尝试） */
  primary: () => Promise<T>;
  
  /** 降级方法（如果主要方法失败） */
  fallback?: () => Promise<T>;
  
  /** 最终默认值（如果所有方法都失败） */
  defaultValue: T;
  
  /** Logger实例 */
  logger: Logger;
  
  /** 操作名称（用于日志） */
  operationName: string;
  
  /** 是否在失败时记录警告（默认true） */
  logWarning?: boolean;
}

/**
 * 执行带降级策略的操作
 * 
 * @example
 * ```typescript
 * const result = await executeWithFallback({
 *   primary: async () => await this.skill.execute(params),
 *   fallback: async () => await this.service.getData(params),
 *   defaultValue: [],
 *   logger: this.logger,
 *   operationName: '获取天气预警',
 * });
 * ```
 */
export async function executeWithFallback<T>(
  options: FallbackOptions<T>,
): Promise<T> {
  const {
    primary,
    fallback,
    defaultValue,
    logger,
    operationName,
    logWarning = true,
  } = options;

  // 策略1: 尝试主要方法
  try {
    const result = await primary();
    logger.debug(`[Fallback] ${operationName} - 主要方法成功`);
    return result;
  } catch (error: any) {
    if (logWarning) {
      logger.warn(
        `[Fallback] ${operationName} - 主要方法失败: ${error.message}`,
      );
    }

    // 策略2: 尝试降级方法
    if (fallback) {
      try {
        const result = await fallback();
        logger.debug(`[Fallback] ${operationName} - 降级方法成功`);
        return result;
      } catch (fallbackError: any) {
        if (logWarning) {
          logger.warn(
            `[Fallback] ${operationName} - 降级方法失败: ${fallbackError.message}`,
          );
        }
      }
    }

    // 策略3: 返回默认值
    logger.debug(`[Fallback] ${operationName} - 使用默认值`);
    return defaultValue;
  }
}

/**
 * 执行带多个降级策略的操作
 * 
 * @example
 * ```typescript
 * const result = await executeWithMultipleFallbacks({
 *   strategies: [
 *     async () => await this.skill1.execute(params),
 *     async () => await this.skill2.execute(params),
 *     async () => await this.service.getData(params),
 *   ],
 *   defaultValue: [],
 *   logger: this.logger,
 *   operationName: '获取数据',
 * });
 * ```
 */
export async function executeWithMultipleFallbacks<T>(
  options: {
    strategies: Array<() => Promise<T>>;
    defaultValue: T;
    logger: Logger;
    operationName: string;
    logWarning?: boolean;
  },
): Promise<T> {
  const { strategies, defaultValue, logger, operationName, logWarning = true } =
    options;

  for (let i = 0; i < strategies.length; i++) {
    try {
      const result = await strategies[i]();
      logger.debug(
        `[Fallback] ${operationName} - 策略 ${i + 1}/${strategies.length} 成功`,
      );
      return result;
    } catch (error: any) {
      if (logWarning) {
        logger.warn(
          `[Fallback] ${operationName} - 策略 ${i + 1}/${strategies.length} 失败: ${error.message}`,
        );
      }
      // 继续尝试下一个策略
    }
  }

  // 所有策略都失败，返回默认值
  logger.debug(`[Fallback] ${operationName} - 所有策略失败，使用默认值`);
  return defaultValue;
}

/**
 * 执行带条件降级的操作
 * 
 * @example
 * ```typescript
 * const result = await executeWithConditionalFallback({
 *   condition: this.skill !== undefined,
 *   primary: async () => await this.skill.execute(params),
 *   fallback: async () => await this.service.getData(params),
 *   defaultValue: [],
 *   logger: this.logger,
 *   operationName: '获取数据',
 * });
 * ```
 */
export async function executeWithConditionalFallback<T>(
  options: {
    condition: boolean;
    primary: () => Promise<T>;
    fallback?: () => Promise<T>;
    defaultValue: T;
    logger: Logger;
    operationName: string;
    logWarning?: boolean;
  },
): Promise<T> {
  const {
    condition,
    primary,
    fallback,
    defaultValue,
    logger,
    operationName,
    logWarning = true,
  } = options;

  if (condition) {
    return executeWithFallback({
      primary,
      fallback,
      defaultValue,
      logger,
      operationName,
      logWarning,
    });
  } else {
    // 条件不满足，直接尝试降级或返回默认值
    if (fallback) {
      try {
        const result = await fallback();
        logger.debug(`[Fallback] ${operationName} - 降级方法成功`);
        return result;
      } catch (error: any) {
        if (logWarning) {
          logger.warn(
            `[Fallback] ${operationName} - 降级方法失败: ${error.message}`,
          );
        }
      }
    }
    logger.debug(`[Fallback] ${operationName} - 使用默认值`);
    return defaultValue;
  }
}

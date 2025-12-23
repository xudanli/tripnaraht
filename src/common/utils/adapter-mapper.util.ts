// src/common/utils/adapter-mapper.util.ts

/**
 * 适配器映射工具
 * 
 * 统一处理各种数据源的字段映射，减少重复代码
 */
export class AdapterMapper {
  /**
   * 映射严重程度
   */
  static mapSeverity(
    severity: string | undefined,
    customMap?: Record<string, 'info' | 'warning' | 'critical'>
  ): 'info' | 'warning' | 'critical' {
    const defaultMap: Record<string, 'info' | 'warning' | 'critical'> = {
      'yellow': 'warning',
      'orange': 'warning',
      'red': 'critical',
      'info': 'info',
      'warning': 'warning',
      'critical': 'critical',
      'danger': 'critical',
    };

    const map = customMap ? { ...defaultMap, ...customMap } : defaultMap;
    return map[severity?.toLowerCase() || ''] || 'info';
  }

  /**
   * 映射天气状况
   */
  static mapWeatherCondition(
    condition: string | undefined,
    customMap?: Record<string, string>
  ): string {
    const defaultMap: Record<string, string> = {
      'Clear': 'sunny',
      'Sunny': 'sunny',
      'Clouds': 'cloudy',
      'Cloudy': 'cloudy',
      'Overcast': 'cloudy',
      'Rain': 'rainy',
      'Rainy': 'rainy',
      'Drizzle': 'rainy',
      'Thunderstorm': 'stormy',
      'Storm': 'stormy',
      'Snow': 'snowy',
      'Snowy': 'snowy',
      'Mist': 'foggy',
      'Fog': 'foggy',
      'Haze': 'hazy',
      'Windy': 'windy',
    };

    const map = customMap ? { ...defaultMap, ...customMap } : defaultMap;
    return map[condition || ''] || condition?.toLowerCase() || 'unknown';
  }

  /**
   * 安全地提取错误消息
   */
  static extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return String(error);
  }

  /**
   * 创建默认错误响应
   */
  static createDefaultErrorResponse<T extends { lastUpdated: Date; source: string; metadata?: any }>(
    source: string,
    error: unknown,
    defaultData: Partial<T>
  ): T {
    return {
      ...defaultData,
      lastUpdated: new Date(),
      source,
      metadata: {
        ...defaultData.metadata,
        error: this.extractErrorMessage(error),
      },
    } as T;
  }
}


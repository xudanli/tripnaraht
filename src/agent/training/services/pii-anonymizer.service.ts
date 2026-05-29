// src/agent/training/services/pii-anonymizer.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { RLTrajectory, RLTrajectoryStep, RLState } from '../interfaces/trajectory.interface';

/**
 * PII脱敏配置
 */
export interface PIIAnonymizationConfig {
  anonymize_user_ids?: boolean;
  anonymize_emails?: boolean;
  anonymize_phones?: boolean;
  anonymize_coordinates?: boolean; // 精确坐标 → 城市级别
  anonymize_timestamps?: boolean; // 精确时间 → 日期级别
  hash_salt?: string; // 哈希盐值（用于可复现的哈希）
}

/**
 * 脱敏后的轨迹
 */
export interface AnonymizedTrajectory extends RLTrajectory {
  anonymization_metadata: {
    anonymized_at: string;
    config: PIIAnonymizationConfig;
    anonymized_fields: string[];
  };
}

/**
 * PIIAnonymizerService
 * 
 * 职责：实现PII/合规脱敏策略
 * 
 * 脱敏规则：
 * - userId → hash(userId) → "user_xxx"
 * - email → hash(email) → "email_xxx"
 * - phone → 移除或hash
 * - 精确坐标 → (country_code, city_name)
 * - 精确时间 → date（保留日期，移除时间）
 */
@Injectable()
export class PIIAnonymizerService {
  private readonly logger = new Logger(PIIAnonymizerService.name);
  private readonly defaultConfig: PIIAnonymizationConfig = {
    anonymize_user_ids: true,
    anonymize_emails: true,
    anonymize_phones: true,
    anonymize_coordinates: true,
    anonymize_timestamps: true,
    hash_salt: 'tripnara-pii-salt-2025', // 生产环境应从环境变量读取
  };

  /**
   * 脱敏轨迹数据
   */
  async anonymizeTrajectory(
    trajectory: RLTrajectory,
    config: PIIAnonymizationConfig = {},
  ): Promise<AnonymizedTrajectory> {
    this.logger.debug(
      `[PIIAnonymizer] 脱敏轨迹: trajectoryId=${trajectory.trajectory_id}`,
    );

    const finalConfig = { ...this.defaultConfig, ...config };
    const anonymizedFields: string[] = [];

    // 脱敏轨迹元数据
    const anonymizedMetadata = { ...trajectory.metadata };
    if (finalConfig.anonymize_timestamps) {
      anonymizedMetadata.created_at = this.anonymizeTimestamp(
        anonymizedMetadata.created_at,
      );
      anonymizedMetadata.updated_at = this.anonymizeTimestamp(
        anonymizedMetadata.updated_at,
      );
      anonymizedFields.push('metadata.created_at', 'metadata.updated_at');
    }

    // 脱敏轨迹步骤
    const anonymizedSteps: RLTrajectoryStep[] = trajectory.steps.map(
      (step, index) => {
        const anonymizedStep = { ...step };

        // 脱敏状态
        anonymizedStep.state = this.anonymizeState(step.state, finalConfig, anonymizedFields);

        // 脱敏动作（通常不包含PII，但检查一下）
        anonymizedStep.action = this.anonymizeAction(step.action, finalConfig, anonymizedFields);

        // 脱敏奖励（通常不包含PII）
        anonymizedStep.reward = step.reward;

        // 脱敏下一状态
        if (step.next_state) {
          anonymizedStep.next_state = this.anonymizeState(
            step.next_state,
            finalConfig,
            anonymizedFields,
          );
        }

        // 脱敏时间戳
        if (finalConfig.anonymize_timestamps) {
          anonymizedStep.timestamp = this.anonymizeTimestamp(step.timestamp);
          anonymizedFields.push(`steps[${index}].timestamp`);
        }

        return anonymizedStep;
      },
    );

    // 构建脱敏后的轨迹
    const anonymizedTrajectory: AnonymizedTrajectory = {
      ...trajectory,
      metadata: anonymizedMetadata,
      steps: anonymizedSteps,
      anonymization_metadata: {
        anonymized_at: new Date().toISOString(),
        config: finalConfig,
        anonymized_fields: [...new Set(anonymizedFields)], // 去重
      },
    };

    this.logger.log(
      `[PIIAnonymizer] 轨迹脱敏完成: trajectoryId=${trajectory.trajectory_id}, anonymizedFields=${anonymizedFields.length}`,
    );

    return anonymizedTrajectory;
  }

  /**
   * 脱敏单个字段
   */
  anonymizeField(
    fieldName: string,
    fieldValue: any,
    config: PIIAnonymizationConfig = {},
  ): any {
    const finalConfig = { ...this.defaultConfig, ...config };

    // 根据字段名判断类型
    const fieldLower = fieldName.toLowerCase();

    if (fieldLower.includes('user') && fieldLower.includes('id') && finalConfig.anonymize_user_ids) {
      return this.hashValue(fieldValue, 'user', finalConfig.hash_salt);
    }

    if (fieldLower.includes('email') && finalConfig.anonymize_emails) {
      return this.hashValue(fieldValue, 'email', finalConfig.hash_salt);
    }

    if (
      (fieldLower.includes('phone') || fieldLower.includes('tel')) &&
      finalConfig.anonymize_phones
    ) {
      return this.hashValue(fieldValue, 'phone', finalConfig.hash_salt);
    }

    if (
      (fieldLower.includes('lat') || fieldLower.includes('lng') || fieldLower.includes('coord')) &&
      finalConfig.anonymize_coordinates
    ) {
      // 坐标脱敏：保留到城市级别（在state中处理）
      return fieldValue; // 这里返回原值，在anonymizeState中处理
    }

    if (fieldLower.includes('timestamp') || fieldLower.includes('time') || fieldLower.includes('date')) {
      if (finalConfig.anonymize_timestamps) {
        return this.anonymizeTimestamp(fieldValue);
      }
    }

    return fieldValue;
  }

  /**
   * 脱敏状态
   */
  private anonymizeState(
    state: RLState,
    config: PIIAnonymizationConfig,
    anonymizedFields: string[],
  ): RLState {
    const anonymized: RLState = { ...state };

    // 脱敏request_id（如果包含用户信息）
    if (config.anonymize_user_ids && state.request_id) {
      anonymized.request_id = this.hashValue(state.request_id, 'req', config.hash_salt);
      anonymizedFields.push('state.request_id');
    }

    // 脱敏trip_id（如果包含用户信息）
    if (config.anonymize_user_ids && state.trip_id) {
      anonymized.trip_id = this.hashValue(state.trip_id, 'trip', config.hash_salt);
      anonymizedFields.push('state.trip_id');
    }

    // 脱敏用户请求（移除可能的PII）
    if (state.user_request) {
      anonymized.user_request = this.anonymizeUserRequest(state.user_request, config);
      anonymizedFields.push('state.user_request');
    }

    // 脱敏精确坐标
    if (config.anonymize_coordinates) {
      if (state.origin && typeof state.origin === 'object' && 'lat' in state.origin) {
        const anonymizedCoords = this.anonymizeCoordinates(state.origin);
        // Convert anonymized coordinates to string format to match RLState type
        let anonymizedOrigin: string = '[location_redacted]';
        if (anonymizedCoords.city_name && anonymizedCoords.country_code) {
          anonymizedOrigin = `${anonymizedCoords.city_name}, ${anonymizedCoords.country_code}`;
        } else if (anonymizedCoords.city_name) {
          anonymizedOrigin = anonymizedCoords.city_name;
        } else if (anonymizedCoords.country_code) {
          anonymizedOrigin = anonymizedCoords.country_code;
        }
        anonymized.origin = anonymizedOrigin;
        anonymizedFields.push('state.origin');
      }
      if (
        state.destination &&
        typeof state.destination === 'object' &&
        'lat' in state.destination
      ) {
        const anonymizedCoords = this.anonymizeCoordinates(state.destination);
        // Convert anonymized coordinates to string format to match RLState type
        let anonymizedDestination: string = '[location_redacted]';
        if (anonymizedCoords.city_name && anonymizedCoords.country_code) {
          anonymizedDestination = `${anonymizedCoords.city_name}, ${anonymizedCoords.country_code}`;
        } else if (anonymizedCoords.city_name) {
          anonymizedDestination = anonymizedCoords.city_name;
        } else if (anonymizedCoords.country_code) {
          anonymizedDestination = anonymizedCoords.country_code;
        }
        anonymized.destination = anonymizedDestination;
        anonymizedFields.push('state.destination');
      }

      // 脱敏itinerary中的坐标
      if (state.current_itinerary) {
        anonymized.current_itinerary = this.anonymizeItinerary(
          state.current_itinerary,
          config,
        );
        anonymizedFields.push('state.current_itinerary');
      }
    }

    // 脱敏时间戳
    if (config.anonymize_timestamps && state.metadata?.timestamp) {
      anonymized.metadata = {
        ...state.metadata,
        timestamp: this.anonymizeTimestamp(state.metadata.timestamp),
      };
      anonymizedFields.push('state.metadata.timestamp');
    }

    return anonymized;
  }

  /**
   * 脱敏动作（通常不包含PII，但检查一下）
   */
  private anonymizeAction(
    action: any,
    config: PIIAnonymizationConfig,
    anonymizedFields: string[],
  ): any {
    // 动作通常不包含PII，但检查action_params中是否有敏感信息
    if (action.action_params) {
      const anonymizedParams: Record<string, any> = { ...action.action_params };

      // 检查是否有坐标
      if (config.anonymize_coordinates) {
        for (const [key, value] of Object.entries(anonymizedParams)) {
          if (
            value &&
            typeof value === 'object' &&
            ('lat' in value || 'lng' in value || 'coordinates' in value)
          ) {
            anonymizedParams[key] = this.anonymizeCoordinates(value);
            anonymizedFields.push(`action.action_params.${key}`);
          }
        }
      }

      return {
        ...action,
        action_params: anonymizedParams,
      };
    }

    return action;
  }

  /**
   * 对任意 JSON 可序列化值做浅层 PII 脱敏（DecisionTrajectory 载荷用）。
   */
  anonymizeJsonValue<T>(value: T, config: PIIAnonymizationConfig = {}): T {
    const finalConfig = { ...this.defaultConfig, ...config };
    return this.anonymizeJsonValueRecursive(value, finalConfig) as T;
  }

  private anonymizeJsonValueRecursive(value: unknown, config: PIIAnonymizationConfig): unknown {
    if (value == null) return value;
    if (typeof value === 'string') {
      return this.anonymizeUserRequest(value, config);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.anonymizeJsonValueRecursive(item, config));
    }
    if (typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
        const lk = key.toLowerCase();
        if (config.anonymize_user_ids && (lk === 'userid' || lk === 'user_id')) {
          out[key] = this.hashValue(String(v), 'user', config.hash_salt);
          continue;
        }
        if (config.anonymize_emails && lk.includes('email') && typeof v === 'string') {
          out[key] = '[email_redacted]';
          continue;
        }
        out[key] = this.anonymizeJsonValueRecursive(v, config);
      }
      return out;
    }
    return value;
  }

  /**
   * 脱敏用户请求文本
   */
  private anonymizeUserRequest(
    request: string,
    config: PIIAnonymizationConfig,
  ): string {
    let anonymized = request;

    // 移除可能的邮箱
    if (config.anonymize_emails) {
      anonymized = anonymized.replace(
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        '[email_redacted]',
      );
    }

    // 移除可能的电话号码
    if (config.anonymize_phones) {
      anonymized = anonymized.replace(
        /\b(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
        '[phone_redacted]',
      );
    }

    // 酒店/航班确认号、订单号（PR-B 辩论文本）
    anonymized = anonymized.replace(
      /\b(?:订单|预订|confirmation|booking\s*ref|pnr|record\s*locator)[#:\s-]*[A-Z0-9]{5,12}\b/gi,
      '[booking_ref_redacted]',
    );

    return anonymized;
  }

  /**
   * 脱敏坐标（精确坐标 → 城市级别）
   */
  private anonymizeCoordinates(_coords: {
    lat: number;
    lng: number;
  }): { country_code?: string; city_name?: string } {
    // 简化实现：将精确坐标转换为城市级别
    // 实际实现应该使用地理编码服务（如Google Geocoding API）将坐标转换为城市
    // 这里先返回一个占位符，实际使用时需要集成地理编码服务

    // TODO: 集成地理编码服务
    // const cityInfo = await geocodingService.reverseGeocode(coords.lat, coords.lng);
    // return { country_code: cityInfo.country_code, city_name: cityInfo.city_name };

    // 临时实现：返回模糊化的坐标（保留到小数点后1位，约11km精度）
    return {
      country_code: 'UNKNOWN', // 需要地理编码服务
      city_name: 'UNKNOWN', // 需要地理编码服务
    };
  }

  /**
   * 脱敏行程（脱敏其中的坐标）
   */
  private anonymizeItinerary(itinerary: any, _config: PIIAnonymizationConfig): any {
    if (!itinerary || !itinerary.days) {
      return itinerary;
    }

    const anonymized = { ...itinerary };
    anonymized.days = itinerary.days.map((day: any) => {
      const anonymizedDay = { ...day };
      if (anonymizedDay.items) {
        anonymizedDay.items = anonymizedDay.items.map((item: any) => {
          if (item.location_ref?.coordinates) {
            return {
              ...item,
              location_ref: {
                ...item.location_ref,
                coordinates: undefined, // 移除精确坐标
                // 可以保留place_id和name，这些通常不包含PII
              },
            };
          }
          return item;
        });
      }
      return anonymizedDay;
    });

    return anonymized;
  }

  /**
   * 脱敏时间戳（精确时间 → 日期级别）
   */
  private anonymizeTimestamp(timestamp: string): string {
    // 将ISO 8601时间戳转换为日期（移除时间部分）
    try {
      const date = new Date(timestamp);
      return date.toISOString().split('T')[0]; // 只保留日期部分
    } catch (error) {
      this.logger.warn(`[PIIAnonymizer] 无法解析时间戳: ${timestamp}`);
      return timestamp; // 如果解析失败，返回原值
    }
  }

  /**
   * 哈希值（用于可复现的哈希）
   */
  private hashValue(value: any, prefix: string, salt?: string): string {
    const valueStr = String(value);
    const hashInput = salt ? `${salt}:${valueStr}` : valueStr;
    const hash = createHash('sha256').update(hashInput).digest('hex');
    return `${prefix}_${hash.substring(0, 16)}`; // 使用前16位哈希
  }
}

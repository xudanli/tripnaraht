// src/data-privacy/services/data-privacy-framework.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from './encryption.service';
import {
  DataUsage,
  Consent,
  EncryptedData,
  DataType,
  RetentionPolicy,
  DataRights,
  UserDataExport,
  MinimalData,
} from '../interfaces/data-privacy.interface';

/**
 * 数据隐私保护框架服务
 * 
 * 实现数据隐私保护的核心功能：
 * 1. 最小必要原则
 * 2. 用户知情和同意
 * 3. 数据加密
 * 4. 数据最小化保留期
 * 5. 用户的数据权利
 */
@Injectable()
export class DataPrivacyFrameworkService {
  private readonly logger = new Logger(DataPrivacyFrameworkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

  /**
   * 最小必要原则：只收集必要的数据
   */
  async collectMinimalNecessaryData(
    userRequest: Record<string, any>,
    purpose: DataUsage['purpose'],
  ): Promise<MinimalData> {
    const requiredFields = this.determineRequiredFields(purpose);
    const excludedFields: string[] = [];
    const minimalData: Record<string, any> = {};

    // 只提取必需字段
    requiredFields.forEach(field => {
      if (userRequest[field] !== undefined) {
        minimalData[field] = userRequest[field];
      }
    });

    // 记录被排除的字段
    Object.keys(userRequest).forEach(field => {
      if (!requiredFields.includes(field)) {
        excludedFields.push(field);
      }
    });

    this.logger.log(
      `Collected minimal data for purpose ${purpose}: ${requiredFields.length} required fields, ${excludedFields.length} excluded fields`,
    );

    return {
      requiredFields,
      data: minimalData,
      excludedFields,
    };
  }

  /**
   * 用户知情和同意
   */
  async getUserInformedConsent(
    userId: string,
    dataUsage: DataUsage,
  ): Promise<Consent> {
    // 检查是否已有有效同意
    const existingConsent = await this.prisma.dataConsent.findFirst({
      where: {
        userId,
        purpose: dataUsage.purpose,
        status: 'ACTIVE',
      },
    });

    if (existingConsent) {
      return {
        required: false,
        consentId: existingConsent.id,
        grantedAt: existingConsent.grantedAt || undefined,
      };
    }

    // 需要用户同意
    const consentText = this.generateConsentText(dataUsage);
    const consentFields = dataUsage.fields;

    return {
      required: true,
      consentText,
      consentFields,
    };
  }

  /**
   * 记录用户同意
   */
  async recordConsent(
    userId: string,
    dataUsage: DataUsage,
    consentText: string,
  ): Promise<string> {
    // 撤销之前的同意（如果有）
    await this.prisma.dataConsent.updateMany({
      where: {
        userId,
        purpose: dataUsage.purpose,
        status: 'ACTIVE',
      },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });

    // 创建新同意记录
    const consent = await this.prisma.dataConsent.create({
      data: {
        userId,
        purpose: dataUsage.purpose,
        status: 'ACTIVE',
        consentText,
        grantedAt: new Date(),
      },
    });

    this.logger.log(`Consent recorded for user ${userId}, purpose ${dataUsage.purpose}`);

    return consent.id;
  }

  /**
   * 撤销用户同意
   */
  async revokeConsent(userId: string, purpose: DataUsage['purpose']): Promise<void> {
    await this.prisma.dataConsent.updateMany({
      where: {
        userId,
        purpose,
        status: 'ACTIVE',
      },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });

    this.logger.log(`Consent revoked for user ${userId}, purpose ${purpose}`);
  }

  /**
   * 数据加密
   */
  async encryptSensitiveData(data: any): Promise<EncryptedData> {
    return this.encryptionService.encrypt(data, 'AES-256');
  }

  /**
   * 数据解密
   */
  async decryptSensitiveData(encryptedData: EncryptedData): Promise<any> {
    return this.encryptionService.decrypt(encryptedData);
  }

  /**
   * 数据最小化保留期
   */
  async minimizeRetentionPeriod(dataType: DataType): Promise<RetentionPolicy> {
    // 从数据库获取保留策略，如果没有则使用默认值
    let policy = await this.prisma.dataRetentionPolicy.findUnique({
      where: { dataType },
    });

    if (!policy) {
      // 使用默认保留策略
      const defaultPolicies: Record<DataType, number> = {
        HEALTH_DATA: 730, // 2年
        LOCATION_DATA: 7, // 7天
        BEHAVIORAL_DATA: 365, // 1年
        PERSONAL_DATA: 90, // 90天
        PAYMENT_DATA: 2555, // 7年（财务记录）
        OTHER: 90, // 90天
      };

      const retentionDays = defaultPolicies[dataType] || 90;

      // 创建默认策略记录
      policy = await this.prisma.dataRetentionPolicy.create({
        data: {
          dataType,
          retentionDays,
          autoDelete: true,
        },
      });
    }

    return {
      dataType: policy.dataType as DataType,
      retentionDays: policy.retentionDays,
      autoDelete: policy.autoDelete,
      createdAt: policy.createdAt,
    };
  }

  /**
   * 用户的数据权利
   */
  async getUserDataRights(userId: string): Promise<DataRights> {
    return {
      access: async () => await this.exportUserData(userId),
      correct: async (field: string, value: any) => await this.correctUserData(userId, field, value),
      delete: async () => await this.deleteUserData(userId),
      export: async () => await this.exportUserData(userId),
    };
  }

  /**
   * 导出用户数据
   */
  private async exportUserData(userId: string): Promise<UserDataExport> {
    // 收集所有用户相关数据
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
      },
    });

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    // Get trips separately since User model doesn't have trips relation
    const trips = await this.prisma.trip.findMany({
      where: { 
        TripCollaborator: {
          some: { userId }
        }
      },
      take: 100, // Limit for privacy
    });

    // Get user travel profile separately
    const userTravelProfile = await this.prisma.userTravelProfile.findUnique({
      where: { userId },
    });

    const data: Record<string, any> = {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      trips: trips || [],
      profile: userTravelProfile || null,
    };

    return {
      userId,
      exportedAt: new Date(),
      data,
      format: 'json',
    };
  }

  /**
   * 更正用户数据
   */
  private async correctUserData(userId: string, field: string, value: any): Promise<void> {
    // 根据字段类型更新相应的表
    if (field.startsWith('user.')) {
      const userField = field.replace('user.', '');
      await this.prisma.user.update({
        where: { id: userId },
        data: { [userField]: value },
      });
    } else if (field.startsWith('profile.')) {
      const profileField = field.replace('profile.', '');
      await this.prisma.userTravelProfile.updateMany({
        where: { userId },
        data: { [profileField]: value },
      });
    } else {
      throw new Error(`Unknown field: ${field}`);
    }

    this.logger.log(`User data corrected: ${userId}, field: ${field}`);
  }

  /**
   * 删除用户数据
   */
  private async deleteUserData(userId: string): Promise<void> {
    // 删除所有用户相关数据
    await this.prisma.user.delete({
      where: { id: userId },
    });

    this.logger.log(`User data deleted: ${userId}`);
  }

  // ========== 辅助方法 ==========

  /**
   * 确定必需字段
   */
  private determineRequiredFields(purpose: DataUsage['purpose']): string[] {
    const fieldMap: Record<DataUsage['purpose'], string[]> = {
      HEALTH_RISK_ASSESSMENT: ['age', 'fitnessLevel', 'medicalConditions'],
      LOCATION_TRACKING: ['latitude', 'longitude', 'timestamp'],
      BEHAVIORAL_ANALYSIS: ['searchHistory', 'preferences'],
      TRIP_PLANNING: ['destination', 'travelDates', 'travelers'],
      PERSONALIZATION: ['preferences', 'history'],
      ANALYTICS: ['userId', 'timestamp'],
      COMPANION_MATCH_REVEAL: ['display_name', 'age_band', 'party_detail', 'contact_hint'],
      COMPANION_MATCH_ESCROW: ['amount_cents', 'currency', 'request_id'],
    };

    return fieldMap[purpose] || [];
  }

  /**
   * 生成同意文本
   */
  private generateConsentText(dataUsage: DataUsage): string {
    const purposeText: Record<DataUsage['purpose'], string> = {
      HEALTH_RISK_ASSESSMENT: '健康风险评估',
      LOCATION_TRACKING: '位置追踪',
      BEHAVIORAL_ANALYSIS: '行为分析',
      TRIP_PLANNING: '行程规划',
      PERSONALIZATION: '个性化推荐',
      ANALYTICS: '数据分析',
      COMPANION_MATCH_REVEAL: '智能搭子双向解密（Privacy Shield）',
      COMPANION_MATCH_ESCROW: '智能搭子拼团意向金托管',
    };

    const purpose = purposeText[dataUsage.purpose] || dataUsage.purpose;
    const fields = dataUsage.fields.join('、');
    const retention = `${dataUsage.retentionDays}天`;
    const thirdParty = dataUsage.sharedWithThirdParty
      ? `，并与${dataUsage.thirdPartyName || '第三方'}共享`
      : '';

    return `我们将在${retention}内使用您的${fields}数据用于${purpose}${thirdParty}。您有权随时撤回同意。`;
  }
}

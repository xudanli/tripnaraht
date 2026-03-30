// src/safety/services/safety-notification.service.ts

import { Injectable, Logger, Optional, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import * as nodemailer from 'nodemailer';
import {
  GeopoliticalRiskLevel,
  SafetyAlertDto,
  TripSafetyImpactDto,
  SafetyNotificationPreferencesDto,
} from '../dto/geopolitical-risk.dto';
import { SAFETY_EVENTS } from './geopolitical-risk.service';

/**
 * 通知渠道
 */
export enum NotificationChannel {
  EMAIL = 'EMAIL',
  PUSH = 'PUSH',
  SMS = 'SMS',
  WEBSOCKET = 'WEBSOCKET',
  IN_APP = 'IN_APP',
}

/**
 * 通知优先级
 */
export enum NotificationPriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  URGENT = 4,
  CRITICAL = 5,
}

/**
 * 通知记录
 */
interface NotificationRecord {
  id: string;
  userId: string;
  alertId: string;
  channel: NotificationChannel;
  priority: NotificationPriority;
  title: string;
  body: string;
  sentAt: Date;
  deliveredAt?: Date;
  readAt?: Date;
  error?: string;
}

/**
 * 安全通知服务
 * 
 * 职责：
 * 1. 根据风险等级决定通知渠道和优先级
 * 2. 发送邮件、推送、短信等通知
 * 3. 管理用户通知偏好
 * 4. 记录通知历史
 */
@Injectable()
export class SafetyNotificationService implements OnModuleInit {
  private readonly logger = new Logger(SafetyNotificationService.name);
  
  // 邮件发送器
  private transporter: nodemailer.Transporter | null = null;
  
  // 用户通知偏好缓存
  private readonly userPreferences: Map<string, SafetyNotificationPreferencesDto> = new Map();
  
  // 通知记录
  private readonly notificationHistory: NotificationRecord[] = [];
  
  // 待处理的WebSocket通知队列
  private readonly wsNotificationQueue: Array<{
    userId: string;
    payload: any;
  }> = [];

  constructor(
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  async onModuleInit() {
    await this.initializeEmailTransporter();
    this.logger.log('安全通知服务已初始化');
  }

  /**
   * 初始化邮件发送器
   */
  private async initializeEmailTransporter(): Promise<void> {
    const smtpHost = this.configService?.get<string>('SMTP_HOST');
    const smtpPort = parseInt(this.configService?.get<string>('SMTP_PORT') || '587', 10);
    const smtpUser = this.configService?.get<string>('SMTP_USER');
    const smtpPassword = this.configService?.get<string>('SMTP_PASSWORD') || 
                         this.configService?.get<string>('SMTP_PASS');
    const smtpSecure = this.configService?.get<string>('SMTP_SECURE') === 'true' || smtpPort === 465;

    if (!smtpHost || !smtpUser || !smtpPassword) {
      this.logger.warn('SMTP配置不完整，邮件通知功能不可用');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: {
          user: smtpUser,
          pass: smtpPassword,
        },
      });

      await this.transporter.verify();
      this.logger.log('邮件发送器初始化成功');
    } catch (error: any) {
      this.logger.error(`邮件发送器初始化失败: ${error.message}`);
      this.transporter = null;
    }
  }

  /**
   * 监听安全警报创建事件
   */
  @OnEvent(SAFETY_EVENTS.ALERT_CREATED)
  async handleAlertCreated(payload: { alert: SafetyAlertDto; timestamp: Date }): Promise<void> {
    this.logger.log(`收到新警报: ${payload.alert.title}`);
    
    // 获取所有受影响用户
    const affectedUsers = await this.getAffectedUsers(payload.alert);
    
    for (const userId of affectedUsers) {
      await this.notifyUser(userId, payload.alert);
    }
  }

  /**
   * 监听行程受影响事件
   */
  @OnEvent(SAFETY_EVENTS.TRIP_AFFECTED)
  async handleTripAffected(payload: { tripId: string; impact: TripSafetyImpactDto; timestamp: Date }): Promise<void> {
    this.logger.log(`行程 ${payload.tripId} 受安全事件影响`);
    
    // 这里需要根据tripId获取用户信息
    // 实际实现时需要注入TripsService
    // 暂时使用占位逻辑
  }

  /**
   * 向用户发送安全通知
   */
  async notifyUser(userId: string, alert: SafetyAlertDto): Promise<void> {
    const preferences = this.getUserPreferences(userId);
    
    // 检查用户是否设置了最低通知风险等级
    if (preferences && alert.riskLevel < preferences.minRiskLevel) {
      this.logger.debug(`用户 ${userId} 的风险等级阈值(${preferences.minRiskLevel})高于警报等级(${alert.riskLevel})，跳过通知`);
      return;
    }

    // 确定通知渠道和优先级
    const { channels, priority } = this.determineNotificationStrategy(alert.riskLevel, preferences);

    // 构建通知内容
    const { title, body, html } = this.buildNotificationContent(alert);

    // 发送到各渠道
    for (const channel of channels) {
      try {
        await this.sendNotification(userId, channel, priority, title, body, html, alert.id);
      } catch (error: any) {
        this.logger.error(`发送通知失败 [${channel}]: ${error.message}`);
      }
    }
  }

  /**
   * 发送行程安全影响通知
   */
  async notifyTripImpact(
    userId: string,
    userEmail: string,
    impact: TripSafetyImpactDto,
  ): Promise<void> {
    const maxRiskLevel = Math.max(
      ...impact.affectedDestinations.map(d => d.riskLevel),
      GeopoliticalRiskLevel.SAFE,
    );

    const { channels, priority } = this.determineNotificationStrategy(maxRiskLevel);
    const { title, body, html } = this.buildTripImpactContent(impact);

    for (const channel of channels) {
      try {
        if (channel === NotificationChannel.EMAIL && userEmail) {
          await this.sendEmailNotification(userEmail, title, body, html);
        } else {
          await this.sendNotification(userId, channel, priority, title, body, html, impact.tripId);
        }
      } catch (error: any) {
        this.logger.error(`发送行程影响通知失败 [${channel}]: ${error.message}`);
      }
    }
  }

  /**
   * 确定通知策略
   */
  private determineNotificationStrategy(
    riskLevel: GeopoliticalRiskLevel,
    preferences?: SafetyNotificationPreferencesDto | null,
  ): { channels: NotificationChannel[]; priority: NotificationPriority } {
    const channels: NotificationChannel[] = [];
    let priority: NotificationPriority;

    switch (riskLevel) {
      case GeopoliticalRiskLevel.NO_GO:
        // 最高风险：所有渠道，立即通知
        priority = NotificationPriority.CRITICAL;
        channels.push(
          NotificationChannel.PUSH,
          NotificationChannel.SMS,
          NotificationChannel.EMAIL,
          NotificationChannel.WEBSOCKET,
          NotificationChannel.IN_APP,
        );
        break;

      case GeopoliticalRiskLevel.DANGEROUS:
        // 危险：推送+短信+邮件
        priority = NotificationPriority.URGENT;
        channels.push(
          NotificationChannel.PUSH,
          NotificationChannel.SMS,
          NotificationChannel.EMAIL,
          NotificationChannel.WEBSOCKET,
        );
        break;

      case GeopoliticalRiskLevel.HIGH_RISK:
        // 高风险：推送+邮件
        priority = NotificationPriority.HIGH;
        channels.push(
          NotificationChannel.PUSH,
          NotificationChannel.EMAIL,
          NotificationChannel.WEBSOCKET,
        );
        break;

      case GeopoliticalRiskLevel.CAUTION:
        // 注意：邮件+App内通知
        priority = NotificationPriority.NORMAL;
        channels.push(
          NotificationChannel.EMAIL,
          NotificationChannel.IN_APP,
        );
        break;

      default:
        // 安全：仅App内通知
        priority = NotificationPriority.LOW;
        channels.push(NotificationChannel.IN_APP);
    }

    // 根据用户偏好过滤渠道
    if (preferences) {
      const filteredChannels = channels.filter(channel => {
        if (channel === NotificationChannel.PUSH && !preferences.pushEnabled) return false;
        if (channel === NotificationChannel.EMAIL && !preferences.emailEnabled) return false;
        if (channel === NotificationChannel.SMS && !preferences.smsEnabled) return false;
        return true;
      });

      // 确保至少有一个通知渠道
      if (filteredChannels.length > 0) {
        return { channels: filteredChannels, priority };
      }
    }

    return { channels, priority };
  }

  /**
   * 构建通知内容
   */
  private buildNotificationContent(alert: SafetyAlertDto): { title: string; body: string; html: string } {
    const riskEmoji = this.getRiskEmoji(alert.riskLevel);
    const affectedCountries = alert.affectedRegions
      .filter(r => r.impactLevel === 'DIRECT')
      .map(r => r.countryName)
      .join(', ');

    const title = `${riskEmoji} 安全警报: ${alert.title}`;
    
    const body = `
${alert.summary}

影响地区: ${affectedCountries}
风险等级: ${this.getRiskLevelText(alert.riskLevel)}
紧急程度: ${alert.urgency}

${alert.recommendations?.slice(0, 3).join('\n') || ''}

请立即查看详情并采取必要措施。
    `.trim();

    const html = this.buildAlertEmailHtml(alert);

    return { title, body, html };
  }

  /**
   * 构建行程影响通知内容
   */
  private buildTripImpactContent(impact: TripSafetyImpactDto): { title: string; body: string; html: string } {
    const directlyAffected = impact.affectedDestinations.filter(d => d.impactLevel === 'DIRECT');
    const maxRiskLevel = Math.max(...impact.affectedDestinations.map(d => d.riskLevel));
    const riskEmoji = this.getRiskEmoji(maxRiskLevel);

    const title = `${riskEmoji} 您的行程受安全事件影响`;
    
    const affectedNames = directlyAffected.map(d => d.countryName).join(', ');
    
    const body = `
您计划前往的目的地受到安全事件影响。

受影响目的地: ${affectedNames}
影响程度: ${impact.impactLevel}

建议措施:
${impact.recommendations?.slice(0, 3).map((r, i) => `${i + 1}. ${r}`).join('\n') || ''}

${impact.alternativeDestinations && impact.alternativeDestinations.length > 0 
  ? `\n推荐替代目的地: ${impact.alternativeDestinations.join(', ')}` 
  : ''}

请登录App查看详细信息并调整您的行程。
    `.trim();

    const html = this.buildTripImpactEmailHtml(impact);

    return { title, body, html };
  }

  /**
   * 发送通知
   */
  private async sendNotification(
    userId: string,
    channel: NotificationChannel,
    priority: NotificationPriority,
    title: string,
    body: string,
    html: string,
    alertId: string,
  ): Promise<void> {
    const record: NotificationRecord = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      alertId,
      channel,
      priority,
      title,
      body,
      sentAt: new Date(),
    };

    try {
      switch (channel) {
        case NotificationChannel.EMAIL:
          // 需要获取用户邮箱 - 实际实现需要注入UserService
          // await this.sendEmailNotification(userEmail, title, body, html);
          this.logger.debug(`[EMAIL] 待发送给用户 ${userId}: ${title}`);
          break;

        case NotificationChannel.PUSH:
          // 需要集成推送服务 (FCM, APNs)
          this.logger.debug(`[PUSH] 待发送给用户 ${userId}: ${title}`);
          break;

        case NotificationChannel.SMS:
          // 需要集成短信服务
          this.logger.debug(`[SMS] 待发送给用户 ${userId}: ${title}`);
          break;

        case NotificationChannel.WEBSOCKET:
          // 添加到WebSocket队列
          this.wsNotificationQueue.push({
            userId,
            payload: { type: 'SAFETY_ALERT', alertId, title, body, priority },
          });
          this.logger.debug(`[WEBSOCKET] 已加入队列，用户 ${userId}: ${title}`);
          break;

        case NotificationChannel.IN_APP:
          // 存储为应用内通知
          this.logger.debug(`[IN_APP] 存储应用内通知，用户 ${userId}: ${title}`);
          break;
      }

      record.deliveredAt = new Date();
    } catch (error: any) {
      record.error = error.message;
      throw error;
    } finally {
      this.notificationHistory.push(record);
    }
  }

  /**
   * 发送邮件通知
   */
  async sendEmailNotification(
    to: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<void> {
    if (!this.transporter) {
      this.logger.warn('邮件发送器未配置，跳过邮件发送');
      return;
    }

    const from = this.configService?.get<string>('SMTP_FROM') || 
                 this.configService?.get<string>('SMTP_USER') || 
                 'noreply@tripnara.com';

    await this.transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });

    this.logger.log(`邮件已发送至 ${to}: ${subject}`);
  }

  /**
   * 获取用户通知偏好
   */
  getUserPreferences(userId: string): SafetyNotificationPreferencesDto | null {
    return this.userPreferences.get(userId) || null;
  }

  /**
   * 设置用户通知偏好
   */
  setUserPreferences(preferences: SafetyNotificationPreferencesDto): void {
    this.userPreferences.set(preferences.userId, preferences);
    this.logger.debug(`已更新用户 ${preferences.userId} 的通知偏好`);
  }

  /**
   * 获取WebSocket通知队列
   */
  getWebSocketNotificationQueue(): Array<{ userId: string; payload: any }> {
    return [...this.wsNotificationQueue];
  }

  /**
   * 清空WebSocket通知队列
   */
  clearWebSocketNotificationQueue(): void {
    this.wsNotificationQueue.length = 0;
  }

  /**
   * 获取受影响的用户
   * 实际实现需要查询数据库找出行程涉及这些国家的用户
   */
  private async getAffectedUsers(_alert: SafetyAlertDto): Promise<string[]> {
    // 占位实现 - 实际需要查询数据库
    // SELECT DISTINCT user_id FROM trips 
    // WHERE destinations OVERLAPS alert.affectedRegions
    // AND trip_date > NOW()
    return [];
  }

  /**
   * 获取风险等级对应的emoji
   */
  private getRiskEmoji(level: GeopoliticalRiskLevel): string {
    switch (level) {
      case GeopoliticalRiskLevel.NO_GO: return '🔴';
      case GeopoliticalRiskLevel.DANGEROUS: return '🟠';
      case GeopoliticalRiskLevel.HIGH_RISK: return '🟡';
      case GeopoliticalRiskLevel.CAUTION: return '🟢';
      default: return '⚪';
    }
  }

  /**
   * 获取风险等级文字描述
   */
  private getRiskLevelText(level: GeopoliticalRiskLevel): string {
    switch (level) {
      case GeopoliticalRiskLevel.NO_GO: return 'Level 5 - 禁止前往';
      case GeopoliticalRiskLevel.DANGEROUS: return 'Level 4 - 危险';
      case GeopoliticalRiskLevel.HIGH_RISK: return 'Level 3 - 高风险';
      case GeopoliticalRiskLevel.CAUTION: return 'Level 2 - 需注意';
      default: return 'Level 1 - 安全';
    }
  }

  /**
   * 构建警报邮件HTML
   */
  private buildAlertEmailHtml(alert: SafetyAlertDto): string {
    const riskColor = this.getRiskColor(alert.riskLevel);
    const directRegions = alert.affectedRegions.filter(r => r.impactLevel === 'DIRECT');
    const adjacentRegions = alert.affectedRegions.filter(r => r.impactLevel === 'ADJACENT');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, ${riskColor} 0%, ${this.darkenColor(riskColor)} 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
    <h1 style="margin: 0; font-size: 24px;">${this.getRiskEmoji(alert.riskLevel)} 安全警报</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 14px;">风险等级: ${this.getRiskLevelText(alert.riskLevel)}</p>
  </div>
  
  <div style="background: #f8f9fa; padding: 20px; border: 1px solid #e9ecef; border-top: none;">
    <h2 style="color: #333; margin-top: 0;">${alert.title}</h2>
    <p style="color: #666; line-height: 1.6;">${alert.summary}</p>
  </div>

  <div style="padding: 20px; border: 1px solid #e9ecef; border-top: none;">
    <h3 style="color: #333; margin-top: 0;">📍 直接受影响地区</h3>
    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
      ${directRegions.map(r => `
        <span style="background: ${riskColor}20; color: ${riskColor}; padding: 4px 12px; border-radius: 20px; font-size: 14px;">
          ${r.countryName}
        </span>
      `).join('')}
    </div>
    
    ${adjacentRegions.length > 0 ? `
    <h3 style="color: #333; margin-top: 20px;">🔗 邻近受影响地区</h3>
    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
      ${adjacentRegions.map(r => `
        <span style="background: #f0f0f0; color: #666; padding: 4px 12px; border-radius: 20px; font-size: 14px;">
          ${r.countryName}
        </span>
      `).join('')}
    </div>
    ` : ''}
  </div>

  ${alert.recommendations && alert.recommendations.length > 0 ? `
  <div style="background: #fff3cd; padding: 20px; border: 1px solid #ffc107; border-top: none;">
    <h3 style="color: #856404; margin-top: 0;">💡 建议措施</h3>
    <ul style="color: #856404; margin: 0; padding-left: 20px;">
      ${alert.recommendations.map(r => `<li style="margin-bottom: 8px;">${r}</li>`).join('')}
    </ul>
  </div>
  ` : ''}

  <div style="background: #f8f9fa; padding: 20px; border: 1px solid #e9ecef; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="margin: 0; color: #666; font-size: 12px;">
      此警报由TripNARA安全监控系统自动生成<br>
      发布时间: ${alert.createdAt.toLocaleString('zh-CN')}<br>
      紧急程度: ${alert.urgency}
    </p>
  </div>

  <div style="padding: 20px; text-align: center;">
    <a href="#" style="display: inline-block; background: ${riskColor}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
      查看详情
    </a>
  </div>

  <div style="padding: 20px; text-align: center; color: #999; font-size: 12px;">
    <p>如需帮助，请联系我们的24小时客服热线</p>
    <p>© ${new Date().getFullYear()} TripNARA. All rights reserved.</p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * 构建行程影响邮件HTML
   */
  private buildTripImpactEmailHtml(impact: TripSafetyImpactDto): string {
    const maxRiskLevel = Math.max(...impact.affectedDestinations.map(d => d.riskLevel));
    const riskColor = this.getRiskColor(maxRiskLevel);

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, ${riskColor} 0%, ${this.darkenColor(riskColor)} 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
    <h1 style="margin: 0; font-size: 24px;">⚠️ 行程安全提醒</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 14px;">您的行程可能受到安全事件影响</p>
  </div>
  
  <div style="background: #f8f9fa; padding: 20px; border: 1px solid #e9ecef; border-top: none;">
    <h2 style="color: #333; margin-top: 0;">影响程度: ${impact.impactLevel}</h2>
    <p style="color: #666;">以下目的地受到影响:</p>
    
    <div style="margin: 15px 0;">
      ${impact.affectedDestinations.map(d => `
        <div style="display: flex; align-items: center; padding: 10px; background: white; border-radius: 5px; margin-bottom: 8px; border-left: 4px solid ${this.getRiskColor(d.riskLevel)};">
          <span style="flex: 1; font-weight: bold;">${d.countryName}</span>
          <span style="background: ${this.getRiskColor(d.riskLevel)}20; color: ${this.getRiskColor(d.riskLevel)}; padding: 2px 8px; border-radius: 10px; font-size: 12px;">
            ${d.impactLevel === 'DIRECT' ? '直接影响' : '间接影响'}
          </span>
        </div>
      `).join('')}
    </div>
  </div>

  ${impact.recommendations && impact.recommendations.length > 0 ? `
  <div style="padding: 20px; border: 1px solid #e9ecef; border-top: none;">
    <h3 style="color: #333; margin-top: 0;">💡 我们的建议</h3>
    <ol style="color: #666; margin: 0; padding-left: 20px;">
      ${impact.recommendations.map(r => `<li style="margin-bottom: 8px;">${r}</li>`).join('')}
    </ol>
  </div>
  ` : ''}

  ${impact.alternativeDestinations && impact.alternativeDestinations.length > 0 ? `
  <div style="background: #e8f5e9; padding: 20px; border: 1px solid #4caf50; border-top: none;">
    <h3 style="color: #2e7d32; margin-top: 0;">🌍 推荐替代目的地</h3>
    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
      ${impact.alternativeDestinations.map(d => `
        <span style="background: white; color: #2e7d32; padding: 6px 14px; border-radius: 20px; font-size: 14px; border: 1px solid #4caf50;">
          ${d}
        </span>
      `).join('')}
    </div>
  </div>
  ` : ''}

  <div style="padding: 20px; text-align: center;">
    <a href="#" style="display: inline-block; background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin-right: 10px;">
      调整行程
    </a>
    <a href="#" style="display: inline-block; background: white; color: #007bff; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; border: 1px solid #007bff;">
      联系客服
    </a>
  </div>

  <div style="padding: 20px; text-align: center; color: #999; font-size: 12px;">
    <p>评估时间: ${impact.assessedAt.toLocaleString('zh-CN')}</p>
    <p>© ${new Date().getFullYear()} TripNARA. All rights reserved.</p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * 获取风险等级对应的颜色
   */
  private getRiskColor(level: GeopoliticalRiskLevel): string {
    switch (level) {
      case GeopoliticalRiskLevel.NO_GO: return '#dc3545';
      case GeopoliticalRiskLevel.DANGEROUS: return '#fd7e14';
      case GeopoliticalRiskLevel.HIGH_RISK: return '#ffc107';
      case GeopoliticalRiskLevel.CAUTION: return '#28a745';
      default: return '#6c757d';
    }
  }

  /**
   * 加深颜色
   */
  private darkenColor(hex: string): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = -40;
    const R = Math.max(0, (num >> 16) + amt);
    const G = Math.max(0, ((num >> 8) & 0x00FF) + amt);
    const B = Math.max(0, (num & 0x0000FF) + amt);
    return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
  }
}

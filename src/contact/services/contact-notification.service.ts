// src/contact/services/contact-notification.service.ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class ContactNotificationService {
  private readonly logger = new Logger(ContactNotificationService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly notificationEmail: string;

  constructor(@Optional() private configService?: ConfigService) {
    const smtpHost = this.configService?.get<string>('SMTP_HOST') || 'smtp.exmail.qq.com';
    const smtpPort = parseInt(this.configService?.get<string>('SMTP_PORT') || '587', 10);
    const smtpUser = this.configService?.get<string>('SMTP_USER');
    const smtpPassword = this.configService?.get<string>('SMTP_PASSWORD') || 
                         this.configService?.get<string>('SMTP_PASS');
    const smtpSecure = this.configService?.get<string>('SMTP_SECURE') === 'true' || smtpPort === 465;

    // 客服邮箱，从环境变量读取，默认为 support@tripnara.com
    this.notificationEmail = this.configService?.get<string>('CONTACT_NOTIFICATION_EMAIL') || 
                            'support@tripnara.com';

    if (!smtpUser || !smtpPassword) {
      this.logger.warn('SMTP 配置未完整，邮件通知功能不可用');
      this.transporter = null;
    } else {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: {
          user: smtpUser,
          pass: smtpPassword,
        },
      });
      this.logger.log(`联系通知服务已初始化，通知邮箱: ${this.notificationEmail}`);
    }
  }

  /**
   * 发送新消息通知邮件
   */
  async sendNotificationEmail(
    messageId: string,
    message: string | null,
    userId: string | null,
    imageCount: number,
    imageUrls?: string[],
  ): Promise<void> {
    if (!this.transporter) {
      this.logger.warn('邮件发送器未配置，跳过邮件通知');
      return;
    }

    try {
      const smtpFrom = this.configService.get<string>('SMTP_FROM') || 
                      this.configService.get<string>('SMTP_USER') || 
                      'noreply@tripnara.com';
      const appName = this.configService.get<string>('APP_NAME') || 'TripNARA';

      // 构建邮件内容
      const userInfo = userId ? `用户ID: ${userId}` : '匿名用户';
      const messagePreview = message 
        ? (message.length > 200 ? message.substring(0, 200) + '...' : message)
        : '无文本消息';
      
      const imageSection = imageCount > 0
        ? `
        <div style="margin: 20px 0;">
          <h3 style="color: #333;">图片 (${imageCount} 张)</h3>
          ${imageUrls && imageUrls.length > 0
            ? imageUrls.map(url => `<p><a href="${url}">${url}</a></p>`).join('')
            : '<p>图片已上传到服务器</p>'
          }
        </div>
        `
        : '';

      await this.transporter.sendMail({
        from: smtpFrom,
        to: this.notificationEmail,
        subject: `[${appName}] 新的联系消息 - ${messageId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
            <h2 style="color: #333;">新的联系消息</h2>
            
            <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
              <p><strong>消息ID:</strong> ${messageId}</p>
              <p><strong>提交用户:</strong> ${userInfo}</p>
              <p><strong>提交时间:</strong> ${new Date().toLocaleString('zh-CN')}</p>
            </div>

            <div style="margin: 20px 0;">
              <h3 style="color: #333;">消息内容</h3>
              <div style="background-color: #fafafa; padding: 15px; border-left: 4px solid #007bff; white-space: pre-wrap;">
                ${messagePreview || '（无文本消息）'}
              </div>
            </div>

            ${imageSection}

            <div style="margin: 20px 0; padding: 15px; background-color: #fff3cd; border-left: 4px solid #ffc107;">
              <p><strong>注意:</strong> 请登录管理系统查看完整消息详情并处理。</p>
            </div>

            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">此邮件由系统自动发送，请勿直接回复。</p>
          </div>
        `,
        text: `
新的联系消息

消息ID: ${messageId}
提交用户: ${userInfo}
提交时间: ${new Date().toLocaleString('zh-CN')}

消息内容:
${message || '（无文本消息）'}

${imageCount > 0 ? `图片数量: ${imageCount} 张` : ''}

请登录管理系统查看完整消息详情并处理。
        `.trim(),
      });

      this.logger.log(`通知邮件已发送到 ${this.notificationEmail}`);
    } catch (error: any) {
      this.logger.error(`发送通知邮件失败: ${error.message}`, error.stack);
      // 不抛出错误，避免影响消息保存
    }
  }
}

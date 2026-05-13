// src/auth/services/email-verification.service.ts
import { Injectable, Logger, BadRequestException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly codeExpirationMinutes = 10; // 验证码有效期 10 分钟
  private readonly codeLength = 6; // 验证码长度

  constructor(
    private prisma: PrismaService,
    @Optional() private configService?: ConfigService,
  ) {
    // 配置邮件发送器 - 默认使用企业微信邮箱
    const smtpHost = this.configService?.get<string>('SMTP_HOST') || 'smtp.exmail.qq.com';
    const smtpPort = parseInt(this.configService?.get<string>('SMTP_PORT') || '465', 10);
    const smtpUser = this.configService?.get<string>('SMTP_USER');
    // 支持 SMTP_PASSWORD 和 SMTP_PASS 两种环境变量名
    const smtpPassword = this.configService?.get<string>('SMTP_PASSWORD') || this.configService?.get<string>('SMTP_PASS');
    // 支持 SMTP_SECURE 环境变量（true/false 字符串），企业微信邮箱 465 端口需要 SSL
    const smtpSecure = this.configService?.get<string>('SMTP_SECURE') === 'true' || smtpPort === 465;

    if (!smtpUser || !smtpPassword) {
      this.logger.warn('SMTP 配置未完整，邮件发送功能可能不可用');
      this.logger.warn(`SMTP_HOST: ${smtpHost}, SMTP_PORT: ${smtpPort}, SMTP_USER: ${smtpUser || '未设置'}, SMTP_PASSWORD: ${smtpPassword ? '已设置' : '未设置'}`);
    } else {
      this.logger.log(`SMTP 配置: ${smtpHost}:${smtpPort}, secure: ${smtpSecure}`);
    }

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure, // 使用配置的 secure 值或根据端口判断
      auth: smtpUser && smtpPassword ? {
        user: smtpUser,
        pass: smtpPassword,
      } : undefined,
    });
  }

  /**
   * 生成随机验证码
   */
  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString().padStart(this.codeLength, '0');
  }

  /**
   * 验证邮箱格式
   */
  private validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * 发送验证码到邮箱
   */
  async sendVerificationCode(email: string): Promise<void> {
    try {
      // 验证邮箱格式
      if (!this.validateEmail(email)) {
        throw new BadRequestException('无效的邮箱地址');
      }

      // 检查 SMTP 配置
      const smtpUser = this.configService?.get<string>('SMTP_USER');
      const smtpPassword = this.configService?.get<string>('SMTP_PASSWORD') || this.configService?.get<string>('SMTP_PASS');
      if (!smtpUser || !smtpPassword) {
        this.logger.error('SMTP 配置不完整，无法发送验证码邮件');
        throw new BadRequestException('邮件服务未配置，请联系管理员');
      }

      // 检查是否已有未使用的验证码（防止频繁发送）
      const existingCode = await this.prisma.emailVerificationCode.findFirst({
        where: {
          email,
          used: false,
          expiresAt: {
            gt: new Date(),
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // 如果 1 分钟内已发送过验证码，拒绝再次发送
      if (existingCode) {
        const timeSinceLastSend = Date.now() - existingCode.createdAt.getTime();
        if (timeSinceLastSend < 60000) { // 60 秒
          throw new BadRequestException('验证码发送过于频繁，请稍后再试');
        }
      }

      // 生成验证码
      const code = this.generateCode();
      const expiresAt = new Date(Date.now() + this.codeExpirationMinutes * 60 * 1000);

      // 保存验证码到数据库
      await this.prisma.emailVerificationCode.create({
        data: {
          email,
          code,
          expiresAt,
          used: false,
        },
      });

      // 发送邮件
      try {
        // Resend 要求 from 字段必须是有效的邮箱格式
        let smtpFrom = this.configService?.get<string>('SMTP_FROM');
        if (!smtpFrom) {
          // 如果没有设置 SMTP_FROM，尝试从 SMTP_USER 构造
          if (smtpUser && smtpUser.includes('@')) {
            smtpFrom = smtpUser;
          } else {
            // 如果 SMTP_USER 不是邮箱格式，使用默认值（需要在 Resend 中验证的域名）
            smtpFrom = 'noreply@tripnara.com';
          }
        }
        const appName = this.configService?.get<string>('APP_NAME') || 'TripNARA';

        await this.transporter.sendMail({
          from: smtpFrom,
          to: email,
          subject: `${appName} 邮箱验证码`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">${appName} 邮箱验证</h2>
              <p>您好，</p>
              <p>您的验证码是：</p>
              <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
                <h1 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 5px;">${code}</h1>
              </div>
              <p>验证码有效期为 ${this.codeExpirationMinutes} 分钟，请勿泄露给他人。</p>
              <p>如果这不是您的操作，请忽略此邮件。</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
              <p style="color: #999; font-size: 12px;">此邮件由系统自动发送，请勿回复。</p>
            </div>
          `,
          text: `您的 ${appName} 验证码是：${code}，有效期为 ${this.codeExpirationMinutes} 分钟。`,
        });

        this.logger.debug(`验证码已发送到 ${email}`);
      } catch (error: any) {
        this.logger.error(`发送验证码邮件失败: ${error?.message || error}`, error?.stack);
        // 记录详细错误信息用于调试
        if (error?.response) {
          this.logger.error(`SMTP 响应错误: ${JSON.stringify(error.response)}`);
        }
        if (error?.code) {
          this.logger.error(`SMTP 错误代码: ${error.code}`);
        }
        const errorMessage = error?.message || error?.toString() || 'Unknown error';
        throw new BadRequestException(`发送验证码失败: ${errorMessage}`);
      }
    } catch (error: any) {
      // Re-throw BadRequestException as-is
      if (error instanceof BadRequestException) {
        throw error;
      }
      // Log unexpected errors
      this.logger.error(`发送验证码时发生意外错误: ${error?.message || error}`, error?.stack);
      const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
      throw new BadRequestException(`发送验证码失败: ${errorMessage}`);
    }
  }

  /**
   * 非 production 环境下可用的固定测试验证码（勿用于生产）。
   */
  private isNonProdTestVerificationCode(code: string): boolean {
    if (process.env.NODE_ENV === 'production') {
      return false;
    }
    return code === '888888';
  }

  /**
   * 验证验证码
   */
  async verifyCode(email: string, code: string): Promise<boolean> {
    // 验证邮箱格式
    if (!this.validateEmail(email)) {
      throw new BadRequestException('无效的邮箱地址');
    }

    if (this.isNonProdTestVerificationCode(code)) {
      this.logger.warn(`已使用固定测试验证码 888888（email=${email}，仅 NODE_ENV!=production 时有效）`);
      return true;
    }

    // 查找验证码
    const verificationCode = await this.prisma.emailVerificationCode.findFirst({
      where: {
        email,
        code,
        used: false,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!verificationCode) {
      return false;
    }

    // 标记验证码为已使用
    await this.prisma.emailVerificationCode.update({
      where: { id: verificationCode.id },
      data: { used: true },
    });

    return true;
  }

  /**
   * 清理过期的验证码（定期任务）
   */
  async cleanupExpiredCodes(): Promise<void> {
    const deleted = await this.prisma.emailVerificationCode.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { used: true },
        ],
      },
    });

    if (deleted.count > 0) {
      this.logger.debug(`清理了 ${deleted.count} 条过期验证码记录`);
    }
  }
}


/**
 * Stripe Direct Service
 * 
 * 直接使用 Stripe API，不依赖 Smithery MCP 服务
 * 支持用户级别的 Stripe 账户连接和支付处理
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import Stripe from 'stripe';
import * as crypto from 'crypto';

@Injectable()
export class StripeDirectService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StripeDirectService.name);
  private stripe: Stripe | null = null;
  private secretKey: string | null = null;
  private isAvailable: boolean = false;
  private readonly encryptionKey: string; // For encrypting OAuth tokens

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.secretKey = 
      this.configService.get<string>('STRIPE_SECRET_KEY') || 
      process.env.STRIPE_SECRET_KEY || 
      null;
    
    // Encryption key for OAuth tokens (should be stored securely in production)
    this.encryptionKey = 
      this.configService.get<string>('STRIPE_ENCRYPTION_KEY') || 
      process.env.STRIPE_ENCRYPTION_KEY || 
      'default-encryption-key-change-in-production';
  }

  async onModuleInit() {
    if (this.secretKey) {
      try {
        this.stripe = new Stripe(this.secretKey, {
          apiVersion: '2026-01-28.clover',
        });
        
        // Test connection
        await this.stripe.balance.retrieve();
        
        this.isAvailable = true;
        this.logger.log('Stripe Direct Service initialized');
      } catch (error: any) {
        this.logger.error('Failed to initialize Stripe:', error.message);
        this.isAvailable = false;
      }
    } else {
      this.logger.warn('Stripe Secret Key not found. Service will not be available.');
      this.isAvailable = false;
    }
  }

  async onModuleDestroy() {
    this.logger.log('Stripe Direct Service destroyed');
  }

  /**
   * 检查服务是否可用
   */
  isServiceAvailable(): boolean {
    return this.isAvailable && !!this.stripe;
  }

  /**
   * 加密敏感数据（OAuth tokens）
   */
  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(this.encryptionKey.substring(0, 32).padEnd(32)), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * 解密敏感数据
   */
  private decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(this.encryptionKey.substring(0, 32).padEnd(32)), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * 获取或创建用户的 Stripe Customer
   */
  async getOrCreateCustomer(userId: string, email?: string, name?: string): Promise<string> {
    if (!this.isServiceAvailable()) {
      throw new Error('Stripe service is not available');
    }

    // 检查数据库中是否已有连接
    let connection = await this.prisma.stripeConnection.findUnique({
      where: { userId },
    });

    if (connection?.stripeCustomerId) {
      return connection.stripeCustomerId;
    }

    // 创建新的 Stripe Customer
    const customer = await this.stripe!.customers.create({
      email,
      name,
      metadata: {
        userId,
      },
    });

    // 保存到数据库
    if (connection) {
      connection = await this.prisma.stripeConnection.update({
        where: { userId },
        data: {
          stripeCustomerId: customer.id,
        },
      });
    } else {
      connection = await this.prisma.stripeConnection.create({
        data: {
          userId,
          stripeCustomerId: customer.id,
        },
      });
    }

    return customer.id;
  }

  /**
   * 创建支付意图（Payment Intent）
   */
  async createPaymentIntent(params: {
    userId: string;
    amount: number; // Amount in cents
    currency?: string;
    metadata?: Record<string, string>;
    paymentMethodId?: string;
    customerId?: string;
  }): Promise<Stripe.PaymentIntent> {
    if (!this.isServiceAvailable()) {
      throw new Error('Stripe service is not available');
    }

    // 获取或创建 Customer
    const customerId = params.customerId || await this.getOrCreateCustomer(params.userId);

    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: params.amount,
      currency: params.currency || 'usd',
      customer: customerId,
      metadata: {
        userId: params.userId,
        ...params.metadata,
      },
      automatic_payment_methods: {
        enabled: true,
      },
    };

    if (params.paymentMethodId) {
      paymentIntentParams.payment_method = params.paymentMethodId;
      paymentIntentParams.confirmation_method = 'manual';
    }

    const paymentIntent = await this.stripe!.paymentIntents.create(paymentIntentParams);

    // 保存到数据库
    await this.prisma.paymentIntent.create({
      data: {
        userId: params.userId,
        stripePaymentIntentId: paymentIntent.id,
        amount: params.amount,
        currency: params.currency || 'usd',
        status: paymentIntent.status,
        metadata: params.metadata || {},
      },
    });

    return paymentIntent;
  }

  /**
   * 确认支付意图
   */
  async confirmPaymentIntent(
    paymentIntentId: string,
    paymentMethodId?: string,
  ): Promise<Stripe.PaymentIntent> {
    if (!this.isServiceAvailable()) {
      throw new Error('Stripe service is not available');
    }

    const params: Stripe.PaymentIntentConfirmParams = {};
    if (paymentMethodId) {
      params.payment_method = paymentMethodId;
    }

    const paymentIntent = await this.stripe!.paymentIntents.confirm(paymentIntentId, params);

    // 更新数据库状态
    await this.prisma.paymentIntent.update({
      where: { stripePaymentIntentId: paymentIntentId },
      data: {
        status: paymentIntent.status,
        updatedAt: new Date(),
      },
    });

    return paymentIntent;
  }

  /**
   * 获取支付意图状态
   */
  async getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    if (!this.isServiceAvailable()) {
      throw new Error('Stripe service is not available');
    }

    return await this.stripe!.paymentIntents.retrieve(paymentIntentId);
  }

  /**
   * 处理退款
   */
  async refundPayment(
    paymentIntentId: string,
    amount?: number,
    reason?: Stripe.RefundCreateParams.Reason,
  ): Promise<Stripe.Refund> {
    if (!this.isServiceAvailable()) {
      throw new Error('Stripe service is not available');
    }

    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: paymentIntentId,
    };

    if (amount) {
      refundParams.amount = amount;
    }

    if (reason) {
      refundParams.reason = reason;
    }

    return await this.stripe!.refunds.create(refundParams);
  }

  /**
   * 获取用户的支付历史
   */
  async getPaymentHistory(
    userId: string,
    limit: number = 10,
    startingAfter?: string,
  ): Promise<Stripe.PaymentIntent[]> {
    if (!this.isServiceAvailable()) {
      throw new Error('Stripe service is not available');
    }

    // 从数据库获取用户的 Payment Intent IDs
    const dbIntents = await this.prisma.paymentIntent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: startingAfter ? 1 : 0,
      cursor: startingAfter ? { id: startingAfter } : undefined,
    });

    // 从 Stripe 获取详细信息
    const paymentIntents = await Promise.all(
      dbIntents.map((intent) =>
        this.stripe!.paymentIntents.retrieve(intent.stripePaymentIntentId),
      ),
    );

    return paymentIntents;
  }

  /**
   * 初始化 Stripe Connect OAuth 流程（用于平台模式）
   * 返回授权 URL
   */
  async initiateConnectOAuth(userId: string, redirectUri: string): Promise<string> {
    if (!this.isServiceAvailable()) {
      throw new Error('Stripe service is not available');
    }

    const clientId = this.configService.get<string>('STRIPE_CONNECT_CLIENT_ID') || 
                     process.env.STRIPE_CONNECT_CLIENT_ID;

    if (!clientId) {
      throw new Error('Stripe Connect Client ID not configured');
    }

    // 生成 state 参数（用于验证回调）
    const state = crypto.randomBytes(32).toString('hex');

    // 保存 state 到数据库（可以存储在 StripeConnection 的 metadata 中）
    await this.prisma.stripeConnection.upsert({
      where: { userId },
      create: {
        userId,
        metadata: { oauthState: state },
      },
      update: {
        metadata: { oauthState: state },
      },
    });

    // 构建 OAuth URL
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: 'read_write',
      redirect_uri: redirectUri,
      state,
    });

    return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
  }

  /**
   * 完成 Stripe Connect OAuth 流程
   */
  async completeConnectOAuth(
    userId: string,
    code: string,
    state: string,
  ): Promise<void> {
    if (!this.isServiceAvailable()) {
      throw new Error('Stripe service is not available');
    }

    // 验证 state
    const connection = await this.prisma.stripeConnection.findUnique({
      where: { userId },
    });

    if (!connection?.metadata || (connection.metadata as any).oauthState !== state) {
      throw new Error('Invalid OAuth state');
    }

    // 交换授权码获取 access token
    const response = await fetch('https://connect.stripe.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.configService.get<string>('STRIPE_CONNECT_CLIENT_ID') || 
                   process.env.STRIPE_CONNECT_CLIENT_ID || '',
        code,
        client_secret: this.secretKey || '',
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to exchange authorization code: ${response.statusText}`);
    }

    const data = await response.json();

    // 保存加密的 tokens
    await this.prisma.stripeConnection.update({
      where: { userId },
      data: {
        stripeAccountId: data.stripe_user_id,
        accessToken: this.encrypt(data.access_token),
        refreshToken: data.refresh_token ? this.encrypt(data.refresh_token) : null,
        tokenExpiresAt: data.expires_in
          ? new Date(Date.now() + data.expires_in * 1000)
          : null,
        metadata: {
          ...((connection.metadata || {}) as any),
          scope: data.scope,
        },
      },
    });
  }

  /**
   * 获取用户的 Stripe 连接状态
   */
  async getConnectionStatus(userId: string): Promise<{
    connected: boolean;
    stripeAccountId?: string;
    stripeCustomerId?: string;
    isActive: boolean;
  }> {
    const connection = await this.prisma.stripeConnection.findUnique({
      where: { userId },
    });

    if (!connection) {
      return { connected: false, isActive: false };
    }

    return {
      connected: true,
      stripeAccountId: connection.stripeAccountId || undefined,
      stripeCustomerId: connection.stripeCustomerId || undefined,
      isActive: connection.isActive,
    };
  }
}

import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { CredentialVerificationEnvConfig } from '../config/credential-verification-env.config';
import {
  buildCredentialGatewayStatus,
  loadCredentialVerificationEnvConfig,
  resolveCredentialChannelTransport,
} from '../config/credential-verification-env.config';
import {
  credentialGatewayFetchJson,
  CredentialGatewayHttpError,
} from '../util/credential-gateway-http.util';
import type {
  BadgeOcrGatewayResponse,
  OAuthGatewayResponse,
  ProfessionVerificationResult,
  SendWorkEmailCodeResult,
  UploadBadgeImageResult,
  XuexinGatewayResponse,
  XuexinVerificationResult,
} from './credential-gateway.types';
import type {
  CompanyTierTag,
  ProfessionIndustryTag,
  ProfessionRoleLevelTag,
} from '../types/verified-credentials.types';
import {
  inferRoleLevelFromTitle,
  resolveWorkEmailDomain,
} from '../config/credential-domain-registry.config';
import { mapOcrTextToProfessionProfile } from '../util/credential-ocr-mapper.util';
import type { RedisService } from '../../redis/redis.service';
import type { GoogleOcrProvider } from '../../providers/ocr/google-ocr.provider';

interface PendingEmailCode {
  code: string;
  workEmail: string;
  expiresAtMs: number;
}

interface StoredBadgeImage {
  imageBase64: string;
  mimeType: string;
  userId: string;
}

@Injectable()
export class CredentialVerificationGateway {
  private readonly logger = new Logger(CredentialVerificationGateway.name);
  private readonly config: CredentialVerificationEnvConfig;
  private readonly pendingEmailCodes = new Map<string, PendingEmailCode>();
  private readonly pendingBadgeImages = new Map<string, StoredBadgeImage & { expiresAtMs: number }>();

  constructor(
    @Optional() private readonly redisService?: RedisService,
    @Optional() private readonly googleOcrProvider?: GoogleOcrProvider,
  ) {
    this.config = loadCredentialVerificationEnvConfig();
  }

  getGatewayStatus() {
    return {
      ...buildCredentialGatewayStatus(this.config),
      redisOtpStore: Boolean(this.redisService),
      localBadgeOcrFallback: Boolean(process.env.GOOGLE_VISION_API_KEY),
    };
  }

  private channelTransport(
    channelUrl: string | null,
    channelName: string,
  ): 'stub' | 'production' {
    try {
      return resolveCredentialChannelTransport(this.config, channelUrl, channelName);
    } catch (error: unknown) {
      throw new BadRequestException((error as Error).message);
    }
  }

  async verifyXuexinOnlineCode(verificationCode: string): Promise<XuexinVerificationResult> {
    const code = verificationCode.trim();
    if (!code) {
      throw new BadRequestException('学信网在线验证码不能为空');
    }

    if (this.channelTransport(this.config.xuexinGatewayUrl, '学信网') === 'production') {
      return this.verifyXuexinProduction(code);
    }

    return this.verifyXuexinStub(code);
  }

  async sendWorkEmailVerificationCode(workEmail: string): Promise<SendWorkEmailCodeResult> {
    const email = workEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('请输入有效的工作邮箱');
    }

    const domainProfile = resolveWorkEmailDomain(email);
    if (!domainProfile) {
      throw new BadRequestException(
        '暂不支持该邮箱域名的一键验证，请使用工牌 OCR 或职场平台授权通道',
      );
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresInSeconds = this.config.emailOtpTtlSeconds;
    const expiresAtMs = Date.now() + expiresInSeconds * 1000;

    await this.storeEmailOtp(email, { code, workEmail: email, expiresAtMs });

    if (this.channelTransport(this.config.mailGatewayUrl, '企业邮箱') === 'production') {
      await this.sendEmailOtpProduction(email, code, expiresInSeconds);
    } else {
      this.logger.debug(`[CredentialGateway] stub email OTP for ${email}`);
    }

    const isDev = process.env.NODE_ENV !== 'production' && this.config.mode !== 'production';
    return {
      expiresInSeconds,
      ...(isDev ? { devCode: code } : {}),
    };
  }

  async verifyWorkEmailCode(
    workEmail: string,
    verificationCode: string,
  ): Promise<ProfessionVerificationResult> {
    const email = workEmail.trim().toLowerCase();
    const pending = await this.loadEmailOtp(email);

    if (!pending || pending.expiresAtMs < Date.now()) {
      await this.deleteEmailOtp(email);
      throw new BadRequestException('验证码已过期，请重新发送');
    }

    if (pending.code !== verificationCode.trim()) {
      throw new BadRequestException('验证码不正确');
    }

    await this.deleteEmailOtp(email);

    const domainProfile = resolveWorkEmailDomain(email);
    if (!domainProfile) {
      throw new BadRequestException('邮箱域名无法映射行业分类');
    }

    return {
      channel: 'work_email',
      industryTag: domainProfile.industryTag,
      companyTierTag: domainProfile.companyTierTag,
      roleLevelTag: 'employee',
    };
  }

  async verifyProfessionOAuth(
    provider: 'maimai' | 'linkedin',
    authToken: string,
  ): Promise<ProfessionVerificationResult> {
    if (!authToken?.trim()) {
      throw new BadRequestException('OAuth authToken 不能为空');
    }

    if (this.channelTransport(this.config.oauthGatewayUrl, 'OAuth') === 'production') {
      return this.verifyOAuthProduction(provider, authToken.trim());
    }

    return this.verifyOAuthStub(provider, authToken.trim());
  }

  async uploadProfessionBadgeImage(
    userId: string,
    imageBase64: string,
    mimeType = 'image/jpeg',
  ): Promise<UploadBadgeImageResult> {
    const normalized = imageBase64.trim();
    if (!normalized || normalized.length < 32) {
      throw new BadRequestException('请上传有效的工牌/名片图片');
    }

    if (normalized.length > 6_000_000) {
      throw new BadRequestException('图片过大，请压缩后重试');
    }

    const imageToken = randomUUID();
    const expiresInSeconds = this.config.badgeUploadTtlSeconds;
    const record: StoredBadgeImage & { expiresAtMs: number } = {
      imageBase64: normalized,
      mimeType,
      userId,
      expiresAtMs: Date.now() + expiresInSeconds * 1000,
    };

    await this.storeBadgeImage(imageToken, record);

    return { imageToken, expiresInSeconds };
  }

  async verifyProfessionBadgeOcr(
    userId: string,
    imageToken: string,
  ): Promise<ProfessionVerificationResult> {
    if (!imageToken?.trim()) {
      throw new BadRequestException('imageToken 不能为空');
    }

    if (this.channelTransport(this.config.badgeOcrGatewayUrl, '工牌 OCR') === 'production') {
      return this.verifyBadgeProduction(userId, imageToken.trim());
    }

    const stored = await this.loadBadgeImage(imageToken.trim());
    if (stored) {
      if (stored.userId !== userId) {
        throw new BadRequestException('imageToken 无效或已过期');
      }

      try {
        const mapping = await this.runLocalBadgeOcr(stored);
        return {
          channel: 'badge_ocr',
          ...mapping,
        };
      } finally {
        await this.deleteBadgeImage(imageToken.trim());
      }
    }

    return this.verifyBadgeStub(imageToken.trim());
  }

  private async verifyXuexinProduction(code: string): Promise<XuexinVerificationResult> {
    const url = `${this.config.xuexinGatewayUrl!.replace(/\/$/, '')}/v1/verify`;
    try {
      const data = await credentialGatewayFetchJson<XuexinGatewayResponse>(url, {
        body: { verificationCode: code },
        apiKey: this.config.gatewayApiKey,
        timeoutMs: this.config.httpTimeoutMs,
        maxRetries: this.config.httpMaxRetries,
      });

      this.assertXuexinResponse(data);
      return { degreeLevel: data.degreeLevel, tierTag: data.tierTag };
    } catch (error: unknown) {
      throw this.toBadRequest(error, '学信网授信失败');
    }
  }

  private verifyXuexinStub(code: string): XuexinVerificationResult {
    const lower = code.toLowerCase();
    if (lower.startsWith('985') || lower.includes('211')) {
      return { degreeLevel: 'bachelor', tierTag: '985_211' };
    }
    if (lower.startsWith('qs') || lower.includes('top50')) {
      return { degreeLevel: 'master', tierTag: 'qs_top50' };
    }
    if (lower.startsWith('overseas') || lower.includes('海归')) {
      return { degreeLevel: 'master', tierTag: 'overseas' };
    }
    if (lower.startsWith('phd') || lower.includes('doctor')) {
      return { degreeLevel: 'doctor', tierTag: 'general' };
    }
    if (lower.startsWith('master') || lower.includes('硕士')) {
      return { degreeLevel: 'master', tierTag: 'general' };
    }
    return { degreeLevel: 'bachelor', tierTag: 'general' };
  }

  private async sendEmailOtpProduction(
    email: string,
    code: string,
    expiresInSeconds: number,
  ): Promise<void> {
    const url = `${this.config.mailGatewayUrl!.replace(/\/$/, '')}/v1/send-otp`;
    try {
      await credentialGatewayFetchJson(url, {
        body: {
          to: email,
          from: this.config.mailFrom,
          template: 'credential_work_email_verify',
          variables: { code, expiresInMinutes: Math.ceil(expiresInSeconds / 60) },
          ttlSeconds: expiresInSeconds,
        },
        apiKey: this.config.gatewayApiKey,
        timeoutMs: this.config.httpTimeoutMs,
        maxRetries: this.config.httpMaxRetries,
      });
    } catch (error: unknown) {
      throw this.toBadRequest(error, '工作邮箱验证码发送失败');
    }
  }

  private async verifyOAuthProduction(
    provider: 'maimai' | 'linkedin',
    authToken: string,
  ): Promise<ProfessionVerificationResult> {
    const url = `${this.config.oauthGatewayUrl!.replace(/\/$/, '')}/v1/${provider}/exchange`;
    try {
      const data = await credentialGatewayFetchJson<OAuthGatewayResponse>(url, {
        body: { authToken },
        apiKey: this.config.gatewayApiKey,
        timeoutMs: this.config.httpTimeoutMs,
        maxRetries: this.config.httpMaxRetries,
      });

      this.assertOAuthResponse(data);
      return {
        channel: provider === 'maimai' ? 'oauth_maimai' : 'oauth_linkedin',
        industryTag: data.industryTag,
        companyTierTag: data.companyTierTag,
        roleLevelTag: data.roleLevelTag,
      };
    } catch (error: unknown) {
      throw this.toBadRequest(error, '职场平台授权失败');
    }
  }

  private verifyOAuthStub(
    provider: 'maimai' | 'linkedin',
    authToken: string,
  ): ProfessionVerificationResult {
    const token = authToken.toLowerCase();
    const parts = token.split(':');
    if (parts.length >= 3) {
      const industry = parts[1] as ProfessionIndustryTag;
      const role = parts[2] as ProfessionRoleLevelTag;
      return {
        channel: provider === 'maimai' ? 'oauth_maimai' : 'oauth_linkedin',
        industryTag: this.isIndustryTag(industry) ? industry : 'tech',
        companyTierTag: 'tier1_tech',
        roleLevelTag: role,
      };
    }

    return {
      channel: provider === 'maimai' ? 'oauth_maimai' : 'oauth_linkedin',
      industryTag: 'tech',
      companyTierTag: 'tier1_tech',
      roleLevelTag: 'product_director',
    };
  }

  private async verifyBadgeProduction(
    userId: string,
    imageToken: string,
  ): Promise<ProfessionVerificationResult> {
    const url = `${this.config.badgeOcrGatewayUrl!.replace(/\/$/, '')}/v1/verify`;
    try {
      const data = await credentialGatewayFetchJson<BadgeOcrGatewayResponse>(url, {
        body: { imageToken, userId, destroyOriginal: true },
        apiKey: this.config.gatewayApiKey,
        timeoutMs: this.config.httpTimeoutMs,
        maxRetries: this.config.httpMaxRetries,
      });

      this.assertOAuthResponse(data);
      await this.deleteBadgeImage(imageToken);
      return {
        channel: 'badge_ocr',
        industryTag: data.industryTag,
        companyTierTag: data.companyTierTag,
        roleLevelTag: data.roleLevelTag,
      };
    } catch (error: unknown) {
      throw this.toBadRequest(error, '工牌 OCR 授信失败');
    }
  }

  private verifyBadgeStub(imageToken: string): ProfessionVerificationResult {
    const roleLevelTag = inferRoleLevelFromTitle(imageToken);
    if (/制造|manufacturing|工业/.test(imageToken)) {
      return {
        channel: 'badge_ocr',
        industryTag: 'manufacturing',
        companyTierTag: 'known_manufacturing',
        roleLevelTag: roleLevelTag === 'employee' ? 'solutions_expert' : roleLevelTag,
      };
    }

    return {
      channel: 'badge_ocr',
      industryTag: 'tech',
      companyTierTag: 'tier1_tech',
      roleLevelTag,
    };
  }

  private async runLocalBadgeOcr(stored: StoredBadgeImage): Promise<{
    industryTag: ProfessionIndustryTag;
    companyTierTag: CompanyTierTag;
    roleLevelTag: ProfessionRoleLevelTag;
  }> {
    if (this.googleOcrProvider && process.env.GOOGLE_VISION_API_KEY) {
      const buffer = Buffer.from(stored.imageBase64, 'base64');
      const ocr = await this.googleOcrProvider.extractText(buffer, {
        mimeType: stored.mimeType,
        locale: 'zh-CN',
      });
      return mapOcrTextToProfessionProfile(ocr.fullText);
    }

    let textSample = stored.imageBase64.slice(0, 400);
    try {
      textSample = Buffer.from(stored.imageBase64, 'base64').toString('utf8');
    } catch {
      // keep raw sample for stub/dev
    }
    return mapOcrTextToProfessionProfile(textSample);
  }

  private assertXuexinResponse(data: XuexinGatewayResponse): void {
    const degrees = new Set(['bachelor', 'master', 'doctor']);
    const tiers = new Set(['985_211', 'qs_top50', 'overseas', 'general']);
    if (!degrees.has(data.degreeLevel) || !tiers.has(data.tierTag)) {
      throw new BadRequestException('学信网网关返回格式无效');
    }
  }

  private assertOAuthResponse(data: OAuthGatewayResponse): void {
    if (!this.isIndustryTag(data.industryTag)) {
      throw new BadRequestException('OAuth/OCR 网关返回行业无效');
    }
  }

  private isIndustryTag(value: string): value is ProfessionIndustryTag {
    return ['tech', 'finance', 'consulting', 'manufacturing', 'creative', 'other'].includes(value);
  }

  private toBadRequest(error: unknown, fallback: string): BadRequestException {
    if (error instanceof BadRequestException) return error;
    if (error instanceof CredentialGatewayHttpError) {
      return new BadRequestException(error.message || fallback);
    }
    if (error instanceof Error) {
      return new BadRequestException(error.message || fallback);
    }
    return new BadRequestException(fallback);
  }

  private emailOtpKey(email: string): string {
    return `credential:email-otp:${email}`;
  }

  private badgeImageKey(token: string): string {
    return `credential:badge-upload:${token}`;
  }

  private async storeEmailOtp(email: string, pending: PendingEmailCode): Promise<void> {
    if (this.redisService) {
      await this.redisService.set(
        this.emailOtpKey(email),
        pending,
        this.config.emailOtpTtlSeconds,
      );
      return;
    }
    this.pendingEmailCodes.set(email, pending);
  }

  private async loadEmailOtp(email: string): Promise<PendingEmailCode | null> {
    if (this.redisService) {
      return (await this.redisService.get<PendingEmailCode>(this.emailOtpKey(email))) ?? null;
    }
    return this.pendingEmailCodes.get(email) ?? null;
  }

  private async deleteEmailOtp(email: string): Promise<void> {
    if (this.redisService) {
      await this.redisService.del(this.emailOtpKey(email));
      return;
    }
    this.pendingEmailCodes.delete(email);
  }

  private async storeBadgeImage(
    token: string,
    record: StoredBadgeImage & { expiresAtMs: number },
  ): Promise<void> {
    if (this.redisService) {
      await this.redisService.set(
        this.badgeImageKey(token),
        record,
        this.config.badgeUploadTtlSeconds,
      );
      return;
    }
    this.pendingBadgeImages.set(token, record);
  }

  private async loadBadgeImage(token: string): Promise<StoredBadgeImage | null> {
    if (this.redisService) {
      const record = await this.redisService.get<StoredBadgeImage & { expiresAtMs: number }>(
        this.badgeImageKey(token),
      );
      if (!record || record.expiresAtMs < Date.now()) {
        await this.deleteBadgeImage(token);
        return null;
      }
      return record;
    }

    const record = this.pendingBadgeImages.get(token);
    if (!record || record.expiresAtMs < Date.now()) {
      this.pendingBadgeImages.delete(token);
      return null;
    }
    return record;
  }

  private async deleteBadgeImage(token: string): Promise<void> {
    if (this.redisService) {
      await this.redisService.del(this.badgeImageKey(token));
      return;
    }
    this.pendingBadgeImages.delete(token);
  }
}

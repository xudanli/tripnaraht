import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  listMbtiTypeCards,
  isValidMbtiType,
  MBTI_SELF_SELECT_HINT,
} from './config/mbti-type-cards.config';
import { PREMIUM_STRESS_QUESTIONS, resolvePremiumStressScenarioId } from './config/premium-stress-test.config';
import { resolveWallpaperUrl } from './config/wallpaper-assets.config';
import {
  buildProfileFromPremiumIntake,
  computeDimensionPercents,
  createEmptyRawScores,
  dimensionPercentsFromMbtiType,
  resolveIdentityCard,
  resolveMbtiType,
} from './engine/intake-scoring.engine';
import { buildOnboardingStatus, buildProfileCardView } from './util/card-ui-contract.util';
import type {
  OdysseyIntakeProfile,
  OptionId,
  PremiumOptionId,
  PremiumStressScenarioId,
  ScenarioId,
} from './types/odyssey-intake.types';
import type {
  OdysseyOnboardingStatus,
  OdysseyProfileCardView,
  OdysseyTrustVerification,
  OdysseyTripMeta,
} from './types/odyssey-intake-ext.types';
import type {
  VerifiedCredentialsBundle,
  VerifiedCredentialsView,
} from './types/verified-credentials.types';
import type {
  OdysseyAnswerDto,
  PremiumStressAnswerDto,
  SelectMbtiDto,
  SubmitPremiumIntakeDto,
  TrustVerifyDto,
  VerifyEducationCredentialDto,
  VerifyProfessionCredentialDto,
  SendProfessionEmailCodeDto,
  VerifyProfessionEmailDto,
  VerifyProfessionOAuthDto,
  VerifyProfessionBadgeDto,
  UploadProfessionBadgeDto,
  UpdateTripIntentInput,
  UpdateTripMetaDto,
} from './dto/odyssey-intake.dto';
import { normalizeTripIntentInput } from './util/trip-intent-normalize.util';
import {
  buildVerifiedCredentialsView,
  normalizeEducationCredential,
  normalizeProfessionCredential,
  parseVerifiedCredentialsBundle,
} from './util/verified-credentials.util';
import { CredentialVerificationGateway } from './gateway/credential-verification.gateway';
import type { ProfessionVerificationResult } from './gateway/credential-gateway.types';

const REQUIRED_PREMIUM_SCENARIOS: PremiumStressScenarioId[] = [
  'resource_scarcity_replan',
  'convoy_division_collaboration',
  'premium_upcharge_decision',
];

const LEGACY_INTAKE_DEPRECATED =
  'v1 五题测评已下线。请走高端入网流程：POST /mbti/select → 硬核背书 → POST /premium-stress-test/submit';

@Injectable()
export class OdysseyIntakeService {
  private readonly logger = new Logger(OdysseyIntakeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentialGateway: CredentialVerificationGateway,
  ) {}

  getMbtiTypeCards() {
    return {
      hint: MBTI_SELF_SELECT_HINT,
      intakeVersion: 2 as const,
      types: listMbtiTypeCards(),
    };
  }

  getPremiumStressQuestions() {
    return PREMIUM_STRESS_QUESTIONS.sort((a, b) => a.order - b.order).map((q) => ({
      ...q,
      wallpaper: resolveWallpaperUrl(q.wallpaperKey),
    }));
  }

  /** @deprecated 返回 Premium Stress Test 题库；旧 5 题已下线 */
  getQuestions() {
    return {
      deprecated: true,
      message: LEGACY_INTAKE_DEPRECATED,
      intakeVersion: 2 as const,
      questions: this.getPremiumStressQuestions(),
    };
  }

  async getOnboardingStatus(userId: string): Promise<OdysseyOnboardingStatus> {
    const ext = await this.readExtendedProfile(userId);
    const profile = (ext?.odyssey_intake as OdysseyIntakeProfile | undefined) ?? null;
    const trust = (ext?.odyssey_trust as OdysseyTrustVerification | undefined) ?? null;
    const credentials = parseVerifiedCredentialsBundle(ext?.verified_credentials);
    return buildOnboardingStatus(profile, trust, credentials);
  }

  async getProfileCardView(userId: string): Promise<OdysseyProfileCardView> {
    const ext = await this.readExtendedProfile(userId);
    return buildProfileCardView({
      profile: (ext?.odyssey_intake as OdysseyIntakeProfile | undefined) ?? null,
      tripMeta: (ext?.odyssey_trip_meta as OdysseyTripMeta | undefined) ?? null,
      trust: (ext?.odyssey_trust as OdysseyTrustVerification | undefined) ?? null,
    });
  }

  async selectMbti(userId: string, dto: SelectMbtiDto): Promise<OdysseyIntakeProfile> {
    const mbtiType = dto.mbtiType.trim().toUpperCase();
    if (!isValidMbtiType(mbtiType)) {
      throw new BadRequestException('无效的 MBTI 类型，请从 16 型中选择');
    }

    const existing = await this.getProfile(userId);
    const upgradingFromV1 = existing?.version === 1 && Boolean(existing.completedAt);

    const dimensionPercents = dimensionPercentsFromMbtiType(mbtiType);
    const rawScores = existing?.rawScores ?? createEmptyRawScores();
    const card = resolveIdentityCard(rawScores, dimensionPercents, mbtiType);

    const profile: OdysseyIntakeProfile = {
      version: 2,
      completedAt: existing?.completedAt ?? '',
      mbtiType,
      mbtiSource: 'self_selected',
      mbtiSelectedAt: new Date().toISOString(),
      rawScores,
      dimensionPercents,
      card,
      premiumStressAnswers: existing?.premiumStressAnswers,
      travelCollaborationGene: existing?.travelCollaborationGene,
      travelCollaborationGeneLabel: existing?.travelCollaborationGeneLabel,
      tripIntentTags: existing?.tripIntentTags,
      profileRefreshPending: false,
    };

    if (!profile.premiumStressAnswers || Object.keys(profile.premiumStressAnswers).length < 3) {
      profile.completedAt = '';
    }

    await this.mergeExtendedProfile(userId, { odyssey_intake: profile });
    this.logger.log(
      `[OdysseyIntake] user=${userId} mbti_selected=${mbtiType}${upgradingFromV1 ? ' v1_to_v2_upgrade' : ''}`,
    );
    return profile;
  }

  async submitPremiumStressTest(
    userId: string,
    dto: SubmitPremiumIntakeDto,
  ): Promise<OdysseyIntakeProfile> {
    return this.completePremiumIntake(userId, dto);
  }

  async submitPremiumIntake(
    userId: string,
    dto: SubmitPremiumIntakeDto,
  ): Promise<OdysseyIntakeProfile> {
    return this.completePremiumIntake(userId, dto);
  }

  /** @deprecated v1 五题测评 */
  async submitIntake(userId: string, _answers: OdysseyAnswerDto[]): Promise<OdysseyIntakeProfile> {
    void userId;
    void _answers;
    throw new BadRequestException(LEGACY_INTAKE_DEPRECATED);
  }

  /** PRD 高端流程：MBTI 自选 + Premium Stress Test → 名片 */
  private async completePremiumIntake(
    userId: string,
    dto: SubmitPremiumIntakeDto,
  ): Promise<OdysseyIntakeProfile> {
    const existing = await this.getProfile(userId);
    const mbtiType = (dto.mbtiType ?? existing?.mbtiType)?.trim().toUpperCase();

    if (!mbtiType || !isValidMbtiType(mbtiType)) {
      throw new BadRequestException('请先通过 POST /mbti/select 点亮 MBTI，或在请求体中提供 mbtiType');
    }

    const upgradingFromV1 = existing?.version === 1 && Boolean(existing.completedAt);

    const answerMap = this.validateAndNormalizePremiumAnswers(dto.answers);
    const built = buildProfileFromPremiumIntake(mbtiType, answerMap);

    const profile: OdysseyIntakeProfile = {
      version: 2,
      completedAt: new Date().toISOString(),
      mbtiType: built.mbtiType,
      mbtiSource: 'self_selected',
      mbtiSelectedAt: existing?.mbtiSelectedAt ?? new Date().toISOString(),
      premiumStressAnswers: answerMap,
      rawScores: built.rawScores,
      dimensionPercents: built.dimensionPercents,
      card: built.card,
      travelCollaborationGene: built.travelCollaborationGene,
      travelCollaborationGeneLabel: built.travelCollaborationGeneLabel,
      tripIntentTags: existing?.tripIntentTags,
      profileRefreshPending: false,
    };

    await this.mergeExtendedProfile(userId, { odyssey_intake: profile });
    this.logger.log(
      `[OdysseyIntake] user=${userId} premium_intake mbti=${profile.mbtiType} gene=${profile.travelCollaborationGene} title=${profile.card.title}${upgradingFromV1 ? ' v1_to_v2_upgrade' : ''}`,
    );

    return profile;
  }

  /** @deprecated 旅伴匹配已下线；等价于 completePremiumIntake + onboarding 状态 */
  async submitAndMatch(
    userId: string,
    params: {
      mbtiType?: string;
      answers: PremiumStressAnswerDto[];
      tripMeta?: UpdateTripMetaDto;
      matchLimit?: number;
    },
  ) {
    void params.matchLimit;
    const profile = await this.completePremiumIntake(userId, {
      mbtiType: params.mbtiType,
      answers: params.answers,
    });

    if (params.tripMeta) {
      await this.updateTripMeta(userId, params.tripMeta);
    }

    const onboarding = await this.getOnboardingStatus(userId);

    return {
      profile,
      card: profile.card,
      onboarding,
      matches: [],
      meta: { elapsedMs: 0, candidatePoolSize: 0, skippedReason: 'companion_matching_removed' as const },
    };
  }

  async getProfile(userId: string): Promise<OdysseyIntakeProfile | null> {
    const ext = await this.readExtendedProfile(userId);
    return (ext?.odyssey_intake as OdysseyIntakeProfile | undefined) ?? null;
  }

  async updateTripMeta(userId: string, dto: UpdateTripMetaDto): Promise<OdysseyTripMeta> {
    if (dto.endDate < dto.startDate) {
      throw new BadRequestException('endDate 不能早于 startDate');
    }

    const tripMeta: OdysseyTripMeta = {
      destination: dto.destination.trim(),
      startDate: dto.startDate,
      endDate: dto.endDate,
      updatedAt: new Date().toISOString(),
    };

    await this.mergeExtendedProfile(userId, { odyssey_trip_meta: tripMeta });
    return tripMeta;
  }

  async getTripMeta(userId: string): Promise<OdysseyTripMeta | null> {
    const ext = await this.readExtendedProfile(userId);
    return (ext?.odyssey_trip_meta as OdysseyTripMeta | undefined) ?? null;
  }

  /**
   * 实名 / 芝麻信用授权（生产环境应对接第三方网关校验 authToken）。
   * 当前为契约占位：非空 token 即视为通过。
   */
  async verifyTrust(userId: string, dto: TrustVerifyDto): Promise<OdysseyTrustVerification> {
    if (!dto.authToken?.trim()) {
      throw new BadRequestException('authToken 不能为空');
    }

    const score = dto.creditScore ?? (dto.provider === 'zhima_credit' ? 750 : undefined);
    const trust: OdysseyTrustVerification = {
      verified: true,
      provider: dto.provider,
      verifiedAt: new Date().toISOString(),
      displayName: dto.provider === 'real_name_id' ? '已实名用户' : undefined,
      creditScore: score,
      creditScoreTier:
        score != null && score >= 780
          ? 'excellent'
          : score != null && score >= 650
            ? 'good'
            : dto.provider === 'zhima_credit'
              ? 'good'
              : undefined,
      creditScoreLabel:
        score != null && score >= 780
          ? '极佳'
          : score != null && score >= 650
            ? '良好'
            : dto.provider === 'zhima_credit'
              ? '良好'
              : undefined,
    };

    await this.mergeExtendedProfile(userId, { odyssey_trust: trust });
    this.logger.log(`[OdysseyIntake] trust verified user=${userId} provider=${dto.provider}`);
    return trust;
  }

  async getTrustVerification(userId: string): Promise<OdysseyTrustVerification | null> {
    const ext = await this.readExtendedProfile(userId);
    return (ext?.odyssey_trust as OdysseyTrustVerification | undefined) ?? null;
  }

  async getVerifiedCredentialsBundle(userId: string): Promise<VerifiedCredentialsBundle | null> {
    const ext = await this.readExtendedProfile(userId);
    return parseVerifiedCredentialsBundle(ext?.verified_credentials);
  }

  async getVerifiedCredentialsView(
    userId: string,
    options?: { teamworkStyleCapsule?: string | null; reputationStars?: number | null; safetyNote?: string | null },
  ): Promise<VerifiedCredentialsView> {
    const trust = await this.getTrustVerification(userId);
    const credentials = await this.getVerifiedCredentialsBundle(userId);
    return buildVerifiedCredentialsView({
      trust,
      credentials,
      reputationStars: options?.reputationStars ?? null,
      safetyNote: options?.safetyNote ?? null,
      teamworkStyleCapsule: options?.teamworkStyleCapsule ?? null,
    });
  }

  getCredentialGatewayStatus() {
    return this.credentialGateway.getGatewayStatus();
  }

  async verifyEducationCredential(
    userId: string,
    dto: VerifyEducationCredentialDto,
  ): Promise<VerifiedCredentialsBundle> {
    const verificationCode =
      dto.verificationCode?.trim() ||
      dto.verification_code?.trim() ||
      dto.authToken?.trim();

    if (!verificationCode) {
      throw new BadRequestException('学信网在线验证码不能为空');
    }

    const resolved = await this.credentialGateway.verifyXuexinOnlineCode(verificationCode);
    const existing = (await this.getVerifiedCredentialsBundle(userId)) ?? {};
    const education = normalizeEducationCredential(resolved);

    const bundle: VerifiedCredentialsBundle = {
      ...existing,
      education,
      updatedAt: new Date().toISOString(),
    };

    await this.mergeExtendedProfile(userId, { verified_credentials: bundle });
    this.logger.log(`[OdysseyIntake] education verified user=${userId} tier=${education.tierTag}`);
    return bundle;
  }

  async sendProfessionEmailVerificationCode(
    userId: string,
    dto: SendProfessionEmailCodeDto,
  ): Promise<{ expiresInSeconds: number; devCode?: string }> {
    const workEmail = (dto.workEmail ?? dto.work_email ?? '').trim();
    if (!workEmail) {
      throw new BadRequestException('workEmail 不能为空');
    }

    const result = await this.credentialGateway.sendWorkEmailVerificationCode(workEmail);
    this.logger.log(`[OdysseyIntake] profession email code sent user=${userId}`);
    return result;
  }

  async verifyProfessionEmailCredential(
    userId: string,
    dto: VerifyProfessionEmailDto,
  ): Promise<VerifiedCredentialsBundle> {
    const workEmail = (dto.workEmail ?? dto.work_email ?? '').trim();
    const verificationCode = (dto.verificationCode ?? dto.verification_code ?? '').trim();

    if (!workEmail || !verificationCode) {
      throw new BadRequestException('workEmail 与 verificationCode 不能为空');
    }

    const resolved = await this.credentialGateway.verifyWorkEmailCode(workEmail, verificationCode);
    return this.persistProfessionCredential(userId, resolved);
  }

  async verifyProfessionOAuthCredential(
    userId: string,
    dto: VerifyProfessionOAuthDto,
  ): Promise<VerifiedCredentialsBundle> {
    const resolved = await this.credentialGateway.verifyProfessionOAuth(dto.provider, dto.authToken);
    return this.persistProfessionCredential(userId, resolved);
  }

  async uploadProfessionBadgeImage(
    userId: string,
    dto: UploadProfessionBadgeDto,
  ): Promise<{ imageToken: string; expiresInSeconds: number }> {
    const imageBase64 = (dto.imageBase64 ?? dto.image_base64 ?? '').trim();
    const mimeType = dto.mimeType ?? dto.mime_type ?? 'image/jpeg';
    if (!imageBase64) {
      throw new BadRequestException('imageBase64 不能为空');
    }

    return this.credentialGateway.uploadProfessionBadgeImage(userId, imageBase64, mimeType);
  }

  async verifyProfessionBadgeCredential(
    userId: string,
    dto: VerifyProfessionBadgeDto,
  ): Promise<VerifiedCredentialsBundle> {
    const imageToken = (dto.imageToken ?? dto.image_token ?? '').trim();
    if (!imageToken) {
      throw new BadRequestException('imageToken 不能为空');
    }

    const resolved = await this.credentialGateway.verifyProfessionBadgeOcr(userId, imageToken);
    return this.persistProfessionCredential(userId, resolved);
  }

  /** @deprecated PRD 3.1.3 — 禁止用户自选职位标签 */
  async verifyProfessionCredential(
    userId: string,
    _dto: VerifyProfessionCredentialDto,
  ): Promise<VerifiedCredentialsBundle> {
    throw new BadRequestException(
      '已停用自选职业背书。请使用企业邮箱验证、工牌 OCR 或职场平台 OAuth 通道（PRD 3.1.3）',
    );
  }

  private async persistProfessionCredential(
    userId: string,
    resolved: ProfessionVerificationResult,
  ): Promise<VerifiedCredentialsBundle> {
    const existing = (await this.getVerifiedCredentialsBundle(userId)) ?? {};
    const profession = normalizeProfessionCredential({
      channel: resolved.channel,
      industryTag: resolved.industryTag,
      companyTierTag: resolved.companyTierTag,
      roleLevelTag: resolved.roleLevelTag,
    });

    const bundle: VerifiedCredentialsBundle = {
      ...existing,
      profession,
      updatedAt: new Date().toISOString(),
    };

    await this.mergeExtendedProfile(userId, { verified_credentials: bundle });
    this.logger.log(
      `[OdysseyIntake] profession verified user=${userId} channel=${resolved.channel}`,
    );
    return bundle;
  }

  async updateTripIntent(userId: string, dto: UpdateTripIntentInput): Promise<OdysseyProfileCardView> {
    const tags = normalizeTripIntentInput(dto);
    const existing = await this.getProfile(userId);
    if (!existing) {
      throw new NotFoundException('尚未完成旅行人格测评，请先完成 Odyssey Intake');
    }

    const updated: OdysseyIntakeProfile = {
      ...existing,
      tripIntentTags: tags,
    };
    await this.mergeExtendedProfile(userId, { odyssey_intake: updated });
    return this.getProfileCardView(userId);
  }

  /** @deprecated 使用 updateTripIntent */
  async updateTripIntentTags(userId: string, tags: string[]): Promise<OdysseyProfileCardView> {
    return this.updateTripIntent(userId, { tripIntentTags: tags });
  }

  async acknowledgeProfileRefresh(userId: string): Promise<OdysseyIntakeProfile> {
    const existing = await this.getProfile(userId);
    if (!existing) {
      throw new NotFoundException('尚未完成旅行人格测评');
    }
    const updated: OdysseyIntakeProfile = {
      ...existing,
      profileRefreshPending: false,
      profileRefreshMessage: undefined,
    };
    await this.mergeExtendedProfile(userId, { odyssey_intake: updated });
    return updated;
  }

  /** Reputation OS 等子系统回写画像（不重新计分测评） */
  async persistIntakeProfile(userId: string, profile: OdysseyIntakeProfile): Promise<OdysseyIntakeProfile> {
    await this.mergeExtendedProfile(userId, { odyssey_intake: profile });
    return profile;
  }

  private validateAndNormalizePremiumAnswers(
    answers: PremiumStressAnswerDto[],
  ): Partial<Record<PremiumStressScenarioId, PremiumOptionId>> {
    const map: Partial<Record<PremiumStressScenarioId, PremiumOptionId>> = {};

    for (const a of answers) {
      const scenarioId = resolvePremiumStressScenarioId(a.scenarioId);
      if (!scenarioId) {
        throw new BadRequestException(`无效的场景 ID: ${a.scenarioId}`);
      }
      map[scenarioId] = a.optionId;
    }

    const missing = REQUIRED_PREMIUM_SCENARIOS.filter((id) => !map[id]);
    if (missing.length > 0) {
      throw new BadRequestException(`缺少 Premium Stress Test 答案: ${missing.join(', ')}`);
    }

    return map;
  }

  /** @deprecated v1 校验，仅测试/迁移保留 */
  private validateAndNormalizeAnswers(
    answers: OdysseyAnswerDto[],
  ): Partial<Record<ScenarioId, OptionId>> {
    const map: Partial<Record<ScenarioId, OptionId>> = {};
    const legacyScenarios: ScenarioId[] = [
      'budget_financial_tolerance',
      'ambiguity_tolerance',
      'energy_pace',
      'social_recharge',
      'aesthetic_meaning',
    ];

    for (const a of answers) {
      if (!legacyScenarios.includes(a.scenarioId)) {
        throw new BadRequestException(`无效的场景 ID: ${a.scenarioId}`);
      }
      map[a.scenarioId] = a.optionId;
    }

    const missing = legacyScenarios.filter((id) => !map[id]);
    if (missing.length > 0) {
      throw new BadRequestException(`缺少场景答案: ${missing.join(', ')}`);
    }

    return map;
  }

  private async readExtendedProfile(userId: string): Promise<Record<string, unknown> | null> {
    const row = await this.prisma.userTravelProfile.findUnique({
      where: { userId },
      select: { extendedProfile: true },
    });
    return (row?.extendedProfile as Record<string, unknown> | null) ?? null;
  }

  private async mergeExtendedProfile(
    userId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const existing = await this.readExtendedProfile(userId);
    const extendedProfile = {
      ...(existing ?? {}),
      ...patch,
    } as unknown as Prisma.InputJsonValue;

    await this.prisma.userTravelProfile.upsert({
      where: { userId },
      update: {
        extendedProfile,
        source: patch.odyssey_intake ? 'explicit' : undefined,
        confidence: patch.odyssey_intake ? 0.85 : undefined,
      },
      create: {
        userId,
        preferredRouteTypes: [],
        extendedProfile,
        source: 'explicit',
        confidence: patch.odyssey_intake ? 0.85 : 0.5,
      },
    });
  }
}

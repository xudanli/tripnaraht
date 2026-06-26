import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type OnboardingStatus = {
  quizComplete: boolean;
  cardReady: boolean;
  canMatch: boolean;
  nextStep?: 'quiz' | 'view_card' | 'match';
};

type OdysseyCard = {
  mbtiType: string;
  title: string;
  subtitle: string;
  theme: {
    quadrant: 'NT' | 'NF' | 'SP' | 'SJ';
    gradientFrom: string;
    gradientTo: string;
    accentColor?: string;
  };
  radar: Record<string, number>;
};

const MBTI_QUADRANT: Record<string, 'NT' | 'NF' | 'SP' | 'SJ'> = {
  INTJ: 'NT',
  INTP: 'NT',
  ENTJ: 'NT',
  ENTP: 'NT',
  INFP: 'NF',
  INFJ: 'NF',
  ENFP: 'NF',
  ENFJ: 'NF',
  ISTP: 'SP',
  ISFP: 'SP',
  ESTP: 'SP',
  ESFP: 'SP',
  ISTJ: 'SJ',
  ISFJ: 'SJ',
  ESTJ: 'SJ',
  ESFJ: 'SJ',
};

const THEME_BY_QUADRANT: Record<'NT' | 'NF' | 'SP' | 'SJ', OdysseyCard['theme']> = {
  NT: {
    quadrant: 'NT',
    gradientFrom: '#0f766e',
    gradientTo: '#1d4ed8',
    accentColor: '#14b8a6',
  },
  NF: {
    quadrant: 'NF',
    gradientFrom: '#7c3aed',
    gradientTo: '#db2777',
    accentColor: '#a855f7',
  },
  SP: {
    quadrant: 'SP',
    gradientFrom: '#ea580c',
    gradientTo: '#059669',
    accentColor: '#f97316',
  },
  SJ: {
    quadrant: 'SJ',
    gradientFrom: '#334155',
    gradientTo: '#0f766e',
    accentColor: '#64748b',
  },
};

@Injectable()
export class OdysseyIntakeService {
  constructor(private readonly prisma: PrismaService) {}

  async getOnboardingStatus(userId?: string): Promise<OnboardingStatus> {
    const prefs = await this.loadPreferences(userId);
    return this.buildOnboardingStatus(prefs);
  }

  async getProfileCard(userId?: string) {
    const prefs = await this.loadPreferences(userId);
    const status = this.buildOnboardingStatus(prefs);
    const card = this.readCard(prefs);

    return {
      completed: status.quizComplete && Boolean(card),
      profile: card
        ? {
            mbtiType: card.mbtiType,
            card,
            tripIntentTags: this.readStringArray(prefs?.odyssey?.tripIntentTags),
            profileRefreshPending: false,
          }
        : null,
      tripMeta: null,
      ui: this.buildProfileCardUi(),
    };
  }

  async submit(userId: string | undefined, payload: unknown) {
    const body = this.asRecord(payload);
    const mbtiType = this.normalizeMbti(body.mbtiType);
    const card = this.buildCard(mbtiType);
    const now = new Date().toISOString();
    const status: OnboardingStatus = {
      quizComplete: true,
      cardReady: true,
      canMatch: true,
      nextStep: 'match',
    };

    if (userId) {
      const prefs = await this.loadPreferences(userId);
      await this.savePreferences(userId, {
        ...prefs,
        odysseyIntakeComplete: true,
        quizComplete: true,
        mbtiType,
        cardTitle: card.title,
        interactionMode: prefs?.interactionMode ?? 'easy_companion',
        odyssey: {
          ...(this.asRecord(prefs?.odyssey)),
          completed: 'true',
          completedAt: now,
          mbtiType,
          cardTitle: card.title,
          interactionMode: prefs?.interactionMode ?? 'easy_companion',
          intakeVersion: body.intakeVersion ?? 'premium_v2',
        },
        odysseyIntake: {
          ...(this.asRecord(prefs?.odysseyIntake)),
          completedAt: now,
          mbtiType,
          cardTitle: card.title,
          card,
          premiumStressAnswers: body.answers ?? [],
        },
      });
    }

    return {
      mbtiType,
      card,
      onboarding: status,
    };
  }

  getPremiumStressTestQuestions() {
    return {
      questions: [
        {
          id: 'stress_route_change',
          order: 1,
          title: '临时改线',
          scenario: '冰岛山路因天气关闭，团队需要在 10 分钟内决定是否绕路。',
          wallpaperKey: 'iceland-road-weather',
          wallpaperGradient: 'linear-gradient(135deg,#0f766e,#1d4ed8)',
          options: [
            { id: 'A', label: '先重算风险和时间，再给出明确方案', tag: 'planner' },
            { id: 'B', label: '先安抚队友，再一起选可接受替代路线', tag: 'cohesion' },
          ],
        },
        {
          id: 'stress_budget_split',
          order: 2,
          title: '预算分歧',
          scenario: '住宿升级会明显更舒适，但超出部分需要大家分摊。',
          wallpaperKey: 'shared-budget',
          wallpaperGradient: 'linear-gradient(135deg,#334155,#0f766e)',
          options: [
            { id: 'A', label: '把差价、收益和退出选项列清楚', tag: 'transparent' },
            { id: 'B', label: '优先寻找不伤害团队氛围的折中方案', tag: 'harmony' },
          ],
        },
      ],
    };
  }

  getQuestions() {
    return {
      questions: [
        {
          id: 'legacy_trip_conflict',
          order: 1,
          title: '旅途中出现分歧',
          scenario: '队友想放慢节奏，你更想完成原计划。',
          wallpaperKey: 'legacy-plaza',
          wallpaper: { key: 'legacy-plaza', url: '' },
          options: [
            { id: 'A', label: '坚持原计划' },
            { id: 'B', label: '一起调整' },
            { id: 'C', label: '分头行动' },
          ],
        },
      ],
    };
  }

  async updateTripIntent(userId: string | undefined, payload: unknown) {
    const tag = this.asRecord(payload).tripIntentTag;
    const tripIntentTag = typeof tag === 'string' && tag.trim() ? tag.trim() : 'open_to_match';
    if (userId) {
      const prefs = await this.loadPreferences(userId);
      await this.savePreferences(userId, {
        ...prefs,
        odyssey: {
          ...(this.asRecord(prefs?.odyssey)),
          tripIntentTags: [tripIntentTag],
        },
      });
    }
    return this.getProfileCard(userId);
  }

  private async loadPreferences(userId?: string): Promise<Record<string, any>> {
    if (!userId) return {};
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { preferences: true },
    });
    return this.asRecord(profile?.preferences);
  }

  private async savePreferences(userId: string, preferences: Record<string, any>) {
    const now = new Date();
    await this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        preferences: preferences as Prisma.InputJsonValue,
        updatedAt: now,
      },
      update: {
        preferences: preferences as Prisma.InputJsonValue,
        updatedAt: now,
      },
    });
  }

  private buildOnboardingStatus(prefs: Record<string, any>): OnboardingStatus {
    const quizComplete = Boolean(
      prefs.odysseyIntakeComplete ||
        prefs.quizComplete ||
        prefs.odyssey?.completed === true ||
        prefs.odyssey?.completed === 'true' ||
        prefs.odysseyIntake?.mbtiType,
    );
    return {
      quizComplete,
      cardReady: quizComplete,
      canMatch: quizComplete,
      nextStep: quizComplete ? 'match' : 'quiz',
    };
  }

  private readCard(prefs: Record<string, any>): OdysseyCard | null {
    const stored = prefs.odysseyIntake?.card;
    if (stored && typeof stored === 'object') return stored as OdysseyCard;
    if (!this.buildOnboardingStatus(prefs).quizComplete) return null;
    return this.buildCard(this.normalizeMbti(prefs.odyssey?.mbtiType ?? prefs.mbtiType));
  }

  private buildCard(mbtiType: string): OdysseyCard {
    const quadrant = MBTI_QUADRANT[mbtiType] ?? 'NF';
    const title = this.titleForMbti(mbtiType);
    return {
      mbtiType,
      title,
      subtitle: `${quadrant} 型旅行协作人格`,
      theme: THEME_BY_QUADRANT[quadrant],
      radar: {
        planning: quadrant === 'NT' || quadrant === 'SJ' ? 86 : 72,
        adaptability: quadrant === 'SP' || quadrant === 'NF' ? 86 : 70,
        communication: quadrant === 'NF' ? 88 : 74,
        riskAwareness: quadrant === 'SJ' || quadrant === 'NT' ? 84 : 70,
      },
    };
  }

  private titleForMbti(mbtiType: string): string {
    const map: Record<string, string> = {
      INTJ: '路线战略家',
      INTP: '系统探索者',
      ENTJ: '远征组织者',
      ENTP: '灵感开路者',
      INFJ: '深度同行者',
      INFP: '意义采集者',
      ENFJ: '团队联结者',
      ENFP: '氛围点燃者',
      ISTJ: '秩序守护者',
      ISFJ: '细节照料者',
      ESTJ: '执行队长',
      ESFJ: '共识维护者',
      ISTP: '现场解法师',
      ISFP: '审美漫游者',
      ESTP: '行动派玩家',
      ESFP: '体验召集人',
    };
    return map[mbtiType] ?? '旅行者';
  }

  private normalizeMbti(value: unknown): string {
    const mbti = typeof value === 'string' ? value.trim().toUpperCase() : '';
    return /^[EI][NS][TF][JP]$/.test(mbti) ? mbti : 'INFJ';
  }

  private buildProfileCardUi() {
    return {
      placement: 'profile_header_third',
      showShimmerRefresh: false,
      gyroscopeEnabled: true,
      cta: { label: '更新出行意向', action: 'trip_intent' },
      tripIntentTagOptions: [
        { id: 'open_to_match', label: '开放匹配' },
        { id: 'need_planner', label: '需要规划型搭子' },
        { id: 'need_driver', label: '需要自驾搭子' },
      ],
    };
  }

  private asRecord(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, any>)
      : {};
  }

  private readStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }
}

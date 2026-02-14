import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
export declare class ReadinessFeatureFlagsService implements OnModuleInit {
    private readonly prisma;
    private readonly configService;
    private readonly redisService?;
    private readonly logger;
    private readonly featureFlagCache;
    private readonly CACHE_TTL_MS;
    constructor(prisma: PrismaService, configService: ConfigService, redisService?: RedisService);
    onModuleInit(): Promise<void>;
    isAIEnhancementEnabled(userId?: string, feature?: string): Promise<boolean>;
    private getGlobalFeatureFlag;
    private getUserFeatureFlag;
    updateUserFeatureFlag(userId: string, feature: string, enabled: boolean): Promise<void>;
    updateGlobalFeatureFlag(feature: string, enabled: boolean): Promise<void>;
    getABTestGroup(userId: string, experimentId: string): Promise<'control' | 'treatment' | null>;
    private hashUserId;
}

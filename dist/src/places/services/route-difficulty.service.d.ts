import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RouteDifficultyRequestDto, RouteDifficultyResponseDto } from '../dto/route-difficulty.dto';
export declare class RouteDifficultyService {
    private prisma;
    private configService?;
    private readonly logger;
    private readonly cache;
    private readonly cacheTTL;
    private readonly pythonScriptPath;
    constructor(prisma: PrismaService, configService?: ConfigService);
    private parseDistanceString;
    private parseElevationGainString;
    private calculateFromPlaceData;
    private estimateDifficultyFromData;
    calculateDifficulty(request: RouteDifficultyRequestDto): Promise<RouteDifficultyResponseDto>;
    private callPythonScript;
    private buildPythonArgs;
    private mapToResponseDto;
    private generateCacheKey;
    private cleanExpiredCache;
    private validateApiKeys;
}

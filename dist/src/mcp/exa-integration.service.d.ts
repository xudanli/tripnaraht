import { ExaService } from './exa.service';
import { RedisService } from '../redis/redis.service';
import { ExaMonitoringService } from './exa-monitoring.service';
export interface RealTimeRiskInfo {
    hasRisk: boolean;
    riskType?: 'ROAD_CLOSED' | 'WEATHER' | 'GEOLOGICAL' | 'POLITICAL' | 'TRANSPORT';
    riskDescription?: string;
    source?: string;
    confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
}
export interface RealTimeDestinationInfo {
    isOpen: boolean;
    status?: string;
    alternatives?: string[];
    source?: string;
}
export declare class ExaIntegrationService {
    private readonly exaService?;
    private readonly redisService?;
    private readonly monitoring?;
    private readonly logger;
    constructor(exaService?: ExaService, redisService?: RedisService, monitoring?: ExaMonitoringService);
    searchRealTimeRisks(countryCode: string, routeName: string, month: number, year?: number): Promise<RealTimeRiskInfo>;
    searchDestinationStatus(destination: string, category: string, month: number, year?: number): Promise<RealTimeDestinationInfo>;
    private buildRiskSearchQuery;
    private parseRiskSearchResult;
    private extractRiskDescription;
    searchDeepRisks(countryCode: string, routeName: string, month: number, year?: number): Promise<RealTimeRiskInfo>;
    searchAlternativeDestinations(destination: string, category: string, month: number, year?: number): Promise<{
        alternatives: Array<{
            name: string;
            description?: string;
            reason?: string;
        }>;
    }>;
    crawlOfficialPage(url: string, purpose?: string): Promise<{
        content: string;
        success: boolean;
    }>;
    startDeepResearch(topic: string, reportType?: string): Promise<{
        researchId: string;
        status: 'started' | 'failed';
    }>;
    checkDeepResearch(researchId: string): Promise<{
        status: 'completed' | 'in_progress' | 'failed';
        report?: string;
    }>;
    private parseAlternativesResult;
    private parseDestinationStatusResult;
}

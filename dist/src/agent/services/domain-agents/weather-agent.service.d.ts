import { WeatherAgent, GeoPoint, EvidenceRef, DataQuality } from '../../interfaces/sub-agent.interface';
import { DataSourceRouterService } from '../../../data-contracts/services/data-source-router.service';
export declare class WeatherAgentService implements WeatherAgent {
    private readonly dataRouter?;
    private readonly logger;
    constructor(dataRouter?: DataSourceRouterService);
    getForecast(location: GeoPoint, dateRange: {
        start: string;
        end: string;
    }): Promise<{
        forecasts: Array<{
            date: string;
            temperature: {
                min: number;
                max: number;
            };
            precipitation: {
                probability: number;
                type: string;
                amount_mm: number;
            };
            wind: {
                speed_kmh: number;
                gust_kmh: number;
                direction: string;
            };
            visibility_km: number;
            travel_suitability: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'DANGEROUS';
        }>;
        overall_confidence: number;
        data_freshness: {
            last_update: string;
            reliability: number;
        };
        evidence: EvidenceRef[];
        data_quality: DataQuality;
    }>;
    assessRoadClosureProbability(route: GeoPoint[], date: string): Promise<{
        overall_closure_probability: number;
        risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        closure_factors: Array<{
            factor: 'SNOW' | 'ICE' | 'FLOODING' | 'WIND' | 'VISIBILITY' | 'OTHER';
            probability: number;
            impact: string;
        }>;
        evidence: EvidenceRef[];
        data_quality: DataQuality;
    }>;
    quantifyWeatherRisk(location: GeoPoint, date: string, activityType: 'DRIVING' | 'HIKING' | 'SIGHTSEEING' | 'OUTDOOR_ACTIVITY'): Promise<{
        risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        risk_score: number;
        risk_factors: Array<{
            type: string;
            severity: 'LOW' | 'MEDIUM' | 'HIGH';
            description: string;
            mitigation: string;
        }>;
        what_you_pay_for: string;
        evidence: EvidenceRef[];
        data_quality: DataQuality;
    }>;
    private degreeToDirection;
    private assessTravelSuitabilityFromData;
    private createDataQuality;
}

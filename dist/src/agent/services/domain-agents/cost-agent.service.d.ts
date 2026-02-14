import { CostAgent, EvidenceRef, DataQuality } from '../../interfaces/sub-agent.interface';
import { PrismaService } from '../../../prisma/prisma.service';
export declare class CostAgentService implements CostAgent {
    private readonly prisma;
    private readonly logger;
    private readonly basePrices;
    constructor(prisma: PrismaService);
    estimateTripCost(destination: string, dateRange: {
        start: string;
        end: string;
    }, travelers: number, preferences?: {
        accommodation_level?: 'BUDGET' | 'MID_RANGE' | 'LUXURY';
        dining_level?: 'BUDGET' | 'MID_RANGE' | 'FINE_DINING';
    }): Promise<{
        total_estimate: {
            optimistic: number;
            expected: number;
            pessimistic: number;
            currency: string;
        };
        breakdown: {
            accommodation: number;
            transport: number;
            activities: number;
            dining: number;
            other: number;
        };
        confidence: number;
        evidence: EvidenceRef[];
        data_quality: DataQuality;
    }>;
    analyzePriceCurve(service: 'FLIGHT' | 'HOTEL' | 'CAR_RENTAL', destination: string, dateRange: {
        start: string;
        end: string;
    }): Promise<{
        price_trend: Array<{
            date: string;
            price: number;
        }>;
        peak_periods: Array<{
            start: string;
            end: string;
            multiplier: number;
        }>;
        optimal_booking_window: {
            start: string;
            end: string;
        };
        expected_saving_percent: number;
        evidence: EvidenceRef[];
        data_quality: DataQuality;
    }>;
    optimizeBudget(totalBudget: number, requirements: {
        destination: string;
        days: number;
        travelers: number;
        must_haves?: string[];
    }): Promise<{
        recommended_allocation: {
            accommodation: {
                amount: number;
                percentage: number;
            };
            transport: {
                amount: number;
                percentage: number;
            };
            activities: {
                amount: number;
                percentage: number;
            };
            dining: {
                amount: number;
                percentage: number;
            };
            buffer: {
                amount: number;
                percentage: number;
            };
        };
        feasibility: 'COMFORTABLE' | 'TIGHT' | 'INSUFFICIENT';
        saving_opportunities: Array<{
            category: string;
            suggestion: string;
            potential_saving: number;
            tradeoff: string;
        }>;
        evidence: EvidenceRef[];
        data_quality: DataQuality;
    }>;
    private extractCountryCode;
    private getSeasonMultiplier;
    private createDataQuality;
}

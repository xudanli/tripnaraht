import { PrismaService } from '../../prisma/prisma.service';
import { FlightPricePredictionRequest, FlightPricePredictionResponse } from '../interfaces/price-prediction.interface';
import { ProphetService } from './prophet-service';
export declare class PricePredictionService {
    private prisma;
    private prophetService;
    private readonly logger;
    constructor(prisma: PrismaService, prophetService: ProphetService);
    predictFlightPrice(request: FlightPricePredictionRequest): Promise<FlightPricePredictionResponse>;
    private getCurrentFlightPrice;
    private getRealtimeFlightPrice;
    private getAmadeusPrice;
    private getSkyscannerPrice;
    private getHistoricalFlightPrices;
    private generateMockHistoricalData;
    private calculateHistoricalTrend;
    private generateForecast;
    private generateForecastWithHistoricalMean;
    private generateBuySignal;
    comparePrices(fromCity: string, toCity: string, date: string): Promise<{
        predicted_price: number;
        realtime_price: number | null;
        price_difference: number | null;
        price_difference_percent: number | null;
        comparison_status: 'MATCH' | 'HIGHER' | 'LOWER' | 'UNAVAILABLE';
    }>;
}

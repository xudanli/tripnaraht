import { PrismaService } from '../../prisma/prisma.service';
import { HotelPricePredictionRequest, HotelPricePredictionResponse } from '../../flight-prices/interfaces/price-prediction.interface';
import { ProphetService } from '../../flight-prices/services/prophet-service';
export declare class HotelPricePredictionService {
    private prisma;
    private prophetService;
    private readonly logger;
    constructor(prisma: PrismaService, prophetService: ProphetService);
    predictHotelPrice(request: HotelPricePredictionRequest): Promise<HotelPricePredictionResponse>;
    private getCurrentHotelPrice;
    private getRealtimeHotelPrice;
    private getAmadeusHotelPrice;
    private getBookingHotelPrice;
    private getHistoricalHotelPrices;
    private generateMockHistoricalData;
    private calculateHistoricalTrend;
    private generateForecast;
    private generateForecastWithHistoricalMean;
    private generateBuySignal;
}

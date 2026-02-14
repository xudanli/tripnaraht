import { HotelPriceService } from './services/hotel-price.service';
import { HotelPricePredictionService } from './services/hotel-price-prediction.service';
import { HotelPricePredictionDto } from './dto/predict-price.dto';
export declare class HotelsController {
    private readonly hotelPriceService;
    private readonly hotelPricePredictionService;
    constructor(hotelPriceService: HotelPriceService, hotelPricePredictionService: HotelPricePredictionService);
    estimatePrice(city: string, starRating: number, year?: string, quarter?: string, includeRecommendations?: string, recommendationLimit?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getCityStarOptions(city: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<{
        starRating: number;
        avgPrice: number;
        cityStarFactor: number;
        sampleCount: number;
        minPrice: number | null;
        maxPrice: number | null;
    }[]>>;
    getQuarterlyTrend(city: string, starRating?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getRecommendations(city: string, starRating: number, minPrice?: string, maxPrice?: string, limit?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    predictPrice(dto: HotelPricePredictionDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
}

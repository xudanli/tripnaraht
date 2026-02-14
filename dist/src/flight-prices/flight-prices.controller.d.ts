import { FlightPriceService } from '../trips/services/flight-price.service';
import { FlightPriceDetailService } from '../trips/services/flight-price-detail.service';
import { FlightPriceDetailEnhancedService } from '../trips/services/flight-price-detail-enhanced.service';
import { PricePredictionService } from './services/price-prediction.service';
import { CreateFlightPriceDto } from './dto/create-flight-price.dto';
import { UpdateFlightPriceDto } from './dto/update-flight-price.dto';
import { FlightPricePredictionDto } from './dto/predict-price.dto';
export declare class FlightPricesController {
    private readonly flightPriceService;
    private readonly flightPriceDetailService;
    private readonly flightPriceDetailEnhancedService;
    private readonly pricePredictionService;
    constructor(flightPriceService: FlightPriceService, flightPriceDetailService: FlightPriceDetailService, flightPriceDetailEnhancedService: FlightPriceDetailEnhancedService, pricePredictionService: PricePredictionService);
    estimatePrice(countryCode: string, originCity?: string, useConservative?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getPriceDetails(countryCode: string, originCity?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    findAll(): Promise<import("../common/dto/standard-response.dto").StandardResponse<{
        id: number;
        createdAt: Date;
        updatedAt: Date;
        source: string | null;
        countryCode: string;
        notes: string | null;
        originCity: string | null;
        lowSeasonPrice: number;
        highSeasonPrice: number;
        averagePrice: number;
        visaCost: number;
        lastUpdated: Date;
    }[]>>;
    estimateDomesticPrice(originCity: string, destinationCity: string, month: number, dayOfWeek?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getMonthlyTrend(originCity: string, destinationCity: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<{
        month: number;
        basePrice: number;
        sampleCount: number;
    }[]>>;
    getDayOfWeekFactors(): Promise<import("../common/dto/standard-response.dto").StandardResponse<{
        factor: number;
        id: number;
        updatedAt: Date;
        avgPrice: number | null;
        sampleCount: number;
        lastUpdated: Date;
        dayOfWeek: number;
        totalAvgPrice: number | null;
    }[]>>;
    predictPrice(dto: FlightPricePredictionDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getDetailedPriceOptions(originCity: string, destinationCity: string, month: number, dayOfWeek?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    findOne(id: number): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    create(createDto: CreateFlightPriceDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    update(id: number, updateDto: UpdateFlightPriceDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    remove(id: number): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
}

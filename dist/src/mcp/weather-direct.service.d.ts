import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
interface GeocodingResult {
    name: string;
    latitude: number;
    longitude: number;
    country: string;
    admin1?: string;
}
export declare class WeatherDirectService implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private axiosInstance;
    private readonly baseUrl;
    private isAvailable;
    constructor();
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    isServiceAvailable(): boolean;
    geocode(city: string): Promise<GeocodingResult>;
    getCurrentWeather(city: string): Promise<any>;
    getWeatherByDatetimeRange(city: string, startDate: string, endDate: string): Promise<any>;
    getCurrentDateTime(timezone?: string): Promise<any>;
    private mapWeatherCode;
}
export {};

import { WeatherDirectService } from './weather-direct.service';
export declare class WeatherDirectController {
    private readonly weatherDirectService;
    constructor(weatherDirectService: WeatherDirectService);
    health(): {
        status: string;
        service: string;
        available: boolean;
        api: string;
    };
    getCurrentWeather(city: string): Promise<any>;
    getWeatherByDatetimeRange(city: string, startDate: string, endDate: string): Promise<any>;
    getCurrentDateTime(timezone?: string): Promise<any>;
}

import { ConfigService } from '@nestjs/config';
import { WeatherAdapter } from './weather.adapter.interface';
import { WeatherData, WeatherQuery } from '../interfaces/weather.interface';
import { BaseAdapter } from './base.adapter';
export declare class WeatherApiAdapter extends BaseAdapter implements WeatherAdapter {
    private configService?;
    private readonly apiKey;
    constructor(configService?: ConfigService);
    getWeather(query: WeatherQuery): Promise<WeatherData>;
    getSupportedCountries(): string[];
    getPriority(): number;
    getName(): string;
    private mapWeatherCondition;
    private extractAlerts;
}

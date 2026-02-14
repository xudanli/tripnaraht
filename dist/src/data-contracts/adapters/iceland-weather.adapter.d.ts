import { ConfigService } from '@nestjs/config';
import { WeatherAdapter } from './weather.adapter.interface';
import { WeatherData, WeatherQuery } from '../interfaces/weather.interface';
import { BaseAdapter } from './base.adapter';
export declare class IcelandWeatherAdapter extends BaseAdapter implements WeatherAdapter {
    private configService?;
    private readonly majorStations;
    constructor(configService?: ConfigService);
    getWeather(query: WeatherQuery): Promise<WeatherData>;
    getSupportedCountries(): string[];
    getPriority(): number;
    getName(): string;
    private findNearestStation;
    private calculateDistance;
    private toRad;
    private mapToWeatherData;
    private parseWindDirection;
    private mapWeatherCondition;
    private extractAlerts;
    private mapSeverity;
}

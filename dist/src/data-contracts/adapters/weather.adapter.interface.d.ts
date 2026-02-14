import { WeatherData, WeatherQuery } from '../interfaces/weather.interface';
export interface WeatherAdapter {
    getWeather(query: WeatherQuery): Promise<WeatherData>;
    getSupportedCountries(): string[];
    getPriority(): number;
    getName(): string;
}

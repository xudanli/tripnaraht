export interface WeatherData {
    temperature: number;
    feelsLikeTemperature?: number;
    condition: string;
    windSpeed?: number;
    windDirection?: number;
    humidity?: number;
    visibility?: number;
    alerts?: WeatherAlert[];
    lastUpdated: Date;
    source: string;
    metadata?: Record<string, any>;
}
export interface WeatherAlert {
    type: string;
    severity: 'info' | 'warning' | 'critical';
    title: string;
    description: string;
    effectiveTime?: Date;
    expiryTime?: Date;
}
export interface WeatherQuery {
    lat: number;
    lng: number;
    date?: string;
    timezone?: string;
    includeWindDetails?: boolean;
    includeAuroraInfo?: boolean;
}
export interface ExtendedWeatherData extends WeatherData {
    windGust?: number;
    auroraKPIndex?: number;
    cloudCover?: number;
    auroraVisibility?: 'none' | 'low' | 'moderate' | 'high';
}

export declare enum HighlandRegion {
    CENTRAL_HIGHLANDS = "centralhighlands",
    SOUTH_HIGHLANDS = "southhighlands",
    NORTH_HIGHLANDS = "northhighlands"
}
export declare class VedurWeatherQueryDto {
    region?: HighlandRegion;
    lat?: number;
    lng?: number;
    includeWindDetails?: boolean;
}
export declare class VedurWeatherStationDto {
    id: string;
    name: string;
    lat: number;
    lng: number;
    elevation: number;
}
export declare class VedurWeatherForecastDto {
    datetime: string;
    temperature: number;
    windSpeed: number;
    windDirection: number;
    windSpeedKmh: number;
    precipitation: number;
    condition: string;
    visibility?: number;
}
export declare class VedurWeatherResponseDto {
    station: VedurWeatherStationDto;
    current: VedurWeatherForecastDto;
    forecast: VedurWeatherForecastDto[];
    lastUpdated: string;
    source: string;
}

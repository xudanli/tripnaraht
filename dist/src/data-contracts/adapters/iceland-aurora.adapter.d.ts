import { ConfigService } from '@nestjs/config';
import { BaseAdapter } from './base.adapter';
export declare class IcelandAuroraAdapter extends BaseAdapter {
    private configService?;
    private readonly auroraReachUrl;
    private readonly noaaUrl;
    private readonly openWeatherClient;
    constructor(configService?: ConfigService);
    getAuroraKPIndex(): Promise<number>;
    getCloudCover(lat: number, lng: number): Promise<number>;
    calculateAuroraVisibility(lat: number, lng: number, kpIndex?: number, cloudCover?: number): Promise<'none' | 'low' | 'moderate' | 'high'>;
    getAuroraForecast(lat: number, lng: number, hours?: number): Promise<Array<{
        time: Date;
        kpIndex: number;
        cloudCover: number;
        visibility: 'none' | 'low' | 'moderate' | 'high';
    }>>;
}

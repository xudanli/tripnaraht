import { ConfigService } from '@nestjs/config';
import { IcelandSafetyAlert } from '../interfaces/iceland-specific.interface';
import { BaseAdapter } from './base.adapter';
export declare class IcelandSafetyAdapter extends BaseAdapter {
    private configService?;
    constructor(configService?: ConfigService);
    getSafetyAlerts(lat?: number, lng?: number): Promise<IcelandSafetyAlert[]>;
    getSafetyAlertsByType(type: 'weather' | 'road' | 'volcano' | 'glacier' | 'geothermal' | 'general', lat?: number, lng?: number): Promise<IcelandSafetyAlert[]>;
    getCriticalSafetyAlerts(lat?: number, lng?: number): Promise<IcelandSafetyAlert[]>;
    private mapToSafetyAlerts;
    private mapAlertType;
    private mapSeverity;
    private mapAffectedAreas;
}

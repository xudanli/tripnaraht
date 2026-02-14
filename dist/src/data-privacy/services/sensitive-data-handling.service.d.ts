import { EncryptionService } from './encryption.service';
import { DataPrivacyFrameworkService } from './data-privacy-framework.service';
import { HealthData, ProcessedHealthData, LocationData, ProcessedLocationData, BehavioralData, ProcessedBehavioralData } from '../interfaces/data-privacy.interface';
export declare class SensitiveDataHandlingService {
    private readonly encryptionService;
    private readonly privacyFramework;
    private readonly logger;
    constructor(encryptionService: EncryptionService, privacyFramework: DataPrivacyFrameworkService);
    handleHealthData(data: HealthData): Promise<ProcessedHealthData>;
    handleLocationData(data: LocationData): Promise<ProcessedLocationData>;
    handleBehavioralData(data: BehavioralData): Promise<ProcessedBehavioralData>;
    private getRegionFromCoordinates;
    private anonymizeData;
    private aggregateData;
    private countOccurrences;
    private getTopItems;
}

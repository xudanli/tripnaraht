export type DataPurpose = 'HEALTH_RISK_ASSESSMENT' | 'LOCATION_TRACKING' | 'BEHAVIORAL_ANALYSIS' | 'TRIP_PLANNING' | 'PERSONALIZATION' | 'ANALYTICS';
export interface DataUsage {
    purpose: DataPurpose;
    fields: string[];
    retentionDays: number;
    sharedWithThirdParty: boolean;
    thirdPartyName?: string;
}
export interface Consent {
    required: boolean;
    consentId?: string;
    grantedAt?: Date;
    consentText?: string;
    consentFields?: string[];
}
export interface EncryptedData {
    encrypted: string;
    encryptionKeyId: string;
    encryptedAt: Date;
    algorithm: string;
}
export type DataType = 'HEALTH_DATA' | 'LOCATION_DATA' | 'BEHAVIORAL_DATA' | 'PERSONAL_DATA' | 'PAYMENT_DATA' | 'OTHER';
export interface RetentionPolicy {
    dataType: DataType;
    retentionDays: number;
    autoDelete: boolean;
    createdAt: Date;
}
export interface DataRights {
    access: () => Promise<UserDataExport>;
    correct: (field: string, value: any) => Promise<void>;
    delete: () => Promise<void>;
    export: () => Promise<UserDataExport>;
}
export interface UserDataExport {
    userId: string;
    exportedAt: Date;
    data: Record<string, any>;
    format: 'json' | 'csv';
}
export interface HealthData {
    userId: string;
    healthInfo: {
        age?: number;
        fitnessLevel?: string;
        medicalConditions?: string[];
        allergies?: string[];
        medications?: string[];
    };
}
export interface ProcessedHealthData {
    data: EncryptedData;
    encryption: string;
    accessControl: string;
    retention: string;
    purposeLimitation: string;
}
export interface LocationData {
    id: string;
    userId: string;
    location: {
        latitude: number;
        longitude: number;
        timestamp: Date;
        accuracy?: number;
    };
}
export interface ProcessedLocationData {
    data: any;
    encryption: string;
    realTimeHandling: string;
    historicalRetention: string;
}
export interface BehavioralData {
    userId: string;
    behavior: {
        searchHistory?: any[];
        clickHistory?: any[];
        preferences?: Record<string, any>;
    };
}
export interface ProcessedBehavioralData {
    data: any;
    anonymization: string;
    aggregation: string;
    retention: string;
}
export interface MinimalData {
    requiredFields: string[];
    data: Record<string, any>;
    excludedFields: string[];
}

import { PaymentType } from '@prisma/client';
export declare class PowerInfoDto {
    voltage?: number;
    frequency?: number;
    plugTypes?: string[];
    note?: string;
}
export declare class EmergencyInfoDto {
    police?: string;
    fire?: string;
    medical?: string;
    ambulance?: string;
    note?: string;
    embassy?: {
        phone?: string;
        address?: string;
    };
}
export declare class VisaInfoDto {
    required?: boolean;
    type?: string;
    duration?: string;
    requirements?: string[];
    notes?: string;
}
export declare class ComplianceInfoDto {
    visaPolicy?: {
        forCN?: string;
        forUS?: string;
        [key: string]: any;
    };
    drivingRules?: {
        requiresInternationalLicense?: boolean;
        driveOnLeft?: boolean;
        [key: string]: any;
    };
    droneRules?: {
        allowed?: boolean;
        notes?: string;
        [key: string]: any;
    };
    alcoholPolicy?: any;
    travelWarnings?: any;
    customs?: any;
}
export declare class TravelCultureDto {
    tipping?: string;
    taboos?: string[];
    dressCode?: string;
    festivals?: Array<{
        name?: string;
        month?: number;
        description?: string;
        [key: string]: any;
    }>;
    etiquette?: string;
    customs?: any;
}
export declare class CountryProfileDto {
    isoCode: string;
    nameCN: string;
    nameEN?: string;
    updatedAt: Date;
    currencyCode?: string;
    currencyName?: string;
    exchangeRateToCNY?: number;
    exchangeRateToUSD?: number;
    paymentType?: PaymentType;
    paymentInfo?: {
        tipping?: string;
        atm_network?: string;
        wallet_apps?: string[];
        cash_preparation?: string;
        notes?: string;
        [key: string]: any;
    };
    powerInfo?: PowerInfoDto;
    emergency?: EmergencyInfoDto;
    visaForCN?: VisaInfoDto;
    complianceInfo?: ComplianceInfoDto;
    travelCulture?: TravelCultureDto;
}

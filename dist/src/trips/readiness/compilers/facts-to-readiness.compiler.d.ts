import { ReadinessFinding } from '../types/readiness-findings.types';
import { TripContext } from '../types/trip-context.types';
export interface CountryFacts {
    isoCode: string;
    nameCN: string;
    nameEN?: string;
    currencyCode?: string;
    currencyName?: string;
    paymentType?: 'CASH_HEAVY' | 'BALANCED' | 'DIGITAL_ONLY';
    paymentInfo?: {
        tipping?: string;
        cash_preparation?: string;
        atm_network?: string;
        wallet_apps?: string;
    };
    powerInfo?: {
        voltage?: number;
        frequency?: number;
        plugTypes?: string[];
        note?: string;
    };
    emergency?: {
        police?: string;
        fire?: string;
        medical?: string;
        note?: string;
    };
    visaForCN?: {
        status?: string;
        statusCN?: string;
        requirement?: string;
        requirementCN?: string;
        allowedStay?: string;
        allowedStayCN?: string;
    };
    exchangeRateToCNY?: number;
    exchangeRateToUSD?: number;
}
export declare class FactsToReadinessCompiler {
    compile(facts: CountryFacts, context: TripContext): ReadinessFinding;
    private compileEntryTransit;
    private compileLogistics;
    private compileSafety;
}

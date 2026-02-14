import { PassFamily, EligibilityResult, ISODate } from '../interfaces/railpass.interface';
export declare class EligibilityEngineService {
    private readonly logger;
    checkEligibility(args: {
        residencyCountry: string;
        travelCountries: string[];
        isCrossResidencyCountry?: boolean;
        departureDate: ISODate;
    }): EligibilityResult;
    private determinePassFamily;
    private checkInterrailHomeCountryRules;
    validateHomeCountryUsage(args: {
        passFamily: PassFamily;
        residencyCountry: string;
        outboundUsed: number;
        inboundUsed: number;
    }): {
        valid: boolean;
        violations: string[];
    };
}

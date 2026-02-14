import { PaymentType } from '@prisma/client';
export declare class CurrencyStrategyDto {
    countryCode: string;
    countryName: string;
    currencyCode: string;
    currencyName: string;
    paymentType: PaymentType;
    exchangeRateToCNY?: number;
    exchangeRateToUSD?: number;
    quickRule?: string;
    quickTip?: string;
    quickTable?: Array<{
        local: number;
        home: number;
    }>;
    paymentAdvice?: {
        tipping?: string;
        atm_network?: string;
        wallet_apps?: string[];
        cash_preparation?: string;
    };
}

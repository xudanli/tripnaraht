export declare class EstimatePriceDto {
    countryCode: string;
    originCity?: string;
    useConservative?: boolean;
}
export declare class EstimatePriceResponseDto {
    totalCost: number;
    flightPrice: number;
    visaCost: number;
    useConservative: boolean;
    countryCode: string;
    originCity?: string;
}

export declare class CurrencyMathUtil {
    static generateRule(rate: number, targetCurrency?: string): string;
    static generateQuickTable(rate: number, amounts?: number[]): Array<{
        local: number;
        home: number;
    }>;
    static formatTip(rate: number, currencyCode: string, currencyName?: string, exampleAmount?: number): string;
    private static isCloseTo;
}

export interface ExpiryRule {
    expiryDays?: number;
    checkIntegrity: boolean;
    alertOnMissing: boolean;
}
export declare const EXPIRY_RULES: Record<string, ExpiryRule | Record<string, ExpiryRule>>;
export declare function isDataExpired(lastUpdated: Date, expiryDays?: number): boolean;

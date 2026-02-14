import { ExtendedDataSourceInfo } from '../../data-quality/interfaces/source-annotation.interface';
export type ClaimType = 'FACT' | 'SPECULATION' | 'RECOMMENDATION' | 'OPINION';
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
export interface FactualClaim {
    text: string;
    type: ClaimType;
    position?: {
        start: number;
        end: number;
    };
    entities?: string[];
    metadata?: Record<string, any>;
}
export interface VerifiedClaim extends FactualClaim {
    verified: boolean;
    source: ExtendedDataSourceInfo | null;
    confidence: number;
    verifiedAt?: Date;
}
export interface AnnotatedClaim extends VerifiedClaim {
    confidenceLevel: ConfidenceLevel;
}
export interface HallucinationMarkedClaim extends AnnotatedClaim {
    isHallucinationRisk: boolean;
    action: 'REMOVE' | 'KEEP' | 'FLAG';
}
export interface UserNotification {
    hasRisks: boolean;
    message: string | null;
    lowConfidenceItems?: Array<{
        text: string;
        confidence: number;
        source?: string;
    }>;
}
export interface HallucinationDetectionResult {
    verifiedClaims: VerifiedClaim[];
    hallucinationRisks: HallucinationMarkedClaim[];
    userNotification: UserNotification;
    cleanedOutput: any;
    statistics: {
        totalClaims: number;
        verifiedClaims: number;
        hallucinationRisks: number;
        removedClaims: number;
    };
}

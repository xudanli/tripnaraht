import { ValidatedRetrievalResult, OutputValidationResult } from '../types/validation.types';
export declare function formatValidationResult(result: OutputValidationResult): string;
export declare function filterHighQualityResults(results: ValidatedRetrievalResult[], minScore?: number): ValidatedRetrievalResult[];
export declare function sortByValidationScore(results: ValidatedRetrievalResult[], ascending?: boolean): ValidatedRetrievalResult[];
export declare function calculateValidationStats(results: ValidatedRetrievalResult[]): {
    total: number;
    avgScore: number;
    passCount: number;
    failCount: number;
    unknownCount: number;
    highQualityCount: number;
    highQualityRate?: undefined;
} | {
    total: number;
    avgScore: number;
    passCount: number;
    failCount: number;
    unknownCount: number;
    highQualityCount: number;
    highQualityRate: number;
};
export declare function isValidationPassed(result: OutputValidationResult): boolean;
export declare function getValidationSummary(result: OutputValidationResult): {
    status: 'pass' | 'fail' | 'warning';
    score: number;
    issues: string[];
    recommendations: string[];
};

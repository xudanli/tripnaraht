export declare function fnv1a32(input: string): string;
export declare function buildSuggestionId(prefix: 'voice' | 'vision', stableKey: string): string;
export declare function generateVoiceSuggestionId(actionType: string, poiId?: string, transcript?: string): string;
export declare function generateVisionSuggestionId(poiId: string, ocrText?: string): string;
export declare function generateClarificationSuggestionId(actionType: string): string;

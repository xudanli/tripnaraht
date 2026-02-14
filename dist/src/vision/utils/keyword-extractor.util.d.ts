export declare class KeywordExtractor {
    private readonly pricePatterns;
    private readonly timePatterns;
    private readonly dayPatterns;
    private readonly stopWords;
    private readonly shopSuffixPattern;
    private readonly menuKeywords;
    extractCandidateKeywords(lines: string[]): string[];
    private isPriceLine;
    private isTimeLine;
    private isDayLine;
    private isStopWordLine;
    private scoreLine;
    extractCandidateNames(lines: string[], topN?: number): string[];
}

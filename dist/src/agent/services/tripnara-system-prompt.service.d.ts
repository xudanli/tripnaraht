export declare class TripNaraSystemPromptService {
    private readonly systemPrompt;
    constructor();
    getSystemPrompt(): string;
    getCompactSystemPrompt(): string;
    getPromptForScenario(scenario: 'planning' | 'repair' | 'explanation'): string;
    private loadSystemPrompt;
    private getEmbeddedPrompt;
    private extractCompactVersion;
    getDecisionStagePrompt(stage: 'route_selection' | 'constraint_injection' | 'poi_generation' | 'strategy_execution'): string;
}

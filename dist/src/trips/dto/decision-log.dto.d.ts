export declare enum DecisionSource {
    PHYSICAL = "PHYSICAL",
    HUMAN = "HUMAN",
    PHILOSOPHY = "PHILOSOPHY",
    SPATIAL = "SPATIAL"
}
export declare enum PersonaType {
    ABU = "ABU",
    DR_DRE = "DR_DRE",
    NEPTUNE = "NEPTUNE"
}
export declare class DecisionLogEntryDto {
    id: string;
    date: string;
    description: string;
    source: DecisionSource;
    persona?: PersonaType;
    action: string;
    metadata?: Record<string, any>;
}
export declare class DecisionLogResponseDto {
    items: DecisionLogEntryDto[];
    total: number;
    limit: number;
    offset: number;
}

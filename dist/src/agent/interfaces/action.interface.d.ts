export declare enum ActionKind {
    INTERNAL = "internal",
    EXTERNAL = "external"
}
export declare enum ActionCost {
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high"
}
export declare enum ActionSideEffect {
    NONE = "none",
    WRITES_DB = "writes_db",
    CALLS_API = "calls_api",
    CHARGES_MONEY = "charges_money"
}
export interface ActionMetadata {
    kind: ActionKind;
    cost: ActionCost;
    side_effect: ActionSideEffect;
    preconditions: string[];
    idempotent: boolean;
    cacheable: boolean;
    cache_key?: string;
}
export interface Action {
    name: string;
    description: string;
    metadata: ActionMetadata;
    input_schema: Record<string, any>;
    output_schema: Record<string, any>;
    execute: (input: any, state: any) => Promise<any>;
}

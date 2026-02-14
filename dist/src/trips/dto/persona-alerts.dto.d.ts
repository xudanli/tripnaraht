export declare enum PersonaType {
    ABU = "ABU",
    DR_DRE = "DR_DRE",
    NEPTUNE = "NEPTUNE"
}
export declare enum AlertSeverity {
    WARNING = "warning",
    INFO = "info",
    SUCCESS = "success"
}
export declare class PersonaAlertDto {
    id: string;
    persona: PersonaType;
    name: string;
    title: string;
    message: string;
    severity: AlertSeverity;
    createdAt: string;
    metadata?: Record<string, any>;
}

export declare enum TaskPriority {
    HIGH = "high",
    MEDIUM = "medium",
    LOW = "low"
}
export declare enum TaskCategory {
    PREFERENCE = "PREFERENCE",
    SCHEDULE = "SCHEDULE",
    SAFETY = "SAFETY",
    BUDGET = "BUDGET",
    OTHER = "OTHER"
}
export declare class TaskDto {
    id: string;
    text: string;
    completed: boolean;
    priority: TaskPriority;
    category: TaskCategory;
    route?: string;
    metadata?: Record<string, any>;
}
export declare class UpdateTaskStatusDto {
    completed: boolean;
}

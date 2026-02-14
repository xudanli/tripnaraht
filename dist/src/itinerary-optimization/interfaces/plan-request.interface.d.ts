export interface PlanRequest {
    date: string;
    timezone: string;
    day_boundary: {
        start: string;
        end: string;
    };
    start: {
        node_id: number;
        name: string;
        geo: {
            lat: number;
            lng: number;
        };
    };
    end: {
        node_id: number;
        same_as_start?: boolean;
        name?: string;
        geo?: {
            lat: number;
            lng: number;
        };
    };
    nodes: PlanNode[];
    transport_policy?: {
        buffer_factor?: number;
        fixed_buffer_min?: number;
        switch_cost_min?: {
            'walk->metro'?: number;
            'metro->taxi'?: number;
            'taxi->walk'?: number;
            [key: string]: number | undefined;
        };
        cross_region_cost_min?: number;
    };
    objective_weights?: {
        travel?: number;
        wait?: number;
        soft_cost?: number;
        drop_penalty?: number;
        reward?: number;
    };
    lifestyle_policy?: {
        earliest_first_stop?: string;
        lunch_break?: {
            enabled: boolean;
            duration_min: number;
            window: [string, string];
        };
    };
    pacing?: 'relaxed' | 'normal' | 'intense';
}
export interface PlanNode {
    id: number;
    name: string;
    type: 'poi' | 'restaurant' | 'hotel' | 'break' | 'virtual';
    service_duration_min: number;
    time_windows?: Array<[string, string]>;
    constraints?: {
        is_hard_node?: boolean;
        priority_level?: number;
        drop_penalty?: number;
        reward?: number;
    };
    geo: {
        lat: number;
        lng: number;
    };
    meta?: {
        region_id?: string;
        tags?: string[];
        origin_id?: number;
        disjunction_group_id?: number;
    };
}
export interface RobustTimeMatrix {
    unit: 'minute';
    base: 'api_duration';
    robust_policy: {
        buffer_factor: number;
        fixed_buffer_min: number;
    };
    matrix: number[][];
    components?: {
        api: number[][];
        buffer: number[][];
        fixed: number;
        switch?: number[][];
        cross_region?: number[][];
    };
}
export interface OptimizationResult {
    status: 'FEASIBLE' | 'OPTIMAL' | 'INFEASIBLE';
    summary: {
        total_travel_min: number;
        total_wait_min: number;
        total_service_min: number;
        total_day_min: number;
        dropped_count: number;
        robustness_score: number;
    };
    route: RouteNode[];
    timeline?: TimelineEvent[];
    dropped: DroppedNode[];
    diagnostics?: {
        critical_windows?: Array<{
            node_id: number;
            slack_to_close_min: number;
        }>;
        assumptions?: {
            buffer_factor: number;
            fixed_buffer_min: number;
        };
    };
    robustness?: {
        total_buffer_minutes: number;
        total_wait_minutes: number;
        top3_min_slack_nodes: Array<{
            node_id: number;
            slack_min: number;
        }>;
        risk_level?: 'low' | 'medium' | 'high';
    };
}
export interface TimelineEvent {
    type: 'NODE' | 'WAIT' | 'LUNCH' | 'TRAVEL';
    start: string;
    end: string;
    duration_min: number;
    description?: string;
    node_id?: number;
}
export interface RouteNode {
    seq: number;
    node_id: number;
    origin_id?: number;
    name: string;
    arrival: string;
    start_service: string;
    end_service: string;
    wait_min: number;
    travel_min_from_prev: number;
}
export declare enum DropReasonCode {
    TIME_WINDOW_CONFLICT = "TIME_WINDOW_CONFLICT",
    INSUFFICIENT_TOTAL_TIME = "INSUFFICIENT_TOTAL_TIME",
    CLOSED_DAY = "CLOSED_DAY",
    HIGH_WAIT_TIME = "HIGH_WAIT_TIME",
    LOW_PRIORITY_NOT_WORTH = "LOW_PRIORITY_NOT_WORTH",
    HARD_NODE_PROTECTION = "HARD_NODE_PROTECTION",
    ROBUST_TIME_INFEASIBLE = "ROBUST_TIME_INFEASIBLE",
    EARLY_DEPARTURE_CONFLICT = "EARLY_DEPARTURE_CONFLICT"
}
export interface DroppedNode {
    node_id: number;
    name: string;
    reason_code: DropReasonCode;
    reason?: string;
    penalty: number;
    explanation: {
        text: string;
        facts?: {
            close_time?: string;
            slack_min?: number;
            required_departure?: string;
            arrival_time?: string;
            wait_minutes?: number;
            [key: string]: any;
        };
        suggestions?: string[];
    };
}

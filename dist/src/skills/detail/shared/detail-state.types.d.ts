export interface TripHealth {
    overall: 'healthy' | 'warning' | 'critical';
    overallScore?: number;
    dimensions: {
        schedule: {
            status: 'healthy' | 'warning' | 'critical';
            score: number;
            issues: string[];
            weight?: number;
        };
        budget: {
            status: 'healthy' | 'warning' | 'critical';
            score: number;
            issues: string[];
            weight?: number;
        };
        pace: {
            status: 'healthy' | 'warning' | 'critical';
            score: number;
            issues: string[];
            weight?: number;
        };
        feasibility: {
            status: 'healthy' | 'warning' | 'critical';
            score: number;
            issues: string[];
            weight?: number;
        };
    };
}
export interface DecisionExplanation {
    decisionId: string;
    decisionType: string;
    explanation: string;
    evidence: Array<{
        source: string;
        excerpt: string;
        relevance: string;
    }>;
    persona: 'ABU' | 'DR_DRE' | 'NEPTUNE';
    timestamp: string;
}
export interface TripStatusUnderstanding {
    currentPhase: 'PLANNING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
    progress: {
        completed: number;
        total: number;
        percentage: number;
    };
    nextSteps: Array<{
        step: string;
        priority: 'high' | 'medium' | 'low';
        deadline?: string;
    }>;
    risks: Array<{
        type: string;
        severity: 'low' | 'medium' | 'high' | 'critical';
        description: string;
        mitigation?: string;
    }>;
    opportunities: Array<{
        type: string;
        description: string;
        benefit: string;
    }>;
}
export interface DetailState {
    tripId: string;
    health: TripHealth;
    statusUnderstanding: TripStatusUnderstanding;
    decisionExplanations: DecisionExplanation[];
    evidence: Array<{
        id: string;
        source: string;
        excerpt: string;
        relevance: string;
        confidence: 'low' | 'medium' | 'high';
    }>;
    lastUpdated: string;
}

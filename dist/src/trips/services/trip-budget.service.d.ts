import { PrismaService } from '../../prisma/prisma.service';
export interface BudgetSummary {
    totalBudget: number;
    totalSpent: number;
    remaining: number;
    dailyBudget: number;
    dailySpent: Record<string, number>;
    categoryBreakdown: {
        accommodation: number;
        transportation: number;
        food: number;
        activities: number;
        other: number;
    };
    warnings: Array<{
        type: 'OVERSPEND' | 'APPROACHING_LIMIT' | 'DAILY_EXCEEDED';
        message: string;
        severity: 'warning' | 'error';
    }>;
}
export interface BudgetAlert {
    type: 'OVERSPEND' | 'APPROACHING_LIMIT' | 'DAILY_EXCEEDED';
    message: string;
    severity: 'warning' | 'error';
    suggestions: string[];
}
export interface BudgetConstraint {
    total: number;
    currency: string;
    dailyBudget?: number;
    categoryLimits?: {
        accommodation?: number;
        transportation?: number;
        food?: number;
        activities?: number;
        other?: number;
    };
    alertThreshold?: number;
    createdAt?: string;
    updatedAt?: string;
}
export interface BudgetDetailsItem {
    id: string;
    date: string;
    category: string;
    itemName: string;
    amount: number;
    currency: string;
    itineraryItemId?: string;
    evidenceRefs?: string[];
}
export interface BudgetTrendsResponse {
    dailySpending: Array<{
        date: string;
        budget: number;
        spent: number;
        ratio: number;
    }>;
    categoryDistribution: {
        accommodation: number;
        transportation: number;
        food: number;
        activities: number;
        other: number;
    };
    forecast?: {
        projectedTotal: number;
        projectedRemaining: number;
        confidence: number;
    };
}
export interface BudgetStatisticsResponse {
    completionRate: number;
    overspendRate: number;
    categoryPercentages: {
        accommodation: number;
        transportation: number;
        food: number;
        activities: number;
        other: number;
    };
    dailyAverage: number;
    projectedCompletion: string;
    riskLevel: 'low' | 'medium' | 'high';
}
export declare class TripBudgetService {
    private prisma;
    private readonly logger;
    private readonly SUPPORTED_CURRENCIES;
    private readonly MIN_BUDGET;
    private readonly MAX_BUDGET;
    private readonly DEFAULT_ALERT_THRESHOLD;
    constructor(prisma: PrismaService);
    getBudgetSummary(tripId: string): Promise<BudgetSummary>;
    checkBudgetAlert(tripId: string, newItemCost: number): Promise<BudgetAlert | null>;
    getBudgetOptimizationSuggestions(tripId: string, category?: string): Promise<Array<{
        type: 'REPLACE' | 'REMOVE' | 'RESCHEDULE';
        message: string;
        itemId?: string;
        itemName?: string;
        estimatedSavings: number;
    }>>;
    generateBudgetReport(tripId: string): Promise<{
        summary: BudgetSummary;
        trends: {
            dailySpending: Array<{
                date: string;
                budget: number;
                spent: number;
                ratio: number;
            }>;
            categoryDistribution: Record<string, number>;
        };
        recommendations: string[];
    }>;
    setBudgetConstraint(tripId: string, constraint: {
        total?: number;
        currency?: string;
        dailyBudget?: number;
        categoryLimits?: {
            accommodation?: number;
            transportation?: number;
            food?: number;
            activities?: number;
            other?: number;
        };
        alertThreshold?: number;
    }): Promise<BudgetConstraint>;
    getBudgetConstraint(tripId: string, userId?: string): Promise<BudgetConstraint | null>;
    private getRecommendedBudgetFromReadiness;
    deleteBudgetConstraint(tripId: string): Promise<void>;
    getBudgetDetails(tripId: string, params: {
        startDate?: string;
        endDate?: string;
        category?: string;
        limit?: number;
        offset?: number;
    }): Promise<{
        items: BudgetDetailsItem[];
        total: number;
        limit: number;
        offset: number;
    }>;
    getBudgetTrends(tripId: string, params: {
        startDate?: string;
        endDate?: string;
        granularity?: 'daily' | 'weekly' | 'monthly';
    }): Promise<BudgetTrendsResponse>;
    getBudgetStatistics(tripId: string): Promise<BudgetStatisticsResponse>;
    getBudgetMonitor(tripId: string): Promise<{
        currentSpent: number;
        remaining: number;
        dailySpent: Record<string, number>;
        alerts: BudgetAlert[];
        lastUpdated: string;
    }>;
    private mapCategory;
    private calculateForecast;
    private calculateProjectedCompletion;
    private calculateRiskLevel;
}

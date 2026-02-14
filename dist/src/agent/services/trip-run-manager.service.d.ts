import { PrismaService } from '../../prisma/prisma.service';
export interface CreateTripRunParams {
    tripId?: string | null;
    userId?: string | null;
    userQuery: string;
    planningPhase?: string;
    currentAgent?: string;
    metadata?: Record<string, any>;
}
export interface CreateTripAttemptParams {
    tripRunId: string;
    attemptNumber: number;
    planOutline?: string;
    openQuestions?: string[];
    constraintsAssumed?: string[];
    nextActions?: string[];
    metadata?: Record<string, any>;
}
export interface UpdateTripRunParams {
    runId: string;
    status?: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
    planningPhase?: string;
    currentAgent?: string;
    completedAt?: Date;
    metadata?: Record<string, any>;
}
export interface UpdateTripAttemptParams {
    attemptId: string;
    status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
    planOutline?: string;
    openQuestions?: string[];
    constraintsAssumed?: string[];
    nextActions?: string[];
    failureNotes?: string;
    resultSummary?: string;
    artifacts?: Record<string, any>;
    completedAt?: Date;
    metadata?: Record<string, any>;
}
export declare class TripRunManagerService {
    private readonly prisma?;
    private readonly logger;
    constructor(prisma?: PrismaService);
    createTripRun(params: CreateTripRunParams): Promise<string | null>;
    createTripAttempt(params: CreateTripAttemptParams): Promise<string | null>;
    updateTripRun(params: UpdateTripRunParams): Promise<boolean>;
    updateTripAttempt(params: UpdateTripAttemptParams): Promise<boolean>;
    completeTripRun(runId: string, metadata?: Record<string, any>): Promise<boolean>;
    failTripRun(runId: string, error?: Error | string, metadata?: Record<string, any>): Promise<boolean>;
    completeTripAttempt(attemptId: string, resultSummary?: string, artifacts?: Record<string, any>, metadata?: Record<string, any>): Promise<boolean>;
    failTripAttempt(attemptId: string, failureNotes: string, metadata?: Record<string, any>): Promise<boolean>;
    private isValidUUID;
}

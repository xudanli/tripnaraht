export interface ApprovalRequest {
    id: string;
    threadId: string;
    toolCallId?: string;
    skillName: string;
    payload: any;
    status: 'pending' | 'approved' | 'rejected' | 'expired' | 'auto-approved';
    createdAt: Date;
    expiresAt?: Date;
    result?: {
        approved: boolean;
        timestamp: Date;
        userFeedback?: string;
        userId?: string;
    };
    userPrompt?: {
        title: string;
        description: string;
        action: string;
        riskLevel: string;
        context?: Record<string, any>;
        alternatives?: Array<{
            option: string;
            description: string;
            pros?: string[];
            cons?: string[];
        }>;
    };
    metadata?: Record<string, any>;
}
export declare const ApprovalRequestSchema: {
    id: StringConstructor;
    threadId: StringConstructor;
    toolCallId: StringConstructor;
    skillName: StringConstructor;
    payload: ObjectConstructor;
    status: StringConstructor;
    createdAt: DateConstructor;
    expiresAt: DateConstructor;
    result: ObjectConstructor;
    userPrompt: ObjectConstructor;
    metadata: ObjectConstructor;
};

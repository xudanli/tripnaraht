export declare class CreateSessionResponseDto {
    sessionId: string;
    userId?: string;
    createdAt: string;
    expiresAt: string;
    context?: {
        tripId?: string;
        destination?: string;
    };
}

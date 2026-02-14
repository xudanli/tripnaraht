export type FerryStatus = 'RUNNING' | 'CANCELLED' | 'SEASONAL';
export interface Ferry {
    id: string;
    status: FerryStatus;
    seasonOpenFrom?: number;
    seasonOpenTo?: number;
    lastStatusUpdate?: Date;
    metadata?: Record<string, any>;
}

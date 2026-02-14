import { PrismaService } from '../../prisma/prisma.service';
export interface EmergencySOSRequest {
    tripId: string;
    latitude: number;
    longitude: number;
    message?: string;
    timestamp?: Date;
}
export interface EmergencySOSResponse {
    sosId: string;
    tripId: string;
    status: 'SENT' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED';
    coordinates: {
        latitude: number;
        longitude: number;
    };
    sentAt: Date;
    rescueInfo?: {
        estimatedArrival?: string;
        contactNumber?: string;
        progress?: string;
    };
}
export declare class TripEmergencyService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    sendSOS(request: EmergencySOSRequest): Promise<EmergencySOSResponse>;
    getSOSHistory(tripId: string): Promise<EmergencySOSResponse[]>;
    updateRescueProgress(sosId: string, progress: {
        status: 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED';
        estimatedArrival?: string;
        contactNumber?: string;
        progress?: string;
    }): Promise<void>;
}

export declare enum SharePermission {
    VIEW = "VIEW",
    EDIT = "EDIT"
}
export declare class CreateTripShareDto {
    permission?: SharePermission;
    expiresAt?: string;
}
export declare class TripShareResponseDto {
    id: string;
    tripId: string;
    shareToken: string;
    permission: string;
    expiresAt?: Date;
    shareUrl: string;
    createdAt: Date;
}

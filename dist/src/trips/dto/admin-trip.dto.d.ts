export declare enum TripStatus {
    PLANNING = "PLANNING",
    IN_PROGRESS = "IN_PROGRESS",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED"
}
export declare enum SortField {
    CREATED_AT = "createdAt",
    UPDATED_AT = "updatedAt",
    START_DATE = "startDate",
    END_DATE = "endDate"
}
export declare enum SortOrder {
    ASC = "asc",
    DESC = "desc"
}
export declare class AdminTripListQueryDto {
    page?: number;
    limit?: number;
    status?: TripStatus;
    destination?: string;
    startDateFrom?: string;
    startDateTo?: string;
    createdAtFrom?: string;
    createdAtTo?: string;
    userId?: string;
    sortBy?: SortField;
    sortOrder?: SortOrder;
    search?: string;
}
export declare class AdminTripStatsQueryDto {
    startDate?: string;
    endDate?: string;
    destination?: string;
}
export declare class BatchOperationRequestDto {
    action: 'DELETE' | 'UPDATE_STATUS';
    tripIds: string[];
    params?: {
        status?: TripStatus;
    };
}

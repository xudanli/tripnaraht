export declare class UserStatsResponseDto {
    totalUsers: number;
    verifiedUsers: number;
    unverifiedUsers: number;
    googleUsers: number;
    todayNewUsers: number;
    weekNewUsers: number;
    monthNewUsers: number;
    usersWithProfile: number;
    generatedAt: Date;
}
export declare class UserDetailResponseDto {
    id: string;
    googleSub?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    displayName?: string | null;
    avatarUrl?: string | null;
    createdAt: Date;
    updatedAt: Date;
    profile?: {
        preferences?: any;
        createdAt?: Date;
        updatedAt?: Date;
    } | null;
    tripCount: number;
    collectionCount: number;
    likeCount: number;
}

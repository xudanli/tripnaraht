export declare class GetUsersQueryDto {
    page?: number;
    limit?: number;
    search?: string;
    emailVerified?: boolean;
}
export declare class UserResponseDto {
    id: string;
    googleSub?: string;
    email?: string;
    emailVerified?: boolean;
    displayName?: string;
    avatarUrl?: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare class UserListResponseDto {
    users: UserResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
export declare class UpdateUserDto {
    displayName?: string;
    email?: string;
    emailVerified?: boolean;
    avatarUrl?: string;
}

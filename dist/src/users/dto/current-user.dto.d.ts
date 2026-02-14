export declare class CurrentUserResponseDto {
    id: string;
    email?: string | null;
    emailVerified?: boolean | null;
    displayName?: string | null;
    avatarUrl?: string | null;
    googleSub?: string | null;
    createdAt: Date;
    updatedAt: Date;
}
export declare class UpdateCurrentUserDto {
    displayName?: string;
    avatarUrl?: string;
}
export declare class DeleteAccountDto {
    confirmText?: string;
}
export declare class DeleteAccountResponseDto {
    deleted: boolean;
    userId: string;
    deletedAt: Date;
}

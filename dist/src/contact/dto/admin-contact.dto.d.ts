export declare enum ContactMessageStatus {
    PENDING = "pending",
    READ = "read",
    REPLIED = "replied",
    RESOLVED = "resolved"
}
export declare class GetContactMessagesQueryDto {
    page?: number;
    limit?: number;
    status?: ContactMessageStatus;
    userId?: string;
    search?: string;
}
export declare class ContactMessageImageDto {
    id: string;
    filePath: string;
    fileName: string;
    fileSize: string;
    mimeType: string;
    createdAt: Date;
    fileUrl?: string;
}
export declare class ContactMessageResponseDto {
    id: string;
    userId?: string;
    message?: string;
    status: ContactMessageStatus;
    createdAt: Date;
    updatedAt: Date;
    images: ContactMessageImageDto[];
}
export declare class ContactMessageListResponseDto {
    messages: ContactMessageResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
export declare class UpdateContactMessageStatusDto {
    status: ContactMessageStatus;
}
export declare class ReplyContactMessageDto {
    reply: string;
}

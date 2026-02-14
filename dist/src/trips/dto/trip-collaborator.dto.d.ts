export declare enum CollaboratorRole {
    VIEWER = "VIEWER",
    EDITOR = "EDITOR",
    OWNER = "OWNER"
}
export declare class AddCollaboratorDto {
    email: string;
    role: CollaboratorRole;
}
export declare class CollaboratorResponseDto {
    id: string;
    tripId: string;
    userId: string;
    role: string;
    createdAt: Date;
}

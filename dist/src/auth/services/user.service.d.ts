import { PrismaService } from '../../prisma/prisma.service';
import { GoogleIdTokenPayload } from '../interfaces/google-token-payload.interface';
export interface UpsertUserResult {
    user: {
        id: string;
        googleSub: string | null;
        email: string | null;
        emailVerified: boolean | null;
        displayName: string | null;
        avatarUrl: string | null;
        createdAt: Date;
        updatedAt: Date;
    };
    isNewUser: boolean;
}
export declare class AuthUserService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    upsertUserFromGoogle(payload: GoogleIdTokenPayload): Promise<UpsertUserResult>;
    findUserById(userId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        email: string | null;
        googleSub: string | null;
        emailVerified: boolean | null;
        displayName: string | null;
        avatarUrl: string | null;
    }>;
    findUserByEmail(email: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        email: string | null;
        googleSub: string | null;
        emailVerified: boolean | null;
        displayName: string | null;
        avatarUrl: string | null;
    }>;
    createUserWithEmail(email: string, displayName?: string): Promise<UpsertUserResult>;
}

export declare class GoogleCodeDto {
    code: string;
}
export declare class GoogleIdTokenDto {
    idToken: string;
}
export declare class AuthResponseDto {
    user: {
        id: string;
        email: string | null;
        displayName: string | null;
        avatarUrl: string | null;
        emailVerified: boolean | null;
    };
    accessToken: string;
}
export declare class SendVerificationCodeDto {
    email: string;
}
export declare class RegisterWithEmailDto {
    email: string;
    code: string;
    displayName?: string;
}
export declare class LoginWithEmailDto {
    email: string;
    code: string;
}

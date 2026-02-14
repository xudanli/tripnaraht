import { Request } from 'express';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { GoogleOAuthService } from './services/google-oauth.service';
import { TokenService } from './services/token.service';
import { AuthUserService } from './services/user.service';
import { EmailVerificationService } from './services/email-verification.service';
import { GoogleCodeDto, GoogleIdTokenDto, AuthResponseDto, SendVerificationCodeDto, RegisterWithEmailDto, LoginWithEmailDto } from './dto/google-auth.dto';
export declare class AuthController {
    private googleOAuthService;
    private tokenService;
    private authUserService;
    private emailVerificationService;
    private configService;
    constructor(googleOAuthService: GoogleOAuthService, tokenService: TokenService, authUserService: AuthUserService, emailVerificationService: EmailVerificationService, configService: ConfigService);
    googleCode(dto: GoogleCodeDto, req: Request, res: Response): Promise<AuthResponseDto>;
    googleIdToken(dto: GoogleIdTokenDto, res: Response): Promise<AuthResponseDto>;
    refresh(res: Response): Promise<{
        accessToken: string;
    }>;
    logout(res: Response): Promise<{
        message: string;
    }>;
    sendVerificationCode(dto: SendVerificationCodeDto): Promise<{
        message: string;
    }>;
    registerWithEmail(dto: RegisterWithEmailDto, res: Response): Promise<AuthResponseDto>;
    loginWithEmail(dto: LoginWithEmailDto, res: Response): Promise<AuthResponseDto>;
}

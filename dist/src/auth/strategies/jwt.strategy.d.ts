import { ConfigService } from '@nestjs/config';
import { Strategy } from 'passport-jwt';
import { TripNaraAccessTokenPayload } from '../interfaces/google-token-payload.interface';
declare const JwtStrategy_base: new (...args: [opt: import("passport-jwt").StrategyOptionsWithoutRequest] | [opt: import("passport-jwt").StrategyOptionsWithRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class JwtStrategy extends JwtStrategy_base {
    private configService?;
    constructor(configService?: ConfigService);
    validate(payload: TripNaraAccessTokenPayload): Promise<{
        userId: string;
        email: string;
    }>;
}
export {};

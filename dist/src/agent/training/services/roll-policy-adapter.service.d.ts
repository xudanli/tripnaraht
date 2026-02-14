import { ConfigService } from '@nestjs/config';
import { PolicyInferenceRequest, PolicyInferenceResponse } from '../interfaces/training-platform.interface';
import { RollClientService } from './roll-client.service';
export declare class RollPolicyAdapterService {
    private readonly configService;
    private readonly rollClient?;
    private readonly logger;
    private readonly enabled;
    constructor(configService: ConfigService, rollClient?: RollClientService);
    predict(request: PolicyInferenceRequest, useFallback?: boolean): Promise<PolicyInferenceResponse>;
    private getFallbackResponse;
}

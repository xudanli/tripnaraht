import { RouteType, RouterReason, UIStatus } from '../interfaces/router.interface';
export declare class BudgetDto {
    max_seconds: number;
    max_steps: number;
    max_browser_steps: number;
}
export declare class UIHintDto {
    mode: 'fast' | 'slow';
    status: UIStatus;
    message: string;
}
export declare class RouterOutputDto {
    route: RouteType;
    confidence: number;
    reasons: RouterReason[];
    required_capabilities: string[];
    consent_required: boolean;
    budget: BudgetDto;
    ui_hint: UIHintDto;
}

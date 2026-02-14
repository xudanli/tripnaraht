declare class ViewportDto {
    width?: number;
    height?: number;
}
export declare class CreateSessionDto {
    url?: string;
    userAgent?: string;
    viewport?: ViewportDto;
}
export declare class NavigateDto {
    sessionId: string;
    url: string;
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
}
export declare class ScreenshotDto {
    sessionId: string;
    fullPage?: boolean;
    quality?: number;
}
export declare class ClickDto {
    sessionId: string;
    selector: string;
    waitForNavigation?: boolean;
}
export declare class EvaluateDto {
    sessionId: string;
    script: string;
}
export {};

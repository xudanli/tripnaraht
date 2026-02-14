#!/usr/bin/env node
interface TestResult {
    tool: string;
    success: boolean;
    error?: string;
    result?: any;
}
declare function testVisionMcp(): Promise<{
    success: boolean;
    results: TestResult[];
}>;
export { testVisionMcp };

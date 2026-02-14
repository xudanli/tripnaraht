import { PriceForecast } from '../interfaces/price-prediction.interface';
export declare class ProphetService {
    private readonly logger;
    private readonly pythonScriptPath;
    constructor();
    predict(historicalData: Array<{
        date: string;
        price: number;
    }>, startDate: string, periods?: number): Promise<PriceForecast[]>;
    private callPythonScript;
    private findPythonCommand;
    checkAvailability(): Promise<{
        available: boolean;
        message: string;
    }>;
}

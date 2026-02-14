import { VRPTWInput, VRPTWResult, PlaceNode } from '../interfaces/route-optimization.interface';
export declare class VRPTWOptimizerService {
    private readonly logger;
    solveVRPTW(input: VRPTWInput): Promise<VRPTWResult>;
    private validateInput;
    private greedyConstruction;
    private localSearch;
    private isBetterRoute;
    private calculateTotalTravelTime;
    private calculateSchedule;
    buildVRPTWInput(places: PlaceNode[], timeMatrix: number[][], startTime: string, date: string): VRPTWInput;
}

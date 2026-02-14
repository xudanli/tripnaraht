import { TerrainFacts } from '../types/terrain-facts.types';
export declare class TerrainRiskService {
    evaluateRisks(terrainFacts: TerrainFacts): TerrainFacts['riskFlags'];
    private calculateSeverity;
}

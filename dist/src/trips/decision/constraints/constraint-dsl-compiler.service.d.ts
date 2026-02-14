import { ConstraintDSL } from './constraint-dsl.types';
import { TripWorldState } from '../world-model';
export interface CompiledConstraints {
    hardConstraints: Record<string, any>;
    softConstraints: Record<string, any>;
    objectives: Record<string, any>;
}
export declare class ConstraintDSLCompiler {
    private readonly logger;
    compile(dsl: ConstraintDSL | any, state: TripWorldState): CompiledConstraints;
    private isLegacyFormat;
    private compileNewFormat;
    private compileHardConstraints;
    private compileSoftConstraints;
    private extractObjectives;
    private compileLegacyFormat;
    private getPaceMultiplier;
}

import { ReadinessPack } from '../types/readiness-pack.types';
import { PackStorageService } from './pack-storage.service';
export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}
export interface ValidationError {
    path: string;
    message: string;
    code: string;
}
export interface ValidationWarning {
    path: string;
    message: string;
    code: string;
}
export declare class PackValidatorService {
    private readonly packStorage;
    private readonly logger;
    constructor(packStorage: PackStorageService);
    validate(pack: ReadinessPack): ValidationResult;
    private validateBasicStructure;
    private validateRules;
    private validateCondition;
    private validateChecklists;
    private validateHazards;
    private validateGeo;
    private validateUserDecision;
    private validateDecisionBranch;
}

import { SkillInputSchema, ParameterTypeCheck } from '../../skills/interfaces/skill.interface';
export interface SchemaGenerationOptions {
    extractFromJSDoc?: boolean;
    includeOptional?: boolean;
    typeMappings?: Record<string, ParameterTypeCheck['type']>;
}
export declare class SkillInputSchemaGeneratorService {
    private readonly logger;
    generateFromSource(sourceCode: string, interfaceName: string, options?: SchemaGenerationOptions): SkillInputSchema | null;
    generateFromDefinition(interfaceDefinition: Record<string, {
        type: string;
        required?: boolean;
        jsdoc?: string;
        defaultValue?: any;
    }>, options?: SchemaGenerationOptions): SkillInputSchema;
    private extractTypeCheckFromDefinition;
    private mapTypeToSchemaType;
    private parseJSDocRules;
    private findInterface;
    private extractSchemaFromInterface;
    private extractTypeInfo;
    private getJSDocComment;
}

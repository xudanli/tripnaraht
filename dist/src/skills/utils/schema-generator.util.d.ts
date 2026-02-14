import 'reflect-metadata';
import { z } from 'zod';
export declare function convertDtoToZod(DtoClass: any): z.ZodObject<any>;
export declare function convertDtoToMcpSchema(DtoClass: any, description?: string): Record<string, z.ZodTypeAny>;
export declare function generateBasicSchemaFromInterface(interfaceDefinition: Record<string, any>): Record<string, z.ZodTypeAny>;

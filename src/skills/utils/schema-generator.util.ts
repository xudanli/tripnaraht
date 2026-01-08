// src/skills/utils/schema-generator.util.ts
/**
 * Schema Generator Utility
 * 
 * 将 class-validator DTO 自动转换为 JSON Schema (用于 MCP)
 * 
 * 支持以下转换：
 * - @IsString() -> { type: 'string' }
 * - @IsNumber() -> { type: 'number' }
 * - @IsBoolean() -> { type: 'boolean' }
 * - @IsArray() -> { type: 'array', items: {...} }
 * - @IsOptional() -> 添加到父对象的 required 数组中（或标记为 optional）
 * - @IsEnum() -> { enum: [...] }
 * - @Min(), @Max() -> { minimum, maximum }
 * - @Length() -> { minLength, maxLength }
 * - @IsDateString() -> { type: 'string', format: 'date-time' }
 */

import 'reflect-metadata';
import { z } from 'zod';

// 类型定义（class-validator 的 MetadataStorage 可能在运行时才可用）
interface ValidationMetadata {
  type: string;
  propertyName?: string;
  constraints?: any[];
  target?: any;
}

// 简化版本：直接使用 TypeScript 类型信息和手动定义的 Schema
// 如果需要完整支持 class-validator，可以考虑使用 @nestjs/swagger 的 Schema 生成功能

/**
 * 从 @Type() 装饰器中获取嵌套类型
 */
function getNestedType(proto: any, propertyName: string): any {
  // class-transformer 的 @Type() 装饰器使用 'design:type' 和自定义元数据
  // 尝试获取 @Type() 装饰器指定的类型
  try {
    const typeMetadata = Reflect.getMetadata('design:type', proto, propertyName);
    
    // 检查是否有 @Type() 装饰器的自定义元数据
    const transformerMetadata = Reflect.getMetadata('__transformer_metadata__', proto, propertyName);
    if (transformerMetadata?.type) {
      return transformerMetadata.type;
    }
    
    // 尝试从 class-transformer 的元数据中获取
    const typeTransformKey = 'design:type';
    const typeTransform = Reflect.getMetadata(typeTransformKey, proto, propertyName);
    if (typeTransform && typeof typeTransform === 'function') {
      return typeTransform;
    }
    
    return typeMetadata;
  } catch (error) {
    return undefined;
  }
}

// 辅助函数：将 class-validator 元数据转换为 Zod schema
function convertValidatorMetadataToZod(
  propertyName: string,
  metadatas: ValidationMetadata[],
  propertyType: any,
  proto?: any, // 添加 proto 参数用于获取嵌套类型
): z.ZodTypeAny {
  let schema: z.ZodTypeAny;

  // 判断基础类型
  const isOptional = metadatas.some(m => m.type === 'isOptional' || m.type === 'conditionalValidation');
  
  // 检查是否是嵌套对象（@ValidateNested() + @Type()）
  const isNested = metadatas.some(m => m.type === 'nestedValidation');
  if (isNested && proto) {
    // 尝试获取嵌套类型
    const nestedType = getNestedType(proto, propertyName);
    if (nestedType && typeof nestedType === 'function') {
      // 递归转换嵌套 DTO
      schema = convertDtoToZod(nestedType);
      if (isOptional) {
        schema = schema.optional();
      }
      return schema;
    }
  }
  
  // 检查是否是数组（可能包含嵌套对象）
  const isArray = metadatas.some(m => m.type === 'isArray' || m.type === 'arrayContains' || m.type === 'arrayMinSize' || m.type === 'arrayMaxSize');
  if (isArray) {
    // 尝试获取数组元素的类型
    let arrayItemType = propertyType;
    if (proto) {
      const nestedType = getNestedType(proto, propertyName);
      if (nestedType && typeof nestedType === 'function') {
        arrayItemType = nestedType;
      }
    }
    
    // 如果数组元素是自定义类型，递归转换
    if (arrayItemType && typeof arrayItemType === 'function' && arrayItemType !== Array && arrayItemType !== Object) {
      schema = z.array(convertDtoToZod(arrayItemType));
    } else {
      // 默认数组元素类型（可以根据实际需求调整）
      schema = z.array(z.any());
    }
    
    // 检查数组长度限制
    const arrayMinSize = metadatas.find(m => m.type === 'arrayMinSize')?.constraints?.[0];
    const arrayMaxSize = metadatas.find(m => m.type === 'arrayMaxSize')?.constraints?.[0];
    if (arrayMinSize !== undefined) {
      schema = (schema as z.ZodArray<any>).min(arrayMinSize);
    }
    if (arrayMaxSize !== undefined) {
      schema = (schema as z.ZodArray<any>).max(arrayMaxSize);
    }
    
    if (isOptional) {
      schema = schema.optional();
    }
    return schema;
  }
  
  // 类型判断
  if (propertyType === String || propertyType === 'string') {
    schema = z.string();
    
    // 检查枚举
    const enumMetadata = metadatas.find(m => m.type === 'isEnum');
    if (enumMetadata?.constraints?.[0]) {
      schema = z.enum(enumMetadata.constraints[0]);
    }
    
    // 检查长度限制
    const lengthMetadata = metadatas.find(m => m.type === 'length');
    if (lengthMetadata?.constraints) {
      const [min, max] = lengthMetadata.constraints;
      if (min !== undefined) schema = (schema as z.ZodString).min(min);
      if (max !== undefined) schema = (schema as z.ZodString).max(max);
    }
    
    // 检查日期字符串
    const isDateString = metadatas.some(m => m.type === 'isDateString');
    if (isDateString) {
      schema = z.string().datetime().or(z.string().date()); // 支持 date-time 或 date
    }
    
    // 检查正则表达式
    const matchesMetadata = metadatas.find(m => m.type === 'matches');
    if (matchesMetadata?.constraints?.[0]) {
      schema = (schema as z.ZodString).regex(new RegExp(matchesMetadata.constraints[0]));
    }
    
  } else if (propertyType === Number || propertyType === 'number') {
    schema = z.number();
    
    // 检查最小值
    const minMetadata = metadatas.find(m => m.type === 'min');
    if (minMetadata?.constraints?.[0] !== undefined) {
      schema = (schema as z.ZodNumber).min(minMetadata.constraints[0]);
    }
    
    // 检查最大值
    const maxMetadata = metadatas.find(m => m.type === 'max');
    if (maxMetadata?.constraints?.[0] !== undefined) {
      schema = (schema as z.ZodNumber).max(maxMetadata.constraints[0]);
    }
    
  } else if (propertyType === Boolean || propertyType === 'boolean') {
    schema = z.boolean();
    
  } else if (propertyType === Array || Array.isArray(propertyType)) {
    // 数组类型 - 需要递归处理 items
    const arrayItemType = Array.isArray(propertyType) ? propertyType[0] : String;
    const arrayMetadatas = metadatas.filter(m => m.type.startsWith('array'));
    
    // 简化处理：假设数组元素是字符串（可以扩展）
    schema = z.array(z.string());
    
    // 检查数组长度
    const arrayLengthMetadata = metadatas.find(m => m.type === 'arrayLength');
    if (arrayLengthMetadata?.constraints) {
      const [min, max] = arrayLengthMetadata.constraints;
      if (min !== undefined) schema = (schema as z.ZodArray<any>).min(min);
      if (max !== undefined) schema = (schema as z.ZodArray<any>).max(max);
    }
    
  } else if (typeof propertyType === 'function' && propertyType !== Object && propertyType !== Array) {
    // 自定义类型 - 递归转换
    schema = convertDtoToZod(propertyType);
    
  } else {
    // 默认：any
    schema = z.any();
  }
  
  // 应用可选修饰符
  if (isOptional) {
    schema = schema.optional();
  }
  
  return schema;
}

/**
 * 将 DTO 类转换为 Zod Schema
 * 
 * @param DtoClass DTO 类（使用 class-validator 装饰器）
 * @returns Zod Schema 对象
 */
export function convertDtoToZod(DtoClass: any): z.ZodObject<any> {
  // 尝试获取 class-validator 的 MetadataStorage（可能不可用）
  let targetMetadata: ValidationMetadata[] = [];
  try {
    // 动态导入 class-validator（可能失败）
    const { MetadataStorage } = require('class-validator');
    const metadataStorage = MetadataStorage.getMetadataStorage();
    targetMetadata = metadataStorage.getTargetValidationMetadatas(DtoClass, '', false, false) || [];
  } catch (error) {
    // 如果 class-validator 不可用，使用 TypeScript 类型信息
    console.warn('class-validator MetadataStorage 不可用，使用基础类型推断');
  }
  
  const shape: Record<string, z.ZodTypeAny> = {};
  
  // 按属性分组元数据
  const propertiesMap = new Map<string, ValidationMetadata[]>();
  targetMetadata.forEach((metadata) => {
    if (metadata.propertyName) {
      if (!propertiesMap.has(metadata.propertyName)) {
        propertiesMap.set(metadata.propertyName, []);
      }
      propertiesMap.get(metadata.propertyName)!.push(metadata);
    }
  });
  
  // 获取类的所有属性名（通过原型链）
  const proto = DtoClass.prototype;
  const propertyNames = new Set<string>();
  
  // 从元数据中获取属性名
  propertiesMap.forEach((_, name) => propertyNames.add(name));
  
  // 尝试从原型中获取属性名（作为备选）
  if (propertyNames.size === 0) {
    for (const key in proto) {
      if (key !== 'constructor' && typeof proto[key] !== 'function') {
        propertyNames.add(key);
      }
    }
  }
  
  // 转换每个属性
  propertyNames.forEach((propertyName) => {
    const metadatas = propertiesMap.get(propertyName) || [];
    
    // 尝试获取属性类型
    let propertyType = Reflect.getMetadata('design:type', proto, propertyName);
    
    // 如果找不到类型，尝试从 @Type() 装饰器获取
    if (!propertyType || propertyType === Object) {
      const nestedType = getNestedType(proto, propertyName);
      if (nestedType) {
        propertyType = nestedType;
      } else {
        propertyType = String; // 默认字符串类型
      }
    }
    
    shape[propertyName] = convertValidatorMetadataToZod(propertyName, metadatas, propertyType, proto);
  });
  
  return z.object(shape);
}

/**
 * 将 DTO 类转换为 MCP Schema (Zod format)
 * 
 * @param DtoClass DTO 类
 * @param description 可选的描述
 * @returns Zod Schema 对象（可以直接用于 MCP）
 */
export function convertDtoToMcpSchema(DtoClass: any, description?: string): Record<string, z.ZodTypeAny> {
  const zodSchema = convertDtoToZod(DtoClass);
  
  // 如果 MCP Schema 需要特定格式，可以在这里转换
  // 目前直接返回 Zod Schema（MCP SDK 支持 Zod）
  return zodSchema.shape;
}

/**
 * 简化版本：基于 TypeScript 接口生成基础 Schema
 * 
 * 如果 DTO 没有使用 class-validator，可以使用这个简化版本
 */
export function generateBasicSchemaFromInterface(interfaceDefinition: Record<string, any>): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  
  for (const [key, value] of Object.entries(interfaceDefinition)) {
    if (value === String || typeof value === 'string') {
      shape[key] = z.string().optional();
    } else if (value === Number || typeof value === 'number') {
      shape[key] = z.number().optional();
    } else if (value === Boolean || typeof value === 'boolean') {
      shape[key] = z.boolean().optional();
    } else if (Array.isArray(value)) {
      shape[key] = z.array(z.any()).optional();
    } else if (typeof value === 'object') {
      shape[key] = z.object(generateBasicSchemaFromInterface(value)).optional();
    } else {
      shape[key] = z.any().optional();
    }
  }
  
  return shape;
}

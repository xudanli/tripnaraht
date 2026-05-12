// src/agent/services/skill-input-schema-generator.service.ts
/**
 * Skill Input Schema 自动生成服务
 * 
 * 从 TypeScript 接口定义自动生成 inputSchema
 * 支持从接口属性和 JSDoc 注释中提取验证规则
 */

import { Injectable, Logger } from '@nestjs/common';
import { SkillInputSchema, ParameterTypeCheck } from '../../skills/interfaces/skill.interface';
import * as ts from 'typescript';

export interface SchemaGenerationOptions {
  /** 是否从 JSDoc 注释提取验证规则 */
  extractFromJSDoc?: boolean;
  /** 是否包含可选参数 */
  includeOptional?: boolean;
  /** 自定义类型映射 */
  typeMappings?: Record<string, ParameterTypeCheck['type']>;
}

@Injectable()
export class SkillInputSchemaGeneratorService {
  private readonly logger = new Logger(SkillInputSchemaGeneratorService.name);

  /**
   * 从 TypeScript 源代码生成 inputSchema
   * 
   * @param sourceCode TypeScript 源代码
   * @param interfaceName 接口名称（如 'ItineraryGenerateInput'）
   * @param options 生成选项
   * @returns 生成的 inputSchema
   */
  generateFromSource(
    sourceCode: string,
    interfaceName: string,
    options: SchemaGenerationOptions = {},
  ): SkillInputSchema | null {
    try {
      // 1. 解析 TypeScript 源代码
      const sourceFile = ts.createSourceFile(
        'temp.ts',
        sourceCode,
        ts.ScriptTarget.Latest,
        true,
      );

      // 2. 查找目标接口
      const interfaceNode = this.findInterface(sourceFile, interfaceName);
      if (!interfaceNode) {
        this.logger.warn(`接口 ${interfaceName} 未找到`);
        return null;
      }

      // 3. 提取验证规则
      return this.extractSchemaFromInterface(interfaceNode, options);
    } catch (error: any) {
      this.logger.error(`生成 inputSchema 失败: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * 从接口定义对象生成 inputSchema（简化版本，不依赖 TypeScript 编译器）
   * 
   * @param interfaceDefinition 接口定义对象（包含属性名和类型信息）
   * @param options 生成选项
   * @returns 生成的 inputSchema
   */
  generateFromDefinition(
    interfaceDefinition: Record<string, {
      type: string;
      required?: boolean;
      jsdoc?: string;
      defaultValue?: any;
    }>,
    options: SchemaGenerationOptions = {},
  ): SkillInputSchema {
    const schema: SkillInputSchema = {
      required: [],
      typeChecks: {},
    };

    for (const [paramName, paramDef] of Object.entries(interfaceDefinition)) {
      // 1. 检查是否必需
      if (paramDef.required !== false) {
        schema.required = schema.required || [];
        schema.required.push(paramName);
      }

      // 2. 提取类型检查规则
      const typeCheck = this.extractTypeCheckFromDefinition(paramDef, options);
      if (typeCheck) {
        schema.typeChecks = schema.typeChecks || {};
        schema.typeChecks[paramName] = typeCheck;
      }
    }

    return schema;
  }

  /**
   * 从接口定义中提取类型检查规则
   */
  private extractTypeCheckFromDefinition(
    paramDef: {
      type: string;
      jsdoc?: string;
      defaultValue?: any;
    },
    options: SchemaGenerationOptions,
  ): ParameterTypeCheck | null {
    const typeCheck: ParameterTypeCheck = {
      type: this.mapTypeToSchemaType(paramDef.type, options.typeMappings),
    };

    // 从 JSDoc 注释中提取验证规则
    if (options.extractFromJSDoc && paramDef.jsdoc) {
      const jsdocRules = this.parseJSDocRules(paramDef.jsdoc);
      Object.assign(typeCheck, jsdocRules);
    }

    return typeCheck;
  }

  /**
   * 映射 TypeScript 类型到 Schema 类型
   */
  private mapTypeToSchemaType(
    tsType: string,
    customMappings?: Record<string, ParameterTypeCheck['type']>,
  ): ParameterTypeCheck['type'] {
    // 自定义映射优先
    if (customMappings && customMappings[tsType]) {
      return customMappings[tsType];
    }

    // 默认映射
    const lowerType = tsType.toLowerCase();
    if (lowerType.includes('string')) return 'string';
    if (lowerType.includes('number')) return 'number';
    if (lowerType.includes('boolean')) return 'boolean';
    if (lowerType.includes('array') || lowerType.includes('[]')) return 'array';
    if (lowerType.includes('object') || lowerType.includes('record')) return 'object';

    return 'string'; // 默认
  }

  /**
   * 从 JSDoc 注释中解析验证规则
   * 
   * 支持的注释格式：
   * - @min 0
   * - @max 100
   * - @minLength 1
   * - @maxLength 10
   * - @format email
   * - @enum ['option1', 'option2']
   */
  private parseJSDocRules(jsdoc: string): Partial<ParameterTypeCheck> {
    const rules: Partial<ParameterTypeCheck> = {};

    // 提取 @min
    const minMatch = jsdoc.match(/@min\s+(\d+)/);
    if (minMatch) {
      rules.min = parseInt(minMatch[1], 10);
    }

    // 提取 @max
    const maxMatch = jsdoc.match(/@max\s+(\d+)/);
    if (maxMatch) {
      rules.max = parseInt(maxMatch[1], 10);
    }

    // 提取 @minLength
    const minLengthMatch = jsdoc.match(/@minLength\s+(\d+)/);
    if (minLengthMatch) {
      rules.minLength = parseInt(minLengthMatch[1], 10);
    }

    // 提取 @maxLength
    const maxLengthMatch = jsdoc.match(/@maxLength\s+(\d+)/);
    if (maxLengthMatch) {
      rules.maxLength = parseInt(maxLengthMatch[1], 10);
    }

    // 提取 @format
    const formatMatch = jsdoc.match(/@format\s+(\w+)/);
    const formatToken = formatMatch?.[1];
    if (formatToken && ['email', 'url', 'date', 'date-time', 'uuid'].includes(formatToken)) {
      rules.format = formatToken as ParameterTypeCheck['format'];
    }

    // 提取 @enum
    const enumMatch = jsdoc.match(/@enum\s+\[(.*?)\]/);
    if (enumMatch) {
      const enumValues = enumMatch[1]
        .split(',')
        .map(v => v.trim().replace(/['"]/g, ''))
        .filter(v => v);
      if (enumValues.length > 0) {
        rules.enum = enumValues;
      }
    }

    return rules;
  }

  /**
   * 查找接口节点
   */
  private findInterface(
    sourceFile: ts.SourceFile,
    interfaceName: string,
  ): ts.InterfaceDeclaration | null {
    let found: ts.InterfaceDeclaration | null = null;

    const visit = (node: ts.Node) => {
      if (
        ts.isInterfaceDeclaration(node) &&
        node.name.text === interfaceName
      ) {
        found = node;
        return;
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return found;
  }

  /**
   * 从接口节点提取 Schema
   */
  private extractSchemaFromInterface(
    interfaceNode: ts.InterfaceDeclaration,
    options: SchemaGenerationOptions,
  ): SkillInputSchema {
    const schema: SkillInputSchema = {
      required: [],
      typeChecks: {},
    };

    // 遍历接口属性
    interfaceNode.members.forEach(member => {
      if (ts.isPropertySignature(member) && member.name) {
        const propName = member.name.getText();
        const isOptional = member.questionToken !== undefined;

        // 提取类型信息
        const typeInfo = this.extractTypeInfo(member, options);

        // 检查是否必需
        if (!isOptional && options.includeOptional !== false) {
          schema.required = schema.required || [];
          schema.required.push(propName);
        }

        // 提取类型检查规则
        if (typeInfo) {
          schema.typeChecks = schema.typeChecks || {};
          schema.typeChecks[propName] = typeInfo;
        }
      }
    });

    return schema;
  }

  /**
   * 从属性签名提取类型信息
   */
  private extractTypeInfo(
    member: ts.PropertySignature,
    options: SchemaGenerationOptions,
  ): ParameterTypeCheck | null {
    const typeCheck: ParameterTypeCheck = {
      type: 'string', // 默认
    };

    // 提取类型
    if (member.type) {
      const typeText = member.type.getText();
      typeCheck.type = this.mapTypeToSchemaType(typeText, options.typeMappings);
    }

    // 从 JSDoc 注释提取验证规则
    if (options.extractFromJSDoc) {
      const jsdoc = this.getJSDocComment(member);
      if (jsdoc) {
        const jsdocRules = this.parseJSDocRules(jsdoc);
        Object.assign(typeCheck, jsdocRules);
      }
    }

    return typeCheck;
  }

  /**
   * 获取 JSDoc 注释文本
   */
  private getJSDocComment(node: ts.Node): string | null {
    const jsdocTags = ts.getJSDocTags(node);
    if (jsdocTags.length === 0) {
      return null;
    }

    // 尝试从注释中提取文本
    const sourceFile = node.getSourceFile();
    const fullText = sourceFile.getFullText();
    
    // 查找节点前的注释
    const nodeStart = node.getFullStart();
    const commentRanges = ts.getLeadingCommentRanges(fullText, nodeStart);
    
    if (commentRanges && commentRanges.length > 0) {
      const comments = commentRanges
        .map(range => fullText.substring(range.pos, range.end))
        .join('\n');
      return comments;
    }

    return null;
  }
}

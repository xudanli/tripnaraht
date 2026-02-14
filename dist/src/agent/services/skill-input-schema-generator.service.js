"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var SkillInputSchemaGeneratorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillInputSchemaGeneratorService = void 0;
const common_1 = require("@nestjs/common");
const ts = __importStar(require("typescript"));
let SkillInputSchemaGeneratorService = SkillInputSchemaGeneratorService_1 = class SkillInputSchemaGeneratorService {
    constructor() {
        this.logger = new common_1.Logger(SkillInputSchemaGeneratorService_1.name);
    }
    generateFromSource(sourceCode, interfaceName, options = {}) {
        try {
            const sourceFile = ts.createSourceFile('temp.ts', sourceCode, ts.ScriptTarget.Latest, true);
            const interfaceNode = this.findInterface(sourceFile, interfaceName);
            if (!interfaceNode) {
                this.logger.warn(`接口 ${interfaceName} 未找到`);
                return null;
            }
            return this.extractSchemaFromInterface(interfaceNode, options);
        }
        catch (error) {
            this.logger.error(`生成 inputSchema 失败: ${error.message}`, error.stack);
            return null;
        }
    }
    generateFromDefinition(interfaceDefinition, options = {}) {
        const schema = {
            required: [],
            typeChecks: {},
        };
        for (const [paramName, paramDef] of Object.entries(interfaceDefinition)) {
            if (paramDef.required !== false) {
                schema.required = schema.required || [];
                schema.required.push(paramName);
            }
            const typeCheck = this.extractTypeCheckFromDefinition(paramDef, options);
            if (typeCheck) {
                schema.typeChecks = schema.typeChecks || {};
                schema.typeChecks[paramName] = typeCheck;
            }
        }
        return schema;
    }
    extractTypeCheckFromDefinition(paramDef, options) {
        const typeCheck = {
            type: this.mapTypeToSchemaType(paramDef.type, options.typeMappings),
        };
        if (options.extractFromJSDoc && paramDef.jsdoc) {
            const jsdocRules = this.parseJSDocRules(paramDef.jsdoc);
            Object.assign(typeCheck, jsdocRules);
        }
        return typeCheck;
    }
    mapTypeToSchemaType(tsType, customMappings) {
        if (customMappings && customMappings[tsType]) {
            return customMappings[tsType];
        }
        const lowerType = tsType.toLowerCase();
        if (lowerType.includes('string'))
            return 'string';
        if (lowerType.includes('number'))
            return 'number';
        if (lowerType.includes('boolean'))
            return 'boolean';
        if (lowerType.includes('array') || lowerType.includes('[]'))
            return 'array';
        if (lowerType.includes('object') || lowerType.includes('record'))
            return 'object';
        return 'string';
    }
    parseJSDocRules(jsdoc) {
        const rules = {};
        const minMatch = jsdoc.match(/@min\s+(\d+)/);
        if (minMatch) {
            rules.min = parseInt(minMatch[1], 10);
        }
        const maxMatch = jsdoc.match(/@max\s+(\d+)/);
        if (maxMatch) {
            rules.max = parseInt(maxMatch[1], 10);
        }
        const minLengthMatch = jsdoc.match(/@minLength\s+(\d+)/);
        if (minLengthMatch) {
            rules.minLength = parseInt(minLengthMatch[1], 10);
        }
        const maxLengthMatch = jsdoc.match(/@maxLength\s+(\d+)/);
        if (maxLengthMatch) {
            rules.maxLength = parseInt(maxLengthMatch[1], 10);
        }
        const formatMatch = jsdoc.match(/@format\s+(\w+)/);
        if (formatMatch) {
            const format = formatMatch[1];
            if (['email', 'url', 'date', 'date-time', 'uuid'].includes(format)) {
                rules.format = format;
            }
        }
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
    findInterface(sourceFile, interfaceName) {
        let found = null;
        const visit = (node) => {
            if (ts.isInterfaceDeclaration(node) &&
                node.name.text === interfaceName) {
                found = node;
                return;
            }
            ts.forEachChild(node, visit);
        };
        visit(sourceFile);
        return found;
    }
    extractSchemaFromInterface(interfaceNode, options) {
        const schema = {
            required: [],
            typeChecks: {},
        };
        interfaceNode.members.forEach(member => {
            if (ts.isPropertySignature(member) && member.name) {
                const propName = member.name.getText();
                const isOptional = member.questionToken !== undefined;
                const typeInfo = this.extractTypeInfo(member, options);
                if (!isOptional && options.includeOptional !== false) {
                    schema.required = schema.required || [];
                    schema.required.push(propName);
                }
                if (typeInfo) {
                    schema.typeChecks = schema.typeChecks || {};
                    schema.typeChecks[propName] = typeInfo;
                }
            }
        });
        return schema;
    }
    extractTypeInfo(member, options) {
        const typeCheck = {
            type: 'string',
        };
        if (member.type) {
            const typeText = member.type.getText();
            typeCheck.type = this.mapTypeToSchemaType(typeText, options.typeMappings);
        }
        if (options.extractFromJSDoc) {
            const jsdoc = this.getJSDocComment(member);
            if (jsdoc) {
                const jsdocRules = this.parseJSDocRules(jsdoc);
                Object.assign(typeCheck, jsdocRules);
            }
        }
        return typeCheck;
    }
    getJSDocComment(node) {
        const jsdocTags = ts.getJSDocTags(node);
        if (jsdocTags.length === 0) {
            return null;
        }
        const sourceFile = node.getSourceFile();
        const fullText = sourceFile.getFullText();
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
};
exports.SkillInputSchemaGeneratorService = SkillInputSchemaGeneratorService;
exports.SkillInputSchemaGeneratorService = SkillInputSchemaGeneratorService = SkillInputSchemaGeneratorService_1 = __decorate([
    (0, common_1.Injectable)()
], SkillInputSchemaGeneratorService);
//# sourceMappingURL=skill-input-schema-generator.service.js.map
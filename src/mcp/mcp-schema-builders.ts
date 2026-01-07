// src/mcp/mcp-schema-builders.ts
/**
 * MCP Schema Builders
 * 
 * 为每个 Skill 生成准确的 JSON Schema
 */

import { z } from 'zod';

export function buildDemGetProfileSchema() {
  return {
    type: 'object',
    properties: {
      polyline: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            lat: { type: 'number' },
            lng: { type: 'number' },
          },
          required: ['lat', 'lng'],
        },
        description: '路线点数组（polyline）',
      },
      samples: {
        type: 'number',
        description: '采样间隔（米），默认 100',
        default: 100,
      },
    },
    required: ['polyline'],
  };
}

export function buildDecisionAbuCheckSchema() {
  return {
    type: 'object',
    properties: {
      world: {
        type: 'object',
        description: '世界模型上下文（包含 physical, human, routeDirection）',
      },
      candidatePlan: {
        type: 'object',
        description: '候选计划',
      },
    },
    required: ['world', 'candidatePlan'],
  };
}

export function buildDecisionDrdrePaceSchema() {
  return {
    type: 'object',
    properties: {
      world: {
        type: 'object',
        description: '世界模型上下文',
      },
      draftPlan: {
        type: 'object',
        description: '草案计划',
      },
    },
    required: ['world', 'draftPlan'],
  };
}

export function buildDecisionNeptuneRepairSchema() {
  return {
    type: 'object',
    properties: {
      world: {
        type: 'object',
        description: '世界模型上下文',
      },
      brokenPlan: {
        type: 'object',
        description: '损坏的计划',
      },
      issue: {
        type: 'string',
        description: '问题描述（可选）',
      },
    },
    required: ['world', 'brokenPlan'],
  };
}

export function buildRouteDirectionPickForIntentSchema() {
  return {
    type: 'object',
    properties: {
      countryCode: {
        type: 'string',
        description: '国家代码（ISO 3166-1 alpha-2）',
        pattern: '^[A-Z]{2}$',
      },
      season: {
        type: 'number',
        description: '季节（月份 1-12）',
        minimum: 1,
        maximum: 12,
      },
      userIntentTags: {
        type: 'array',
        items: { type: 'string' },
        description: '用户意图标签',
      },
      userIntent: {
        type: 'object',
        description: '其他用户意图参数（可选）',
        properties: {
          preferences: { type: 'array', items: { type: 'string' } },
          pace: { type: 'string', enum: ['relaxed', 'moderate', 'intense'] },
          riskTolerance: { type: 'string', enum: ['low', 'medium', 'high'] },
          durationDays: { type: 'number' },
        },
      },
    },
    required: ['countryCode', 'season', 'userIntentTags'],
  };
}

export function buildReadinessGenerateChecklistSchema() {
  return {
    type: 'object',
    properties: {
      world: {
        type: 'object',
        description: '世界模型上下文',
      },
      routeDirection: {
        type: 'object',
        description: '路线方向（可选）',
      },
      userProfile: {
        type: 'object',
        description: '用户画像（可选）',
        properties: {
          nationality: { type: 'string' },
          residencyCountry: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
      plan: {
        type: 'object',
        description: '行程计划（可选）',
      },
    },
    required: ['world'],
  };
}

export function buildCountryPackNewSkeletonSchema() {
  return {
    type: 'object',
    properties: {
      countryCode: {
        type: 'string',
        description: '国家代码（ISO 3166-1 alpha-2）',
        pattern: '^[A-Z]{2}$',
      },
      countryName: {
        type: 'string',
        description: '国家名称',
      },
      countryNameCN: {
        type: 'string',
        description: '国家中文名称（可选）',
      },
      packType: {
        type: 'string',
        enum: ['readiness', 'routeDirection'],
        description: 'Pack 类型',
      },
      regions: {
        type: 'array',
        items: { type: 'string' },
        description: '区域列表（可选，用于 RouteDirection）',
      },
      supportedSeasons: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['polar_night', 'polar_day', 'shoulder', 'winter', 'summer', 'rainy', 'dry', 'hurricane', 'monsoon', 'all'],
        },
        description: '支持的季节（可选，用于 ReadinessPack）',
      },
    },
    required: ['countryCode', 'countryName', 'packType'],
  };
}

export function buildCountryPackValidateSchema() {
  return {
    type: 'object',
    properties: {
      pack: {
        type: 'object',
        description: 'Pack 数据（ReadinessPack 或 ImportCountryPackDto）',
      },
      packType: {
        type: 'string',
        enum: ['readiness', 'routeDirection'],
        description: 'Pack 类型',
      },
    },
    required: ['pack', 'packType'],
  };
}

export function buildCountryPackGenerateRegressionTestsSchema() {
  return {
    type: 'object',
    properties: {
      pack: {
        type: 'object',
        description: 'Pack 数据',
      },
      packType: {
        type: 'string',
        enum: ['readiness', 'routeDirection'],
        description: 'Pack 类型',
      },
      testScenarios: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            context: { type: 'object' },
            expectedOutcomes: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
        description: '测试场景（可选，默认生成标准场景）',
      },
    },
    required: ['pack', 'packType'],
  };
}

export function getSchemaForSkill(skillName: string): any {
  const schemaMap: Record<string, () => any> = {
    'dem.getProfile': buildDemGetProfileSchema,
    'decision.abuCheck': buildDecisionAbuCheckSchema,
    'decision.drdrePace': buildDecisionDrdrePaceSchema,
    'decision.neptuneRepair': buildDecisionNeptuneRepairSchema,
    'routeDirection.pickForIntent': buildRouteDirectionPickForIntentSchema,
    'readiness.generateChecklist': buildReadinessGenerateChecklistSchema,
    'countryPack.newSkeleton': buildCountryPackNewSkeletonSchema,
    'countryPack.validate': buildCountryPackValidateSchema,
    'countryPack.generateRegressionTests': buildCountryPackGenerateRegressionTestsSchema,
  };

  const builder = schemaMap[skillName];
  if (!builder) {
    // 默认 schema
    return {
      type: 'object',
      properties: {},
      required: [],
    };
  }

  return builder();
}


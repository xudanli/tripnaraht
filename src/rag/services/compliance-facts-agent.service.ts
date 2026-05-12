// src/rag/services/compliance-facts-agent.service.ts
/**
 * Compliance Facts Agent（合规/票规 Agent）
 * 
 * 用途：
 * - 定期或按需读取：Eurail/Interrail 条款、国家公园/山路公告、铁路公司官网 FAQ
 * - 提取结构化规则：RailPassRule[] / TrailAccessRule[] / PermitRequirement[]
 * - 写入：ComplianceEvidence 表
 * 
 * 关键点：RAG 在这里是"自动读说明书 + 帮你填配置"的工具，不是 runtime 直接说"可以/不可以"
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import type { DecisionContextV0 } from '../../trips/reality-kernel/decision-context.types';
import type { ChunkRetrievalParams } from './chunk-retrieval.service';
import { ChunkRetrievalService } from './chunk-retrieval.service';
import { LlmExtractionService } from './llm-extraction.service';
import { RagRealityPolicyGateService } from './rag-reality-policy-gate.service';

/**
 * Rail Pass 规则
 */
export interface RailPassRule {
  passType: 'EURAIL_GLOBAL' | 'EURAIL_ONE_COUNTRY' | 'INTERRAIL_GLOBAL' | 'INTERRAIL_ONE_COUNTRY';
  eligibleTraveler: {
    regions: string[];
    citizenship?: string[];
  };
  validCountries: string[];
  requiresReservation: boolean;
  seatReservationFee?: number;
  notValidOn: string[]; // 某些列车类型
  seasonalRestrictions?: {
    months: number[];
    reason: string;
  };
}

/**
 * Trail Access 规则
 */
export interface TrailAccessRule {
  trailId: string;
  requiresPermit: boolean;
  permitType?: 'DAILY' | 'SEASONAL' | 'ANNUAL';
  permitCost?: number;
  bookingRequired: boolean;
  bookingAdvanceDays?: number;
  seasonalClosure?: {
    months: number[];
    reason: string;
  };
}

/**
 * Permit Requirement
 */
export interface PermitRequirement {
  countryCode: string;
  region?: string;
  activityType: 'HIKING' | 'CAMPING' | 'MOUNTAINEERING' | 'WILD_CAMPING';
  requiresPermit: boolean;
  permitDetails?: {
    whereToGet: string;
    cost: number;
    advanceBooking: boolean;
    validityPeriod: string;
  };
}

@Injectable()
export class ComplianceFactsAgent {
  private readonly logger = new Logger(ComplianceFactsAgent.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chunkRetrieval: ChunkRetrievalService,
    private readonly llmExtraction: LlmExtractionService,
    private readonly ragRealityPolicyGate: RagRealityPolicyGateService,
  ) {}

  /**
   * 从 RAG 检索并提取 Rail Pass 规则
   */
  async extractRailPassRules(
    passType: string,
    countryCode: string,
    decisionContext?: DecisionContextV0,
  ): Promise<RailPassRule[]> {
    this.logger.debug(`提取 Rail Pass 规则: passType=${passType}, countryCode=${countryCode}`);

    try {
      const { scope } = this.ragRealityPolicyGate.resolve(decisionContext);
      if (scope === 'blocked') {
        return [];
      }

      let retrieveParams: ChunkRetrievalParams = {
        query: `${passType} rules for ${countryCode}`,
        category: 'compliance_rules',
        chunkCategory: 'RULES',
        limit: 10,
        useHybridSearch: true,
      };
      retrieveParams = this.ragRealityPolicyGate.mergeChunkRetrievalParams(retrieveParams, scope);

      // 1. RAG 检索相关文档段落（使用新的 ChunkRetrievalService）
      const snippets = await this.chunkRetrieval.retrieve(retrieveParams);

      if (snippets.length === 0) {
        this.logger.warn(`未找到相关文档: passType=${passType}, countryCode=${countryCode}`);
        return [];
      }

      // 2. LLM 提取结构化规则
      const prompt = `Extract rail pass rules from the following text. Return a JSON array of RailPassRule objects.

Text:
${snippets.map(s => s.content).join('\n\n---\n\n')}

Please extract all rail pass rules and return them as a JSON array. Each rule should have:
- passType: one of "EURAIL_GLOBAL", "EURAIL_ONE_COUNTRY", "INTERRAIL_GLOBAL", "INTERRAIL_ONE_COUNTRY"
- eligibleTraveler: object with "regions" (array of strings) and optional "citizenship" (array of strings)
- validCountries: array of country codes
- requiresReservation: boolean
- seatReservationFee: optional number
- notValidOn: optional array of train types
- seasonalRestrictions: optional object with "months" (array of numbers) and "reason" (string)

Return only valid JSON array.`;

      // 2. LLM 提取结构化规则
      const schema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            passType: {
              type: 'string',
              enum: ['EURAIL_GLOBAL', 'EURAIL_ONE_COUNTRY', 'INTERRAIL_GLOBAL', 'INTERRAIL_ONE_COUNTRY'],
            },
            eligibleTraveler: {
              type: 'object',
              properties: {
                regions: { type: 'array', items: { type: 'string' } },
                citizenship: { type: 'array', items: { type: 'string' } },
              },
              required: ['regions'],
            },
            validCountries: { type: 'array', items: { type: 'string' } },
            requiresReservation: { type: 'boolean' },
            seatReservationFee: { type: 'number' },
            notValidOn: { type: 'array', items: { type: 'string' } },
            seasonalRestrictions: {
              type: 'object',
              properties: {
                months: { type: 'array', items: { type: 'number' } },
                reason: { type: 'string' },
              },
            },
          },
          required: ['passType', 'eligibleTraveler', 'validCountries', 'requiresReservation'],
        },
      };

      const rules = await this.llmExtraction.extractStructured<RailPassRule[]>(prompt, schema);

      // 3. 写入数据库（ComplianceEvidence 表）
      await this.prisma.complianceEvidence.createMany({
        data: rules.map(rule => ({
          countryCode,
          ruleType: 'RAIL_PASS',
          ruleData: rule as any,
          source: 'RAG_EXTRACTED',
          sourceUrl: snippets[0]?.sourceFile || snippets[0]?.metadata?.sourceUrl,
          confidence: 'HIGH',
        })),
        skipDuplicates: true,
      });

      this.logger.debug(`提取完成: 找到 ${rules.length} 条 Rail Pass 规则`);

      return rules;
    } catch (error: any) {
      this.logger.error(`提取 Rail Pass 规则失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 提取 Trail Access 规则
   */
  async extractTrailAccessRules(
    trailId: string,
    countryCode: string,
    decisionContext?: DecisionContextV0,
  ): Promise<TrailAccessRule[]> {
    this.logger.debug(`提取 Trail Access 规则: trailId=${trailId}, countryCode=${countryCode}`);

    try {
      const { scope } = this.ragRealityPolicyGate.resolve(decisionContext);
      if (scope === 'blocked') {
        return [];
      }

      let retrieveParams: ChunkRetrievalParams = {
        query: `${trailId} access permit requirements ${countryCode}`,
        category: 'compliance_rules',
        chunkCategory: 'RULES',
        limit: 10,
        useHybridSearch: true,
      };
      retrieveParams = this.ragRealityPolicyGate.mergeChunkRetrievalParams(retrieveParams, scope);

      // 1. RAG 检索（使用新的 ChunkRetrievalService）
      const snippets = await this.chunkRetrieval.retrieve(retrieveParams);

      if (snippets.length === 0) {
        return [];
      }

      // 2. LLM 提取结构化规则
      const prompt = `Extract trail access rules from the following text. Return a JSON array of TrailAccessRule objects.

Text:
${snippets.map(s => s.content).join('\n\n---\n\n')}

Schema:
{
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "trailId": { "type": "string" },
      "requiresPermit": { "type": "boolean" },
      "permitType": { "type": "string", "enum": ["DAILY", "SEASONAL", "ANNUAL"] },
      "permitCost": { "type": "number" },
      "bookingRequired": { "type": "boolean" },
      "bookingAdvanceDays": { "type": "number" },
      "seasonalClosure": {
        "type": "object",
        "properties": {
          "months": { "type": "array", "items": { "type": "number" } },
          "reason": { "type": "string" }
        }
      }
    },
    "required": ["trailId", "requiresPermit", "bookingRequired"]
  }
}`;

      const schema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            trailId: { type: 'string' },
            requiresPermit: { type: 'boolean' },
            permitType: { type: 'string', enum: ['DAILY', 'SEASONAL', 'ANNUAL'] },
            permitCost: { type: 'number' },
            bookingRequired: { type: 'boolean' },
            bookingAdvanceDays: { type: 'number' },
            seasonalClosure: {
              type: 'object',
              properties: {
                months: { type: 'array', items: { type: 'number' } },
                reason: { type: 'string' },
              },
            },
          },
          required: ['trailId', 'requiresPermit', 'bookingRequired'],
        },
      };

      const rules = await this.llmExtraction.extractStructured<TrailAccessRule[]>(prompt, schema);

      // 3. 写入数据库
      await this.prisma.complianceEvidence.createMany({
        data: rules.map(rule => ({
          countryCode,
          ruleType: 'TRAIL_ACCESS',
          ruleData: rule as any,
          source: 'RAG_EXTRACTED',
          sourceUrl: snippets[0]?.sourceFile || snippets[0]?.metadata?.sourceUrl,
          confidence: 'HIGH',
        })),
        skipDuplicates: true,
      });

      return rules;
    } catch (error: any) {
      this.logger.error(`提取 Trail Access 规则失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 定期更新合规规则（定时任务）
   * 每周日更新
   */
  @Cron('0 0 * * 0')
  async refreshComplianceRules() {
    this.logger.log('开始定期更新合规规则...');

    const countries = ['IS', 'NO', 'CH', 'NP', 'CN'];
    const passTypes = ['EURAIL_GLOBAL', 'EURAIL_ONE_COUNTRY', 'INTERRAIL_GLOBAL', 'INTERRAIL_ONE_COUNTRY'];

    for (const country of countries) {
      for (const passType of passTypes) {
        try {
          await this.extractRailPassRules(passType, country);
        } catch (error: any) {
          this.logger.error(`更新合规规则失败: country=${country}, passType=${passType}, error=${error.message}`);
        }
      }
    }

    this.logger.log('合规规则更新完成');
  }
}


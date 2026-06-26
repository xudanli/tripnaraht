/**
 * Decision Attribution Service
 *
 * Analyzes travel events to determine "why" a decision was made.
 * This is the core service of the Decision Attribution Layer.
 */

import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  DecisionAttribution,
  AttributionResult,
  AttributionRequest,
  AttributionContext,
  AttributionRule,
  DecisionCauseType,
  DecisionSignal,
  AttributionConfidence,
} from '../types/decision-attribution.types';

/**
 * Decision Attribution Service
 *
 * Analyzes travel events to determine the cause and signals behind decisions.
 * Initially rule-based, with future ML model integration path.
 */
@Injectable()
export class DecisionAttributionService {
  private readonly logger = new Logger(DecisionAttributionService.name);

  // Rule-based attribution rules (loaded in constructor)
  private rules: AttributionRule[] = [];

  constructor() {
    this.initializeRules();
  }

  /**
   * Initialize rule-based attribution rules.
   * These are the foundational rules before ML model integration.
   */
  private initializeRules(): void {
    this.rules = [
      // Budget-related rules
      {
        ruleId: 'budget_changed',
        name: 'Budget Change Attribution',
        applicableEventTypes: ['trip.decision.budget_changed', 'trip.action.budget_updated'],
        condition: 'payload.budgetChange !== undefined',
        causeType: DecisionCauseType.USER_ACTION,
        signals: [DecisionSignal.BUDGET],
        influenceScore: 0.9,
        priority: 100,
      },
      {
        ruleId: 'budget_constraint_rejected',
        name: 'Budget Constraint Rejection',
        applicableEventTypes: ['trip.lifecycle.transition_rejected'],
        condition: 'payload.reason?.includes("budget") || payload.reasonCodes?.includes("BUDGET")',
        causeType: DecisionCauseType.CONSTRAINT,
        signals: [DecisionSignal.BUDGET],
        influenceScore: 0.85,
        priority: 90,
      },

      // Destination-related rules
      {
        ruleId: 'destination_changed',
        name: 'Destination Change Attribution',
        applicableEventTypes: ['trip.decision.destination_changed', 'trip.action.destination_updated'],
        condition: 'payload.destination !== undefined',
        causeType: DecisionCauseType.USER_ACTION,
        signals: [DecisionSignal.INTEREST, DecisionSignal.BUDGET],
        influenceScore: 0.95,
        priority: 100,
      },
      {
        ruleId: 'destination_suggested',
        name: 'Destination Suggestion Attribution',
        applicableEventTypes: ['trip.decision.destination_suggested'],
        condition: 'payload.suggestedBy === "ai"',
        causeType: DecisionCauseType.AI_SUGGESTION,
        signals: [DecisionSignal.INTEREST, DecisionSignal.BUDGET, DecisionSignal.TIME],
        influenceScore: 0.7,
        priority: 80,
      },

      // Time-related rules
      {
        ruleId: 'time_constraint_rejected',
        name: 'Time Constraint Rejection',
        applicableEventTypes: ['trip.lifecycle.transition_rejected'],
        condition: 'payload.reason?.includes("time") || payload.reasonCodes?.includes("TIME")',
        causeType: DecisionCauseType.CONSTRAINT,
        signals: [DecisionSignal.TIME],
        influenceScore: 0.85,
        priority: 90,
      },
      {
        ruleId: 'dates_changed',
        name: 'Date Change Attribution',
        applicableEventTypes: ['trip.decision.dates_changed', 'trip.action.dates_updated'],
        condition: 'payload.startDate !== undefined || payload.endDate !== undefined',
        causeType: DecisionCauseType.USER_ACTION,
        signals: [DecisionSignal.TIME, DecisionSignal.BUDGET],
        influenceScore: 0.9,
        priority: 100,
      },

      // Companion-related rules
      {
        ruleId: 'member_added',
        name: 'Member Addition Attribution',
        applicableEventTypes: ['trip.action.member_invited', 'trip.result.member_joined'],
        condition: 'payload.memberId !== undefined',
        causeType: DecisionCauseType.USER_ACTION,
        signals: [DecisionSignal.COMPANION],
        influenceScore: 0.8,
        priority: 100,
      },
      {
        ruleId: 'companion_constraint_rejected',
        name: 'Companion Constraint Rejection',
        applicableEventTypes: ['trip.lifecycle.transition_rejected'],
        condition: 'payload.reason?.includes("companion") || payload.reasonCodes?.includes("COMPANION")',
        causeType: DecisionCauseType.CONSTRAINT,
        signals: [DecisionSignal.COMPANION],
        influenceScore: 0.85,
        priority: 90,
      },

      // External factor rules
      {
        ruleId: 'weather_disruption',
        name: 'Weather Disruption Attribution',
        applicableEventTypes: ['trip.decision.route_adjusted', 'trip.action.delayed'],
        condition: 'payload.reason?.includes("weather") || payload.riskCategory === "WEATHER_NATURAL"',
        causeType: DecisionCauseType.EXTERNAL_FACTOR,
        signals: [DecisionSignal.WEATHER, DecisionSignal.SAFETY, DecisionSignal.RISK],
        influenceScore: 0.9,
        priority: 95,
      },
      {
        ruleId: 'transport_disruption',
        name: 'Transport Disruption Attribution',
        applicableEventTypes: ['trip.decision.route_adjusted', 'trip.action.delayed'],
        condition: 'payload.reason?.includes("transport") || payload.riskCategory === "TRANSPORT_DISRUPTION"',
        causeType: DecisionCauseType.EXTERNAL_FACTOR,
        signals: [DecisionSignal.TRANSPORT, DecisionSignal.RISK],
        influenceScore: 0.9,
        priority: 95,
      },
      {
        ruleId: 'safety_alert',
        name: 'Safety Alert Attribution',
        applicableEventTypes: ['trip.decision.route_adjusted', 'trip.action.destination_changed'],
        condition: 'payload.reason?.includes("safety") || payload.riskCategory === "SAFETY_SECURITY"',
        causeType: DecisionCauseType.EXTERNAL_FACTOR,
        signals: [DecisionSignal.SAFETY, DecisionSignal.RISK],
        influenceScore: 0.95,
        priority: 98,
      },

      // Governance rules
      {
        ruleId: 'governance_block',
        name: 'Governance Block Attribution',
        applicableEventTypes: ['trip.lifecycle.transition_rejected', 'governance.execution_block'],
        condition: 'payload.source === "governance" || (payload.governanceEvent === true)',
        causeType: DecisionCauseType.GOVERNANCE,
        signals: [DecisionSignal.SAFETY, DecisionSignal.RISK],
        influenceScore: 0.9,
        priority: 85, // Lower than constraint rules to avoid false positives
      },

      // AI suggestion rules
      {
        ruleId: 'ai_route_suggestion',
        name: 'AI Route Suggestion Attribution',
        applicableEventTypes: ['trip.decision.route_suggested'],
        condition: 'payload.suggestedBy === "ai" || payload.source === "decision_os"',
        causeType: DecisionCauseType.AI_SUGGESTION,
        signals: [DecisionSignal.INTEREST, DecisionSignal.TIME, DecisionSignal.BUDGET],
        influenceScore: 0.75,
        priority: 70,
      },
      {
        ruleId: 'ai_adjustment_suggestion',
        name: 'AI Adjustment Suggestion Attribution',
        applicableEventTypes: ['trip.decision.adjustment_suggested'],
        condition: 'payload.suggestedBy === "ai"',
        causeType: DecisionCauseType.AI_SUGGESTION,
        signals: [DecisionSignal.RISK, DecisionSignal.SAFETY, DecisionSignal.TIME],
        influenceScore: 0.8,
        priority: 75,
      },

      // Default fallback rule
      {
        ruleId: 'default_user_action',
        name: 'Default User Action Attribution',
        applicableEventTypes: ['*'],
        condition: 'true',
        causeType: DecisionCauseType.USER_ACTION,
        signals: [DecisionSignal.INTEREST],
        influenceScore: 0.5,
        priority: 0,
      },
    ];

    this.logger.log(`Initialized ${this.rules.length} attribution rules`);
  }

  /**
   * Analyze a travel event to determine attribution.
   *
   * @param request - Attribution request with event data and context
   * @returns Attribution result with cause, signals, and confidence
   */
  async analyze(request: AttributionRequest): Promise<AttributionResult> {
    try {
      this.logger.debug(
        `Analyzing attribution for event ${request.eventId} (type: ${request.eventType})`,
      );

      // Find matching rules (sorted by priority)
      const matchingRules = this.findMatchingRules(request);

      if (matchingRules.length === 0) {
        this.logger.warn(`No matching rules for event type ${request.eventType}, using default`);
        return this.createDefaultAttribution(request);
      }

      // Use the highest priority matching rule
      const primaryRule = matchingRules[0];

      // Create attribution from rule
      const attribution = this.createAttributionFromRule(request, primaryRule);

      // Enhance with context data if available
      this.enhanceAttributionWithContext(attribution, request.context);

      // Calculate signal scores for debugging
      const signalScores = this.calculateSignalScores(request, matchingRules);

      this.logger.debug(
        `Attribution computed: cause=${attribution.causeType}, signals=${attribution.signals.join(',')}, score=${attribution.influenceScore}`,
      );

      return {
        attribution,
        alternatives: matchingRules.slice(1).map((rule) =>
          this.createAttributionFromRule(request, rule),
        ),
        signalScores,
      };
    } catch (error) {
      this.logger.error(
        `Attribution analysis failed for event ${request.eventId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Find matching rules for the given event.
   * Rules are sorted by priority (highest first).
   */
  private findMatchingRules(request: AttributionRequest): AttributionRule[] {
    return this.rules
      .filter((rule) => {
        // Check if rule applies to this event type
        const appliesToEventType =
          rule.applicableEventTypes.includes('*') ||
          rule.applicableEventTypes.includes(request.eventType);

        if (!appliesToEventType) {
          return false;
        }

        // Evaluate condition (simple evaluation for now)
        return this.evaluateCondition(rule.condition, request.payload);
      })
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Evaluate a rule condition against the payload.
   * This is a simple implementation; consider using a proper expression evaluator for production.
   */
  private evaluateCondition(condition: string, payload: Record<string, unknown>): boolean {
    try {
      // Simple condition evaluation
      // For production, consider using a proper expression evaluator like 'expr-eval'

      if (condition === 'true') {
        return true;
      }

      // Check for OR conditions first: condition1 || condition2
      if (condition.includes(' || ')) {
        const parts = condition.split(' || ');
        return parts.some(part => this.evaluateCondition(part.trim(), payload));
      }

      // Check for simple property existence: payload.prop !== undefined
      if (condition.includes('!== undefined')) {
        const match = condition.match(/payload\.(\w+)\s*!==\s*undefined/);
        if (match) {
          const prop = match[1];
          return payload[prop] !== undefined;
        }
      }

      // Check for equality: payload.source === "governance"
      if (condition.includes('===')) {
        const match = condition.match(/payload\.(\w+)\s*===\s*"([^"]+)"/);
        if (match) {
          const prop = match[1];
          const value = match[2];
          return payload[prop] === value;
        }
      }

      // Check for boolean equality: payload.governanceEvent === true
      if (condition.includes('=== true')) {
        const match = condition.match(/payload\.(\w+)\s*===\s*true/);
        if (match) {
          const prop = match[1];
          return payload[prop] === true;
        }
      }

      // Check for string inclusion: payload.reason?.includes("budget")
      if (condition.includes('includes(')) {
        // Try to match: payload.prop?.includes("value")
        const stringMatch = condition.match(/payload\.(\w+)\?\.includes\("([^"]+)"\)/);
        if (stringMatch) {
          const prop = stringMatch[1];
          const value = stringMatch[2];
          const propValue = payload[prop];
          if (typeof propValue === 'string') {
            return propValue.toLowerCase().includes(value.toLowerCase());
          }
          return false;
        }

        // Try to match: payload.arrayProp?.includes("value") for arrays
        const arrayMatch = condition.match(/payload\.(\w+)\?\.includes\("([^"]+)"\)/);
        if (arrayMatch) {
          const prop = arrayMatch[1];
          const value = arrayMatch[2];
          const propValue = payload[prop];
          if (Array.isArray(propValue)) {
            return propValue.some(item =>
              typeof item === 'string' && item.toLowerCase().includes(value.toLowerCase())
            );
          }
          return false;
        }
      }

      // Default to false for unrecognized conditions (safer than true)
      this.logger.debug(`Unrecognized condition: ${condition}, defaulting to false`);
      return false;
    } catch (error) {
      this.logger.error(`Condition evaluation failed: ${error}`);
      return false; // Fail closed for safety
    }
  }

  /**
   * Create attribution from a matching rule.
   */
  private createAttributionFromRule(
    request: AttributionRequest,
    rule: AttributionRule,
  ): DecisionAttribution {
    return {
      attributionId: uuidv4(),
      tripId: request.tripId,
      eventId: request.eventId,
      causeType: rule.causeType,
      signals: [...rule.signals], // Copy array
      influenceScore: rule.influenceScore,
      confidence: this.determineConfidence(rule, request.context),
      explanation: this.generateExplanation(rule, request),
      evidenceRefs: this.extractEvidenceRefs(request.context),
      computedAt: new Date().toISOString(),
      metadata: {
        ruleId: rule.ruleId,
        ruleName: rule.name,
        rulePriority: rule.priority,
      },
    };
  }

  /**
   * Create default attribution when no rules match.
   */
  private createDefaultAttribution(request: AttributionRequest): AttributionResult {
    const attribution: DecisionAttribution = {
      attributionId: uuidv4(),
      tripId: request.tripId,
      eventId: request.eventId,
      causeType: DecisionCauseType.USER_ACTION,
      signals: [DecisionSignal.INTEREST],
      influenceScore: 0.5,
      confidence: AttributionConfidence.LOW,
      explanation: `Default attribution for event type ${request.eventType}`,
      computedAt: new Date().toISOString(),
      metadata: {
        isDefault: true,
      },
    };

    return {
      attribution,
    };
  }

  /**
   * Determine confidence level based on rule and context.
   */
  private determineConfidence(
    rule: AttributionRule,
    context?: AttributionContext,
  ): AttributionConfidence {
    // High confidence for high-priority rules with strong evidence
    if (rule.priority >= 90) {
      return AttributionConfidence.HIGH;
    }

    // Medium confidence for medium-priority rules
    if (rule.priority >= 50) {
      return AttributionConfidence.MEDIUM;
    }

    // Low confidence for low-priority rules
    return AttributionConfidence.LOW;
  }

  /**
   * Generate human-readable explanation.
   */
  private generateExplanation(rule: AttributionRule, request: AttributionRequest): string {
    const causeMap: Record<DecisionCauseType, string> = {
      [DecisionCauseType.USER_ACTION]: 'User explicitly made this decision',
      [DecisionCauseType.AI_SUGGESTION]: 'AI system suggested this decision',
      [DecisionCauseType.CONSTRAINT]: 'Constraint forced this decision',
      [DecisionCauseType.EXTERNAL_FACTOR]: 'External factor influenced this decision',
      [DecisionCauseType.GOVERNANCE]: 'Governance policy enforced this decision',
      [DecisionCauseType.MIXED]: 'Multiple factors influenced this decision',
    };

    const signalMap: Record<DecisionSignal, string> = {
      [DecisionSignal.BUDGET]: 'budget',
      [DecisionSignal.WEATHER]: 'weather',
      [DecisionSignal.COMPANION]: 'companion',
      [DecisionSignal.TIME]: 'time',
      [DecisionSignal.INTEREST]: 'interest',
      [DecisionSignal.SAFETY]: 'safety',
      [DecisionSignal.TRANSPORT]: 'transport',
      [DecisionSignal.LOGISTICS]: 'logistics',
      [DecisionSignal.RISK]: 'risk',
    };

    const cause = causeMap[rule.causeType];
    const signals = rule.signals.map((s) => signalMap[s]).join(', ');

    return `${cause} based on ${signals} signals (rule: ${rule.name})`;
  }

  /**
   * Extract evidence references from context.
   */
  private extractEvidenceRefs(context?: AttributionContext): string[] | undefined {
    if (!context) {
      return undefined;
    }

    const refs: string[] = [];

    // Extract evidence refs
    if (context.evidence) {
      context.evidence.forEach((e) => {
        refs.push(`evidence:${e.factType}:${e.entityRef}`);
      });
    }

    // Extract risk refs
    if (context.risks) {
      context.risks.forEach((r) => {
        refs.push(`risk:${r.category}:${r.entityRef}`);
      });
    }

    return refs.length > 0 ? refs : undefined;
  }

  /**
   * Enhance attribution with context data.
   */
  private enhanceAttributionWithContext(
    attribution: DecisionAttribution,
    context?: AttributionContext,
  ): void {
    if (!context) {
      return;
    }

    // Add context metadata
    attribution.metadata = {
      ...attribution.metadata,
      context: {
        tripStatus: context.tripState?.status,
        destination: context.tripState?.destination,
        memberCount: context.tripState?.memberCount,
      },
    };

    // Adjust signals based on context
    if (context.risks && context.risks.length > 0) {
      if (!attribution.signals.includes(DecisionSignal.RISK)) {
        attribution.signals.push(DecisionSignal.RISK);
      }
    }

    if (context.evidence && context.evidence.length > 0) {
      const hasWeatherEvidence = context.evidence.some((e) => e.factType === 'WEATHER');
      if (hasWeatherEvidence && !attribution.signals.includes(DecisionSignal.WEATHER)) {
        attribution.signals.push(DecisionSignal.WEATHER);
      }
    }
  }

  /**
   * Calculate signal scores for debugging/analysis.
   */
  private calculateSignalScores(
    request: AttributionRequest,
    matchingRules: AttributionRule[],
  ): Record<DecisionSignal, number> {
    const scores: Record<DecisionSignal, number> = {
      [DecisionSignal.BUDGET]: 0,
      [DecisionSignal.WEATHER]: 0,
      [DecisionSignal.COMPANION]: 0,
      [DecisionSignal.TIME]: 0,
      [DecisionSignal.INTEREST]: 0,
      [DecisionSignal.SAFETY]: 0,
      [DecisionSignal.TRANSPORT]: 0,
      [DecisionSignal.LOGISTICS]: 0,
      [DecisionSignal.RISK]: 0,
    };

    // Score based on matching rules
    matchingRules.forEach((rule) => {
      rule.signals.forEach((signal) => {
        scores[signal] += rule.influenceScore;
      });
    });

    // Score based on context
    if (request.context) {
      if (request.context.risks && request.context.risks.length > 0) {
        scores[DecisionSignal.RISK] += 0.3;
      }
      if (request.context.evidence && request.context.evidence.length > 0) {
        request.context.evidence.forEach((e) => {
          if (e.factType === 'WEATHER') scores[DecisionSignal.WEATHER] += 0.2;
          if (e.factType === 'SAFETY_ALERT') scores[DecisionSignal.SAFETY] += 0.2;
          if (e.factType === 'TRANSPORT_TIME') scores[DecisionSignal.TRANSPORT] += 0.2;
        });
      }
    }

    // Normalize scores to 0-1 range
    const maxScore = Math.max(...Object.values(scores));
    if (maxScore > 0) {
      Object.keys(scores).forEach((key) => {
        scores[key as DecisionSignal] = scores[key as DecisionSignal] / maxScore;
      });
    }

    return scores;
  }

  /**
   * Batch analyze multiple events.
   */
  async analyzeBatch(requests: AttributionRequest[]): Promise<AttributionResult[]> {
    this.logger.log(`Batch analyzing ${requests.length} events`);

    const results = await Promise.all(
      requests.map((request) => this.analyze(request)),
    );

    return results;
  }
}

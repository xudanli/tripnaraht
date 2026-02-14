"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionLogMigrator = void 0;
class DecisionLogMigrator {
    static toLegacyFormat(entry) {
        return {
            step: this.normalizeStepToLegacy(entry.step),
            decision: entry.outputs_summary,
            reasoning: entry.inputs_summary,
            timestamp: entry.timestamp,
        };
    }
    static fromLegacyFormat(entry, requestId) {
        return {
            request_id: requestId,
            step: this.normalizeStepFromLegacy(entry.step),
            actor: this.inferActorFromStep(entry.step),
            inputs_summary: entry.reasoning || '',
            outputs_summary: entry.decision || '',
            evidence_refs: [],
            timestamp: entry.timestamp,
            metadata: {
                migrated: true,
                original_format: 'legacy',
            },
        };
    }
    static batchToLegacyFormat(entries) {
        return entries.map(entry => this.toLegacyFormat(entry));
    }
    static batchFromLegacyFormat(entries, requestId) {
        return entries.map(entry => this.fromLegacyFormat(entry, requestId));
    }
    static normalizeStepToLegacy(step) {
        const stepMap = {
            INTAKE: 'intent_analysis',
            RESEARCH: 'research',
            GATE_EVAL: 'gate_eval',
            PLAN_GEN: 'plan_gen',
            VERIFY: 'verify',
            COMPLIANCE: 'compliance',
            REPAIR: 'repair',
            NARRATE: 'narrate',
            FEEDBACK: 'feedback',
            HALLUCINATION_DETECTION: 'hallucination_detection',
            DONE: 'done',
            FAILED: 'failed',
            TIMEOUT: 'timeout',
        };
        return stepMap[step] || step.toLowerCase().replace('_', ' ');
    }
    static normalizeStepFromLegacy(step) {
        const stepMap = {
            'intent analysis': 'INTAKE',
            'intent_analysis': 'INTAKE',
            'routing decision': 'INTAKE',
            'routing_decision': 'INTAKE',
            'research': 'RESEARCH',
            'gate eval': 'GATE_EVAL',
            'gate_eval': 'GATE_EVAL',
            'plan gen': 'PLAN_GEN',
            'plan_gen': 'PLAN_GEN',
            'verify': 'VERIFY',
            'repair': 'REPAIR',
            'narrate': 'NARRATE',
            'done': 'DONE',
            'failed': 'FAILED',
            'error': 'FAILED',
        };
        const normalized = step.toLowerCase().trim();
        return stepMap[normalized] || 'INTAKE';
    }
    static inferActorFromStep(step) {
        const stepLower = step.toLowerCase();
        if (stepLower.includes('gate') || stepLower.includes('guardian')) {
            return 'Gatekeeper';
        }
        if (stepLower.includes('plan') || stepLower.includes('intent')) {
            return 'Planner';
        }
        if (stepLower.includes('narrate') || stepLower.includes('explain')) {
            return 'Narrator';
        }
        if (stepLower.includes('repair') || stepLower.includes('alternative')) {
            return 'LocalInsight';
        }
        if (stepLower.includes('verify') || stepLower.includes('pace')) {
            return 'CoreDecision';
        }
        return 'Orchestrator';
    }
    static detectFormat(entry) {
        if (entry.request_id &&
            entry.actor &&
            entry.inputs_summary !== undefined &&
            entry.outputs_summary !== undefined) {
            return 'new';
        }
        if (entry.step &&
            entry.decision !== undefined &&
            entry.reasoning !== undefined) {
            return 'legacy';
        }
        return 'new';
    }
    static normalizeToNewFormat(entry, requestId) {
        const format = this.detectFormat(entry);
        if (format === 'new') {
            return entry;
        }
        return this.fromLegacyFormat(entry, requestId);
    }
    static normalizeToLegacyFormat(entry) {
        const format = this.detectFormat(entry);
        if (format === 'legacy') {
            return entry;
        }
        return this.toLegacyFormat(entry);
    }
}
exports.DecisionLogMigrator = DecisionLogMigrator;
//# sourceMappingURL=decision-log-migrator.util.js.map
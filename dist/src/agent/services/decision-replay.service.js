"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var DecisionReplayService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionReplayService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let DecisionReplayService = DecisionReplayService_1 = class DecisionReplayService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(DecisionReplayService_1.name);
        this.timelinesCache = new Map();
        this.styleModelsCache = new Map();
        this.logger.log('[DecisionReplay] Initialized' + (prisma ? ' with Prisma persistence' : ' (memory only)'));
    }
    createSnapshot(state, trigger, decisionNode, decisionOutput) {
        const snapshot = {
            snapshot_id: `snap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            state: this.cloneState(state),
            decision_node: decisionNode,
            decision_output: decisionOutput,
            metadata: {
                step: state.current_step,
                actor: this.inferActor(state),
                trigger,
            },
        };
        this.addToTimeline(state.request_id, snapshot);
        this.logger.debug(`[DecisionReplay] Created snapshot: ${snapshot.snapshot_id} at step ${state.current_step}`);
        return snapshot;
    }
    getSnapshot(tripRunId, snapshotId) {
        const timeline = this.timelinesCache.get(tripRunId);
        return timeline === null || timeline === void 0 ? void 0 : timeline.snapshots.find(s => s.snapshot_id === snapshotId);
    }
    getLatestSnapshot(tripRunId) {
        const timeline = this.timelinesCache.get(tripRunId);
        return timeline === null || timeline === void 0 ? void 0 : timeline.snapshots[timeline.snapshots.length - 1];
    }
    getTimeline(tripRunId) {
        return this.timelinesCache.get(tripRunId);
    }
    async loadTimelineFromDB(tripRunId) {
        var _a, _b, _c, _d;
        if (!this.prisma)
            return this.timelinesCache.get(tripRunId);
        try {
            const snapshots = await this.prisma.$queryRaw `
        SELECT snapshot_id, timestamp, step, actor, trigger, state, decision_node, decision_output
        FROM decision_snapshots
        WHERE trip_run_id = ${tripRunId}
        ORDER BY timestamp ASC
      `;
            if (snapshots.length === 0)
                return undefined;
            const timelineRecord = await this.prisma.$queryRaw `
        SELECT * FROM decision_timelines WHERE trip_run_id = ${tripRunId}
      `;
            const timeline = {
                trip_run_id: tripRunId,
                created_at: ((_a = timelineRecord[0]) === null || _a === void 0 ? void 0 : _a.created_at) || ((_b = snapshots[0]) === null || _b === void 0 ? void 0 : _b.timestamp),
                snapshots: snapshots.map((s) => ({
                    snapshot_id: s.snapshot_id,
                    timestamp: s.timestamp,
                    state: s.state,
                    decision_node: s.decision_node,
                    decision_output: s.decision_output,
                    metadata: { step: s.step, actor: s.actor, trigger: s.trigger },
                })),
                key_decision_points: ((_c = timelineRecord[0]) === null || _c === void 0 ? void 0 : _c.key_decision_points) || [],
                total_duration_ms: ((_d = timelineRecord[0]) === null || _d === void 0 ? void 0 : _d.total_duration_ms) || 0,
            };
            this.timelinesCache.set(tripRunId, timeline);
            return timeline;
        }
        catch (e) {
            this.logger.warn(`[DecisionReplay] Failed to load timeline from DB: ${e === null || e === void 0 ? void 0 : e.message}`);
            return this.timelinesCache.get(tripRunId);
        }
    }
    buildTimelineSummary(tripRunId) {
        const timeline = this.timelinesCache.get(tripRunId);
        if (!timeline)
            return undefined;
        const phaseMap = new Map();
        for (const snap of timeline.snapshots) {
            const phase = snap.metadata.step;
            const ts = new Date(snap.timestamp).getTime();
            const existing = phaseMap.get(phase);
            if (existing) {
                existing.snapshots++;
                existing.end = Math.max(existing.end, ts);
            }
            else {
                phaseMap.set(phase, { snapshots: 1, start: ts, end: ts });
            }
        }
        const phases = Array.from(phaseMap.entries()).map(([phase, data]) => ({
            phase,
            snapshots: data.snapshots,
            duration_ms: data.end - data.start,
        }));
        return {
            total_snapshots: timeline.snapshots.length,
            key_decisions: timeline.key_decision_points.length,
            duration_ms: timeline.total_duration_ms,
            phases,
        };
    }
    replayToSnapshot(tripRunId, snapshotId) {
        const timeline = this.timelinesCache.get(tripRunId);
        if (!timeline)
            return undefined;
        const snapshotIndex = timeline.snapshots.findIndex(s => s.snapshot_id === snapshotId);
        if (snapshotIndex === -1)
            return undefined;
        const targetSnapshot = timeline.snapshots[snapshotIndex];
        const skippedSteps = timeline.snapshots
            .slice(snapshotIndex + 1)
            .map(s => s.metadata.step);
        this.logger.debug(`[DecisionReplay] Replaying to snapshot: ${snapshotId}, skipping ${skippedSteps.length} steps`);
        return {
            restored_state: this.cloneState(targetSnapshot.state),
            skipped_steps: skippedSteps,
            replay_point: targetSnapshot.metadata.step,
        };
    }
    getDiffBetweenSnapshots(tripRunId, fromSnapshotId, toSnapshotId) {
        const fromSnap = this.getSnapshot(tripRunId, fromSnapshotId);
        const toSnap = this.getSnapshot(tripRunId, toSnapshotId);
        if (!fromSnap || !toSnap)
            return undefined;
        const stateChanges = [];
        const decisionChanges = [];
        if (fromSnap.state.current_step !== toSnap.state.current_step) {
            stateChanges.push({ field: 'current_step', from: fromSnap.state.current_step, to: toSnap.state.current_step });
        }
        if (fromSnap.decision_output && toSnap.decision_output) {
            const fromTop = fromSnap.decision_output.ranked_plans[0];
            const toTop = toSnap.decision_output.ranked_plans[0];
            if ((fromTop === null || fromTop === void 0 ? void 0 : fromTop.plan.id) !== (toTop === null || toTop === void 0 ? void 0 : toTop.plan.id)) {
                decisionChanges.push({
                    aspect: 'recommendation',
                    description: `Changed from "${fromTop === null || fromTop === void 0 ? void 0 : fromTop.plan.name}" to "${toTop === null || toTop === void 0 ? void 0 : toTop.plan.name}"`,
                });
            }
        }
        const timeElapsed = new Date(toSnap.timestamp).getTime() - new Date(fromSnap.timestamp).getTime();
        return {
            state_changes: stateChanges,
            decision_changes: decisionChanges,
            time_elapsed_ms: timeElapsed,
        };
    }
    simulateWhatIf(input, decisionOutput) {
        this.logger.debug(`[DecisionReplay] Simulating what-if from snapshot: ${input.base_snapshot_id}`);
        const simulated = JSON.parse(JSON.stringify(decisionOutput));
        for (const change of input.changes) {
            this.applyWhatIfChange(simulated, change);
        }
        this.recalculateScores(simulated);
        const comparison = this.compareOutputs(decisionOutput, simulated);
        const insights = this.generateWhatIfInsights(input.changes, comparison);
        return {
            original_snapshot_id: input.base_snapshot_id,
            simulated_output: simulated,
            comparison,
            insights,
        };
    }
    generateCounterfactualQuestions(decisionOutput) {
        const questions = [];
        const topPlan = decisionOutput.ranked_plans[0];
        if (!topPlan)
            return questions;
        questions.push({
            question: 'What if I prioritize budget over experience?',
            what_if_input: {
                base_snapshot_id: '',
                changes: [{
                        type: 'PREFERENCE_CHANGE',
                        field: 'priority',
                        original_value: 'EXPERIENCE',
                        new_value: 'COST',
                    }],
            },
            expected_impact: 'May recommend a more budget-friendly option',
        });
        if (topPlan.tradeoffs.RISK.value < 50) {
            questions.push({
                question: 'What if I accept higher risk for better experiences?',
                what_if_input: {
                    base_snapshot_id: '',
                    changes: [{
                            type: 'PREFERENCE_CHANGE',
                            field: 'risk_tolerance',
                            original_value: 'LOW',
                            new_value: 'HIGH',
                        }],
                },
                expected_impact: 'May unlock more adventurous options',
            });
        }
        if (decisionOutput.ranked_plans.length > 1) {
            const secondPlan = decisionOutput.ranked_plans[1];
            questions.push({
                question: `What if I choose "${secondPlan.plan.name}" instead?`,
                what_if_input: {
                    base_snapshot_id: '',
                    changes: [{
                            type: 'OPTION_CHANGE',
                            field: 'selected_option',
                            original_value: topPlan.plan.id,
                            new_value: secondPlan.plan.id,
                        }],
                },
                expected_impact: `Trade ${topPlan.what_you_get} for ${secondPlan.what_you_get}`,
            });
        }
        return questions;
    }
    recordLearningSignal(userId, signalType, context) {
        const model = this.getOrCreateStyleModel(userId);
        model.learning_signals.push({
            signal_type: signalType,
            context,
            timestamp: new Date().toISOString(),
        });
        this.updateInferredPreferences(model);
        this.logger.debug(`[DecisionReplay] Recorded learning signal: ${signalType} for user ${userId}`);
    }
    getDecisionStyle(userId) {
        return this.styleModelsCache.get(userId);
    }
    inferPreferencesFromHistory(userId) {
        const model = this.styleModelsCache.get(userId);
        if (!model || model.learning_signals.length < 3) {
            return {
                suggested_priority: 'EXPERIENCE',
                suggested_risk_tolerance: 'MEDIUM',
                confidence: 0.3,
                reasoning: 'Insufficient history - using defaults',
            };
        }
        return {
            suggested_priority: model.inferred_preferences.priority,
            suggested_risk_tolerance: model.inferred_preferences.risk_tolerance,
            confidence: Math.min(0.9, 0.3 + model.learning_signals.length * 0.05),
            reasoning: `Based on ${model.learning_signals.length} previous interactions`,
        };
    }
    cloneState(state) {
        return JSON.parse(JSON.stringify(state));
    }
    inferActor(state) {
        const stepActorMap = {
            'INTAKE': 'Planner',
            'RESEARCH': 'LocalInsight',
            'GATE_EVAL': 'Gatekeeper',
            'PLAN_GEN': 'CoreDecision',
            'VERIFY': 'Compliance',
            'REPAIR': 'LocalInsight',
            'NARRATE': 'Narrator',
            'DONE': 'Orchestrator',
        };
        return stepActorMap[state.current_step] || 'Orchestrator';
    }
    addToTimeline(tripRunId, snapshot) {
        let timeline = this.timelinesCache.get(tripRunId);
        if (!timeline) {
            timeline = {
                trip_run_id: tripRunId,
                created_at: new Date().toISOString(),
                snapshots: [],
                key_decision_points: [],
                total_duration_ms: 0,
            };
            this.timelinesCache.set(tripRunId, timeline);
        }
        timeline.snapshots.push(snapshot);
        if (['GATE_EVAL', 'PLAN_GEN', 'VERIFY'].includes(snapshot.metadata.step)) {
            timeline.key_decision_points.push({
                snapshot_id: snapshot.snapshot_id,
                description: `${snapshot.metadata.step} completed`,
                importance: snapshot.metadata.step === 'GATE_EVAL' ? 'HIGH' : 'MEDIUM',
            });
        }
        if (timeline.snapshots.length > 1) {
            const first = new Date(timeline.snapshots[0].timestamp).getTime();
            const last = new Date(snapshot.timestamp).getTime();
            timeline.total_duration_ms = last - first;
        }
        this.persistSnapshot(snapshot, timeline).catch(e => this.logger.warn(`[DecisionReplay] Failed to persist snapshot: ${e === null || e === void 0 ? void 0 : e.message}`));
    }
    async persistSnapshot(snapshot, timeline) {
        if (!this.prisma)
            return;
        try {
            await this.prisma.$executeRaw `
        INSERT INTO decision_snapshots (snapshot_id, trip_run_id, timestamp, step, actor, trigger, state, decision_node, decision_output)
        VALUES (${snapshot.snapshot_id}, ${timeline.trip_run_id}, ${snapshot.timestamp}::timestamptz, ${snapshot.metadata.step}, ${snapshot.metadata.actor}, ${snapshot.metadata.trigger}, ${JSON.stringify(snapshot.state)}::jsonb, ${snapshot.decision_node ? JSON.stringify(snapshot.decision_node) : null}::jsonb, ${snapshot.decision_output ? JSON.stringify(snapshot.decision_output) : null}::jsonb)
        ON CONFLICT (snapshot_id) DO NOTHING
      `;
            await this.prisma.$executeRaw `
        INSERT INTO decision_timelines (trip_run_id, total_duration_ms, key_decision_points)
        VALUES (${timeline.trip_run_id}, ${timeline.total_duration_ms}, ${JSON.stringify(timeline.key_decision_points)}::jsonb)
        ON CONFLICT (trip_run_id) DO UPDATE SET 
          total_duration_ms = ${timeline.total_duration_ms},
          key_decision_points = ${JSON.stringify(timeline.key_decision_points)}::jsonb,
          updated_at = NOW()
      `;
        }
        catch (e) {
            this.logger.warn(`[DecisionReplay] DB persist error: ${e === null || e === void 0 ? void 0 : e.message}`);
        }
    }
    applyWhatIfChange(output, change) {
        if (change.type === 'PREFERENCE_CHANGE') {
            if (change.field === 'priority') {
                for (const plan of output.ranked_plans) {
                    const newPriority = change.new_value;
                    const boost = 20;
                    plan.tradeoffs[newPriority].value = Math.min(100, plan.tradeoffs[newPriority].value + boost);
                }
            }
        }
    }
    recalculateScores(output) {
        for (const plan of output.ranked_plans) {
            plan.plan.score = (plan.tradeoffs.TIME.value * 0.25 +
                plan.tradeoffs.COST.value * 0.25 +
                plan.tradeoffs.EXPERIENCE.value * 0.30 +
                (100 - plan.tradeoffs.RISK.value) * 0.20);
        }
        output.ranked_plans.sort((a, b) => b.plan.score - a.plan.score);
        output.ranked_plans.forEach((p, i) => { p.rank = i + 1; });
    }
    compareOutputs(original, simulated) {
        var _a, _b, _c, _d;
        const scoreChange = ((_a = simulated.ranked_plans[0]) === null || _a === void 0 ? void 0 : _a.plan.score) - ((_b = original.ranked_plans[0]) === null || _b === void 0 ? void 0 : _b.plan.score) || 0;
        const rankingChanges = [];
        for (const origPlan of original.ranked_plans) {
            const simPlan = simulated.ranked_plans.find(p => p.plan.id === origPlan.plan.id);
            if (simPlan && simPlan.rank !== origPlan.rank) {
                rankingChanges.push({
                    option_id: origPlan.plan.id,
                    old_rank: origPlan.rank,
                    new_rank: simPlan.rank,
                });
            }
        }
        const dimensions = ['TIME', 'COST', 'EXPERIENCE', 'RISK'];
        const tradeoffChanges = {};
        for (const dim of dimensions) {
            const oldVal = ((_c = original.ranked_plans[0]) === null || _c === void 0 ? void 0 : _c.tradeoffs[dim].value) || 0;
            const newVal = ((_d = simulated.ranked_plans[0]) === null || _d === void 0 ? void 0 : _d.tradeoffs[dim].value) || 0;
            tradeoffChanges[dim] = { old: oldVal, new: newVal, change: newVal - oldVal };
        }
        return { score_change: scoreChange, ranking_changes: rankingChanges, tradeoff_changes: tradeoffChanges };
    }
    generateWhatIfInsights(changes, comparison) {
        const insights = [];
        if (comparison.score_change > 5) {
            insights.push('This change would improve your overall score');
        }
        else if (comparison.score_change < -5) {
            insights.push('This change would lower your overall score');
        }
        if (comparison.ranking_changes.length > 0) {
            insights.push(`${comparison.ranking_changes.length} option(s) would change ranking`);
        }
        for (const change of changes) {
            if (change.type === 'PREFERENCE_CHANGE') {
                insights.push(`Prioritizing ${change.new_value} affects your trade-off balance`);
            }
        }
        return insights;
    }
    getOrCreateStyleModel(userId) {
        let model = this.styleModelsCache.get(userId);
        if (!model) {
            model = {
                user_id: userId,
                inferred_preferences: {
                    pace: 'BALANCED',
                    priority: 'EXPERIENCE',
                    risk_tolerance: 'MEDIUM',
                    budget_sensitivity: 'MEDIUM',
                },
                patterns: [],
                learning_signals: [],
            };
            this.styleModelsCache.set(userId, model);
        }
        return model;
    }
    updateInferredPreferences(model) {
        const signals = model.learning_signals.slice(-20);
        const acceptCount = signals.filter(s => s.signal_type === 'ACCEPT').length;
        const rejectCount = signals.filter(s => s.signal_type === 'REJECT').length;
        const modifyCount = signals.filter(s => s.signal_type === 'MODIFY').length;
        if (rejectCount > acceptCount * 0.5) {
            model.inferred_preferences.risk_tolerance = 'LOW';
        }
        else if (acceptCount > signals.length * 0.7) {
            model.inferred_preferences.risk_tolerance = 'HIGH';
        }
        if (modifyCount > signals.length * 0.4) {
            model.inferred_preferences.pace = 'SLOW';
        }
    }
};
exports.DecisionReplayService = DecisionReplayService;
exports.DecisionReplayService = DecisionReplayService = DecisionReplayService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DecisionReplayService);
//# sourceMappingURL=decision-replay.service.js.map
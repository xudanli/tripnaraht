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
var DataQualityCheckerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataQualityCheckerService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let DataQualityCheckerService = DataQualityCheckerService_1 = class DataQualityCheckerService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(DataQualityCheckerService_1.name);
    }
    async validateTrajectory(trajectory) {
        const issues = [];
        issues.push(...this.checkRequiredFields(trajectory));
        issues.push(...this.checkFormat(trajectory));
        issues.push(...this.checkAnomalies(trajectory));
        issues.push(...this.checkChainIntegrity(trajectory));
        const score = this.calculateQualityScore(issues);
        const isValid = !issues.some((issue) => issue.severity === 'CRITICAL' || issue.severity === 'HIGH');
        return {
            isValid,
            score,
            issues,
        };
    }
    async validateDataset(trajectories) {
        this.logger.log(`[DataQualityChecker] 验证数据集质量: count=${trajectories.length}`);
        const allIssues = [];
        let validCount = 0;
        let invalidCount = 0;
        for (const trajectory of trajectories) {
            const result = await this.validateTrajectory(trajectory);
            allIssues.push(...result.issues);
            if (result.isValid) {
                validCount++;
            }
            else {
                invalidCount++;
            }
        }
        const duplicateIssues = this.checkDuplicates(trajectories);
        allIssues.push(...duplicateIssues);
        const stats = {
            total_trajectories: trajectories.length,
            valid_trajectories: validCount,
            invalid_trajectories: invalidCount,
            completeness_rate: this.calculateCompletenessRate(trajectories, allIssues),
            duplicate_rate: duplicateIssues.length / trajectories.length,
            anomaly_rate: allIssues.filter((i) => i.type === 'ANOMALY').length / trajectories.length,
            integrity_rate: this.calculateIntegrityRate(trajectories, allIssues),
        };
        const score = this.calculateQualityScore(allIssues);
        const result = {
            isValid: stats.valid_trajectories / stats.total_trajectories >= 0.95,
            score,
            issues: allIssues,
            stats,
        };
        this.logger.log(`[DataQualityChecker] 质量检查完成: valid=${validCount}/${trajectories.length}, score=${score.toFixed(2)}, completeness=${(stats.completeness_rate * 100).toFixed(1)}%`);
        return result;
    }
    checkRequiredFields(trajectory) {
        const issues = [];
        const requiredFields = [
            'trajectory_id',
            'request_id',
            'steps',
            'metadata',
        ];
        for (const field of requiredFields) {
            if (!trajectory[field]) {
                issues.push({
                    type: 'MISSING_FIELD',
                    severity: 'CRITICAL',
                    trajectory_id: trajectory.trajectory_id,
                    field,
                    message: `Missing required field: ${field}`,
                    suggestion: `Ensure ${field} is present in trajectory data`,
                });
            }
        }
        if (trajectory.metadata) {
            const requiredMetadataFields = ['model_version', 'created_at', 'validation_status'];
            for (const field of requiredMetadataFields) {
                if (!trajectory.metadata[field]) {
                    issues.push({
                        type: 'MISSING_FIELD',
                        severity: 'HIGH',
                        trajectory_id: trajectory.trajectory_id,
                        field: `metadata.${field}`,
                        message: `Missing required metadata field: ${field}`,
                        suggestion: `Ensure metadata.${field} is present`,
                    });
                }
            }
        }
        if (trajectory.steps && trajectory.steps.length > 0) {
            for (let i = 0; i < trajectory.steps.length; i++) {
                const step = trajectory.steps[i];
                const stepRequiredFields = ['state', 'action', 'reward', 'timestamp'];
                for (const field of stepRequiredFields) {
                    if (!step[field]) {
                        issues.push({
                            type: 'MISSING_FIELD',
                            severity: 'HIGH',
                            trajectory_id: trajectory.trajectory_id,
                            step_index: i,
                            field: `steps[${i}].${field}`,
                            message: `Missing required field in step ${i}: ${field}`,
                            suggestion: `Ensure step ${i} has ${field}`,
                        });
                    }
                }
            }
        }
        return issues;
    }
    checkFormat(trajectory) {
        var _a;
        const issues = [];
        if (trajectory.trajectory_id && !trajectory.trajectory_id.startsWith('traj_')) {
            issues.push({
                type: 'INVALID_FORMAT',
                severity: 'MEDIUM',
                trajectory_id: trajectory.trajectory_id,
                field: 'trajectory_id',
                message: `Invalid trajectory_id format: should start with 'traj_'`,
                suggestion: 'Ensure trajectory_id follows the pattern: traj_*',
            });
        }
        if ((_a = trajectory.metadata) === null || _a === void 0 ? void 0 : _a.created_at) {
            if (isNaN(Date.parse(trajectory.metadata.created_at))) {
                issues.push({
                    type: 'INVALID_FORMAT',
                    severity: 'MEDIUM',
                    trajectory_id: trajectory.trajectory_id,
                    field: 'metadata.created_at',
                    message: `Invalid timestamp format: ${trajectory.metadata.created_at}`,
                    suggestion: 'Ensure timestamp is in ISO 8601 format',
                });
            }
        }
        if (trajectory.steps) {
            for (let i = 0; i < trajectory.steps.length; i++) {
                const step = trajectory.steps[i];
                if (step.timestamp && isNaN(Date.parse(step.timestamp))) {
                    issues.push({
                        type: 'INVALID_FORMAT',
                        severity: 'MEDIUM',
                        trajectory_id: trajectory.trajectory_id,
                        step_index: i,
                        field: `steps[${i}].timestamp`,
                        message: `Invalid timestamp format in step ${i}`,
                        suggestion: 'Ensure timestamp is in ISO 8601 format',
                    });
                }
            }
        }
        return issues;
    }
    checkAnomalies(trajectory) {
        var _a, _b, _c;
        const issues = [];
        if (((_a = trajectory.metadata) === null || _a === void 0 ? void 0 : _a.total_reward) !== undefined) {
            const reward = trajectory.metadata.total_reward;
            if (reward < 0 || reward > 1) {
                issues.push({
                    type: 'ANOMALY',
                    severity: 'HIGH',
                    trajectory_id: trajectory.trajectory_id,
                    field: 'metadata.total_reward',
                    message: `Reward out of range: ${reward} (expected 0-1)`,
                    suggestion: 'Ensure reward is normalized to 0-1 range',
                });
            }
        }
        if (((_b = trajectory.metadata) === null || _b === void 0 ? void 0 : _b.validation_score) !== undefined) {
            const score = trajectory.metadata.validation_score;
            if (score < 0 || score > 1) {
                issues.push({
                    type: 'ANOMALY',
                    severity: 'HIGH',
                    trajectory_id: trajectory.trajectory_id,
                    field: 'metadata.validation_score',
                    message: `Validation score out of range: ${score} (expected 0-1)`,
                    suggestion: 'Ensure validation_score is normalized to 0-1 range',
                });
            }
        }
        if (trajectory.steps) {
            for (let i = 0; i < trajectory.steps.length; i++) {
                const step = trajectory.steps[i];
                if (((_c = step.reward) === null || _c === void 0 ? void 0 : _c.total_reward) !== undefined) {
                    const reward = step.reward.total_reward;
                    if (reward < -1 || reward > 1) {
                        issues.push({
                            type: 'ANOMALY',
                            severity: 'MEDIUM',
                            trajectory_id: trajectory.trajectory_id,
                            step_index: i,
                            field: `steps[${i}].reward.total_reward`,
                            message: `Reward out of range in step ${i}: ${reward} (expected -1 to 1)`,
                            suggestion: 'Ensure reward is in valid range',
                        });
                    }
                }
            }
        }
        if (trajectory.steps) {
            if (trajectory.steps.length === 0) {
                issues.push({
                    type: 'ANOMALY',
                    severity: 'CRITICAL',
                    trajectory_id: trajectory.trajectory_id,
                    message: 'Trajectory has no steps',
                    suggestion: 'Ensure trajectory has at least one step',
                });
            }
            else if (trajectory.steps.length > 100) {
                issues.push({
                    type: 'ANOMALY',
                    severity: 'MEDIUM',
                    trajectory_id: trajectory.trajectory_id,
                    message: `Trajectory has too many steps: ${trajectory.steps.length}`,
                    suggestion: 'Consider splitting long trajectories',
                });
            }
        }
        return issues;
    }
    checkChainIntegrity(trajectory) {
        const issues = [];
        if (!trajectory.steps || trajectory.steps.length === 0) {
            return issues;
        }
        for (let i = 0; i < trajectory.steps.length; i++) {
            const step = trajectory.steps[i];
            if (!step.state) {
                issues.push({
                    type: 'INCOMPLETE_CHAIN',
                    severity: 'CRITICAL',
                    trajectory_id: trajectory.trajectory_id,
                    step_index: i,
                    message: `Step ${i} missing state (s)`,
                    suggestion: 'Ensure each step has a state',
                });
            }
            if (!step.action) {
                issues.push({
                    type: 'INCOMPLETE_CHAIN',
                    severity: 'CRITICAL',
                    trajectory_id: trajectory.trajectory_id,
                    step_index: i,
                    message: `Step ${i} missing action (a)`,
                    suggestion: 'Ensure each step has an action',
                });
            }
            if (!step.reward) {
                issues.push({
                    type: 'INCOMPLETE_CHAIN',
                    severity: 'HIGH',
                    trajectory_id: trajectory.trajectory_id,
                    step_index: i,
                    message: `Step ${i} missing reward (r)`,
                    suggestion: 'Ensure each step has a reward',
                });
            }
            if (i < trajectory.steps.length - 1 && !step.next_state) {
                issues.push({
                    type: 'INCOMPLETE_CHAIN',
                    severity: 'MEDIUM',
                    trajectory_id: trajectory.trajectory_id,
                    step_index: i,
                    message: `Step ${i} missing next_state (s')`,
                    suggestion: 'Ensure non-terminal steps have next_state',
                });
            }
            if (i < trajectory.steps.length - 1 && step.next_state && trajectory.steps[i + 1].state) {
                if (step.next_state.request_id !== trajectory.steps[i + 1].state.request_id) {
                    issues.push({
                        type: 'INCOMPLETE_CHAIN',
                        severity: 'MEDIUM',
                        trajectory_id: trajectory.trajectory_id,
                        step_index: i,
                        message: `Step ${i} next_state inconsistent with step ${i + 1} state`,
                        suggestion: 'Ensure state transitions are consistent',
                    });
                }
            }
        }
        return issues;
    }
    checkDuplicates(trajectories) {
        const issues = [];
        const seenIds = new Set();
        for (const trajectory of trajectories) {
            if (seenIds.has(trajectory.trajectory_id)) {
                issues.push({
                    type: 'DUPLICATE',
                    severity: 'HIGH',
                    trajectory_id: trajectory.trajectory_id,
                    message: `Duplicate trajectory_id: ${trajectory.trajectory_id}`,
                    suggestion: 'Remove duplicate trajectories',
                });
            }
            else {
                seenIds.add(trajectory.trajectory_id);
            }
        }
        return issues;
    }
    calculateQualityScore(issues) {
        if (issues.length === 0) {
            return 1.0;
        }
        let totalPenalty = 0;
        for (const issue of issues) {
            switch (issue.severity) {
                case 'CRITICAL':
                    totalPenalty += 0.5;
                    break;
                case 'HIGH':
                    totalPenalty += 0.2;
                    break;
                case 'MEDIUM':
                    totalPenalty += 0.1;
                    break;
                case 'LOW':
                    totalPenalty += 0.05;
                    break;
            }
        }
        return Math.max(0, 1 - Math.min(totalPenalty, 1));
    }
    calculateCompletenessRate(trajectories, issues) {
        const missingFieldIssues = issues.filter((i) => i.type === 'MISSING_FIELD');
        const totalFields = trajectories.length * 10;
        const missingFields = missingFieldIssues.length;
        return Math.max(0, 1 - missingFields / totalFields);
    }
    calculateIntegrityRate(trajectories, issues) {
        const incompleteChainIssues = issues.filter((i) => i.type === 'INCOMPLETE_CHAIN');
        const totalSteps = trajectories.reduce((sum, t) => { var _a; return sum + (((_a = t.steps) === null || _a === void 0 ? void 0 : _a.length) || 0); }, 0);
        const incompleteSteps = incompleteChainIssues.length;
        return totalSteps > 0 ? Math.max(0, 1 - incompleteSteps / totalSteps) : 1.0;
    }
};
exports.DataQualityCheckerService = DataQualityCheckerService;
exports.DataQualityCheckerService = DataQualityCheckerService = DataQualityCheckerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DataQualityCheckerService);
//# sourceMappingURL=data-quality-checker.service.js.map
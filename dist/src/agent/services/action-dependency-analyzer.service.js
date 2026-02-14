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
var ActionDependencyAnalyzerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionDependencyAnalyzerService = void 0;
const common_1 = require("@nestjs/common");
const action_registry_service_1 = require("./action-registry.service");
let ActionDependencyAnalyzerService = ActionDependencyAnalyzerService_1 = class ActionDependencyAnalyzerService {
    constructor(actionRegistry) {
        this.actionRegistry = actionRegistry;
        this.logger = new common_1.Logger(ActionDependencyAnalyzerService_1.name);
    }
    findParallelizableActions(candidateActions, state) {
        if (candidateActions.length === 0) {
            return [];
        }
        const dependencies = candidateActions.map(action => {
            const actionDef = this.actionRegistry.get(action.name);
            if (!actionDef) {
                return null;
            }
            return this.analyzeActionDependency(action, actionDef, state);
        }).filter(Boolean);
        const parallelGroups = [];
        const processed = new Set();
        for (let i = 0; i < candidateActions.length; i++) {
            if (processed.has(i)) {
                continue;
            }
            const currentGroup = [candidateActions[i]];
            processed.add(i);
            const currentDeps = dependencies[i];
            for (let j = i + 1; j < candidateActions.length; j++) {
                if (processed.has(j)) {
                    continue;
                }
                const otherDeps = dependencies[j];
                if (this.canExecuteInParallel(currentDeps, otherDeps)) {
                    currentGroup.push(candidateActions[j]);
                    processed.add(j);
                }
            }
            if (currentGroup.length > 0) {
                parallelGroups.push(currentGroup);
            }
        }
        return parallelGroups;
    }
    analyzeActionDependency(action, actionDef, state) {
        const preconditions = actionDef.metadata.preconditions || [];
        const sideEffects = this.inferSideEffects(actionDef.metadata, action.name);
        return {
            actionName: action.name,
            preconditions,
            sideEffects,
        };
    }
    inferSideEffects(metadata, actionName) {
        const sideEffects = [];
        if (metadata.side_effect === 'writes_db') {
            if (actionName.includes('trip')) {
                sideEffects.push('trip');
                sideEffects.push('draft');
            }
            if (actionName.includes('places')) {
                sideEffects.push('memory.semantic_facts.pois');
            }
            if (actionName.includes('transport')) {
                sideEffects.push('compute.time_matrix_api');
                sideEffects.push('compute.time_matrix_robust');
            }
        }
        else if (metadata.side_effect === 'calls_api') {
            if (actionName.includes('places')) {
                sideEffects.push('memory.semantic_facts.pois');
            }
            if (actionName.includes('transport')) {
                sideEffects.push('compute.time_matrix_api');
            }
        }
        if (actionName.startsWith('places.resolve_entities')) {
            sideEffects.push('draft.nodes');
        }
        if (actionName.startsWith('places.get_poi_facts')) {
            sideEffects.push('memory.semantic_facts.pois');
        }
        if (actionName.startsWith('transport.build_time_matrix')) {
            sideEffects.push('compute.time_matrix_api');
            sideEffects.push('compute.time_matrix_robust');
        }
        if (actionName.startsWith('itinerary.optimize')) {
            sideEffects.push('compute.optimization_results');
            sideEffects.push('result.timeline');
        }
        if (actionName.startsWith('policy.validate')) {
            sideEffects.push('result.status');
        }
        return sideEffects;
    }
    canExecuteInParallel(dep1, dep2) {
        for (const sideEffect of dep1.sideEffects) {
            for (const precondition of dep2.preconditions) {
                if (this.pathOverlaps(sideEffect, precondition)) {
                    this.logger.debug(`Actions cannot run in parallel: ${dep1.actionName} affects ${sideEffect} ` +
                        `which is required by ${dep2.actionName} (${precondition})`);
                    return false;
                }
            }
        }
        for (const sideEffect of dep2.sideEffects) {
            for (const precondition of dep1.preconditions) {
                if (this.pathOverlaps(sideEffect, precondition)) {
                    this.logger.debug(`Actions cannot run in parallel: ${dep2.actionName} affects ${sideEffect} ` +
                        `which is required by ${dep1.actionName} (${precondition})`);
                    return false;
                }
            }
        }
        for (const sideEffect1 of dep1.sideEffects) {
            for (const sideEffect2 of dep2.sideEffects) {
                if (this.pathOverlaps(sideEffect1, sideEffect2)) {
                    this.logger.debug(`Actions cannot run in parallel: both ${dep1.actionName} and ${dep2.actionName} ` +
                        `modify ${sideEffect1}/${sideEffect2}`);
                    return false;
                }
            }
        }
        return true;
    }
    pathOverlaps(path1, path2) {
        if (path1 === path2) {
            return true;
        }
        const parts1 = path1.split('.');
        const parts2 = path2.split('.');
        if (parts1.length <= parts2.length) {
            const isPrefix = parts1.every((part, index) => part === parts2[index]);
            if (isPrefix) {
                return true;
            }
        }
        if (parts2.length <= parts1.length) {
            const isPrefix = parts2.every((part, index) => part === parts1[index]);
            if (isPrefix) {
                return true;
            }
        }
        return false;
    }
};
exports.ActionDependencyAnalyzerService = ActionDependencyAnalyzerService;
exports.ActionDependencyAnalyzerService = ActionDependencyAnalyzerService = ActionDependencyAnalyzerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [action_registry_service_1.ActionRegistryService])
], ActionDependencyAnalyzerService);
//# sourceMappingURL=action-dependency-analyzer.service.js.map
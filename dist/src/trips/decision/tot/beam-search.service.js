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
var BeamSearchService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BeamSearchService = void 0;
const common_1 = require("@nestjs/common");
const tot_evaluator_service_1 = require("./tot-evaluator.service");
let BeamSearchService = BeamSearchService_1 = class BeamSearchService {
    constructor(evaluator) {
        this.evaluator = evaluator;
        this.logger = new common_1.Logger(BeamSearchService_1.name);
    }
    async search(root, expand, config = {}) {
        const { beamWidth = 4, maxDepth = 3, timeBudgetMs = 1200, } = config;
        const startTime = Date.now();
        let frontier = [root];
        let totalEvaluated = 0;
        let totalRejected = 0;
        for (let depth = 0; depth < maxDepth; depth++) {
            if (Date.now() - startTime > timeBudgetMs) {
                this.logger.warn(`Beam Search 超时，在深度 ${depth} 停止`);
                break;
            }
            const scored = await Promise.all(frontier.map(async (node) => {
                const score = await this.evaluator.evaluate(node);
                totalEvaluated++;
                if (!score.allowed) {
                    totalRejected++;
                }
                return { node, score };
            }));
            const allowed = scored.filter(x => x.score.allowed);
            if (allowed.length === 0) {
                this.logger.warn(`Beam Search 在深度 ${depth} 时所有候选被硬门控拒绝`);
                break;
            }
            allowed.sort((a, b) => b.score.score - a.score.score);
            const topK = allowed.slice(0, beamWidth).map(x => x.node);
            frontier = await expand(topK);
            if (frontier.length === 0) {
                this.logger.debug(`Beam Search 在深度 ${depth} 时无法继续扩展`);
                break;
            }
        }
        const finalScored = await Promise.all(frontier.map(async (node) => {
            const score = await this.evaluator.evaluate(node);
            totalEvaluated++;
            if (!score.allowed) {
                totalRejected++;
            }
            return { node, score };
        }));
        const finalAllowed = finalScored.filter(x => x.score.allowed);
        if (finalAllowed.length === 0) {
            return {
                best: null,
                bestScore: 0,
                candidates: finalScored,
                stats: {
                    totalEvaluated,
                    totalRejected,
                    depth: maxDepth,
                },
            };
        }
        finalAllowed.sort((a, b) => b.score.score - a.score.score);
        const best = finalAllowed[0];
        return {
            best: best.node,
            bestScore: best.score.score,
            candidates: finalScored,
            stats: {
                totalEvaluated,
                totalRejected,
                depth: maxDepth,
            },
        };
    }
    async expandFromNeptuneCandidates(parent, candidates) {
        return candidates.map((candidate, index) => ({
            ...parent,
            id: `${parent.id}_${index}`,
            parentId: parent.id,
            depth: parent.depth + 1,
            plan: candidate.plan,
            operator: 'NEPTUNE_REPAIR',
            rationale: candidate.explanation,
        }));
    }
};
exports.BeamSearchService = BeamSearchService;
exports.BeamSearchService = BeamSearchService = BeamSearchService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tot_evaluator_service_1.ToTEvaluatorService])
], BeamSearchService);
//# sourceMappingURL=beam-search.service.js.map
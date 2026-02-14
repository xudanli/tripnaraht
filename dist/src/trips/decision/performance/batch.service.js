"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var BatchProcessingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchProcessingService = void 0;
const common_1 = require("@nestjs/common");
let BatchProcessingService = BatchProcessingService_1 = class BatchProcessingService {
    constructor() {
        this.logger = new common_1.Logger(BatchProcessingService_1.name);
    }
    async batchGeneratePlans(states, generator) {
        this.logger.log(`Batch generating ${states.length} plans`);
        const results = await Promise.all(states.map(async (state) => {
            try {
                const { plan, log } = await generator(state);
                return { state, plan, log };
            }
            catch (error) {
                this.logger.error(`Failed to generate plan for state:`, error);
                return null;
            }
        }));
        const validResults = results.filter((r) => r !== null);
        this.logger.log(`Batch generation completed: ${validResults.length}/${states.length} succeeded`);
        return validResults;
    }
    async batchCheckConstraints(plans, checker) {
        this.logger.log(`Batch checking ${plans.length} plans`);
        const results = await Promise.all(plans.map(async ({ plan, state }) => {
            try {
                const result = checker(state, plan);
                return { plan, result };
            }
            catch (error) {
                this.logger.error(`Failed to check constraints:`, error);
                return { plan, result: null };
            }
        }));
        return results;
    }
    async batchEvaluate(plans, evaluator) {
        this.logger.log(`Batch evaluating ${plans.length} plans`);
        const results = await Promise.all(plans.map(async ({ plan, state, constraintResult }) => {
            try {
                const metrics = evaluator(state, plan, constraintResult);
                return { plan, metrics };
            }
            catch (error) {
                this.logger.error(`Failed to evaluate plan:`, error);
                return { plan, metrics: null };
            }
        }));
        return results;
    }
};
exports.BatchProcessingService = BatchProcessingService;
exports.BatchProcessingService = BatchProcessingService = BatchProcessingService_1 = __decorate([
    (0, common_1.Injectable)()
], BatchProcessingService);
//# sourceMappingURL=batch.service.js.map
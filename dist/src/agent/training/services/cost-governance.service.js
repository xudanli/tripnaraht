"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var CostGovernanceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CostGovernanceService = void 0;
const common_1 = require("@nestjs/common");
let CostGovernanceService = CostGovernanceService_1 = class CostGovernanceService {
    constructor() {
        this.logger = new common_1.Logger(CostGovernanceService_1.name);
        this.budgets = new Map();
        this.costs = new Map();
    }
    async checkBudget(requestId, budgetType, amount) {
        const budget = this.getOrCreateBudget(requestId, budgetType);
        const remaining = budget.limit - budget.used;
        const allowed = remaining >= amount;
        const exceeded = budget.used >= budget.limit;
        if (exceeded) {
            this.logger.warn(`[CostGovernance] 预算超限: requestId=${requestId}, type=${budgetType}, used=${budget.used}, limit=${budget.limit}`);
        }
        return {
            allowed,
            remaining: Math.max(0, remaining),
            exceeded,
        };
    }
    async trackCost(requestId, budgetType, amount, metadata) {
        const budget = this.getOrCreateBudget(requestId, budgetType);
        budget.used += amount;
        if (!this.costs.has(requestId)) {
            this.costs.set(requestId, []);
        }
        this.costs.get(requestId).push({
            request_id: requestId,
            budget_type: budgetType,
            amount,
            timestamp: Date.now(),
            metadata: metadata || {},
        });
        this.logger.debug(`[CostGovernance] 记录成本: requestId=${requestId}, type=${budgetType}, amount=${amount}, total=${budget.used}`);
    }
    getOrCreateBudget(requestId, budgetType) {
        const key = `${requestId}_${budgetType}`;
        if (!this.budgets.has(key)) {
            const defaultLimits = {
                TOKEN: 100000,
                TOOL: 50,
                LATENCY: 30000,
            };
            this.budgets.set(key, {
                request_id: requestId,
                budget_type: budgetType,
                limit: defaultLimits[budgetType],
                used: 0,
                created_at: Date.now(),
            });
        }
        return this.budgets.get(key);
    }
    setBudgetLimit(requestId, budgetType, limit) {
        const budget = this.getOrCreateBudget(requestId, budgetType);
        budget.limit = limit;
        this.logger.log(`[CostGovernance] 设置预算限制: requestId=${requestId}, type=${budgetType}, limit=${limit}`);
    }
    getCostRecords(requestId) {
        return this.costs.get(requestId) || [];
    }
    getBudgetUsage(requestId, budgetType) {
        const key = `${requestId}_${budgetType}`;
        return this.budgets.get(key) || null;
    }
};
exports.CostGovernanceService = CostGovernanceService;
exports.CostGovernanceService = CostGovernanceService = CostGovernanceService_1 = __decorate([
    (0, common_1.Injectable)()
], CostGovernanceService);
//# sourceMappingURL=cost-governance.service.js.map
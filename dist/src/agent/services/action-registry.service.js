"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ActionRegistryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionRegistryService = void 0;
const common_1 = require("@nestjs/common");
let ActionRegistryService = ActionRegistryService_1 = class ActionRegistryService {
    constructor() {
        this.logger = new common_1.Logger(ActionRegistryService_1.name);
        this.actions = new Map();
    }
    register(action) {
        if (this.actions.has(action.name)) {
            this.logger.warn(`Action ${action.name} already registered, overwriting`);
        }
        this.actions.set(action.name, action);
        this.logger.debug(`Registered action: ${action.name}`);
    }
    registerMany(actions) {
        actions.forEach(action => this.register(action));
    }
    get(name) {
        return this.actions.get(name);
    }
    has(name) {
        return this.actions.has(name);
    }
    list() {
        return Array.from(this.actions.values());
    }
    findByCategory(category) {
        return this.list().filter(action => action.name.startsWith(`${category}.`));
    }
    checkPreconditions(actionName, state) {
        const action = this.get(actionName);
        if (!action) {
            return false;
        }
        for (const precondition of action.metadata.preconditions) {
            if (!this.evaluatePrecondition(precondition, state)) {
                return false;
            }
        }
        return true;
    }
    evaluatePrecondition(precondition, state) {
        const parts = precondition.split('.');
        let current = state;
        for (const part of parts) {
            if (current === undefined || current === null) {
                return false;
            }
            current = current[part];
        }
        return current !== undefined && current !== null;
    }
};
exports.ActionRegistryService = ActionRegistryService;
exports.ActionRegistryService = ActionRegistryService = ActionRegistryService_1 = __decorate([
    (0, common_1.Injectable)()
], ActionRegistryService);
//# sourceMappingURL=action-registry.service.js.map
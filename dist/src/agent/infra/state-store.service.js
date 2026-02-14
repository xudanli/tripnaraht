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
var StateStoreService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateStoreService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let StateStoreService = StateStoreService_1 = class StateStoreService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(StateStoreService_1.name);
        this.states = new Map();
        this.changeHistory = new Map();
        this.checkpoints = new Map();
        this.LOCK_TIMEOUT_MS = 30000;
        this.logger.log('🗄️ StateStore 已初始化');
    }
    async get(stateId, stateType) {
        const key = this.getKey(stateId, stateType);
        const state = this.states.get(key);
        if (!state) {
            return null;
        }
        return {
            data: state.data,
            meta: state.meta,
        };
    }
    async getVersion(stateId, stateType) {
        var _a;
        const state = await this.get(stateId, stateType);
        return (_a = state === null || state === void 0 ? void 0 : state.meta.version) !== null && _a !== void 0 ? _a : null;
    }
    async getHistory(stateId, stateType, limit = 50) {
        const key = this.getKey(stateId, stateType);
        const history = this.changeHistory.get(key) || [];
        return history.slice(-limit);
    }
    async getCheckpoints(stateId, stateType) {
        const key = this.getKey(stateId, stateType);
        return this.checkpoints.get(key) || [];
    }
    async create(stateId, stateType, initialData, actor, traceId) {
        const key = this.getKey(stateId, stateType);
        if (this.states.has(key)) {
            return {
                success: false,
                version: 0,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: `State ${stateId} already exists`,
                },
            };
        }
        const now = new Date().toISOString();
        const meta = {
            stateId,
            stateType,
            version: 1,
            createdAt: now,
            updatedAt: now,
        };
        this.states.set(key, { data: initialData, meta });
        const changeId = this.generateId('change');
        const change = {
            changeId,
            stateId,
            stateType,
            version: 1,
            previousVersion: 0,
            patches: [{ op: 'add', path: '/', value: initialData }],
            meta: {
                traceId,
                actor,
                action: 'create',
                reason: 'Initial creation',
                timestamp: now,
            },
        };
        this.addToHistory(key, change);
        this.logger.debug(`[StateStore] 创建状态: ${stateType}/${stateId} v1`);
        return {
            success: true,
            version: 1,
            changeId,
        };
    }
    async update(stateId, stateType, patches, expectedVersion, actor, traceId, options) {
        const key = this.getKey(stateId, stateType);
        const state = this.states.get(key);
        if (!state) {
            return {
                success: false,
                version: 0,
                error: {
                    code: 'NOT_FOUND',
                    message: `State ${stateId} not found`,
                },
            };
        }
        if (state.meta.version !== expectedVersion) {
            this.logger.warn(`[StateStore] 版本冲突: ${stateType}/${stateId} expected=${expectedVersion} actual=${state.meta.version}`);
            return {
                success: false,
                version: state.meta.version,
                error: {
                    code: 'VERSION_CONFLICT',
                    message: `Version conflict: expected ${expectedVersion}, actual ${state.meta.version}`,
                    currentVersion: state.meta.version,
                },
            };
        }
        if (state.meta.lockedBy && state.meta.lockExpiresAt) {
            const lockExpires = new Date(state.meta.lockExpiresAt).getTime();
            if (lockExpires > Date.now() && state.meta.lockedBy !== actor) {
                return {
                    success: false,
                    version: state.meta.version,
                    error: {
                        code: 'LOCKED',
                        message: `State is locked by ${state.meta.lockedBy}`,
                    },
                };
            }
        }
        const newData = this.applyPatches(state.data, patches);
        const newVersion = state.meta.version + 1;
        const now = new Date().toISOString();
        state.data = newData;
        state.meta.version = newVersion;
        state.meta.updatedAt = now;
        const changeId = this.generateId('change');
        const change = {
            changeId,
            stateId,
            stateType,
            version: newVersion,
            previousVersion: expectedVersion,
            patches,
            meta: {
                traceId,
                actor,
                action: (options === null || options === void 0 ? void 0 : options.action) || 'update',
                reason: (options === null || options === void 0 ? void 0 : options.reason) || 'State update',
                timestamp: now,
            },
            compensations: options === null || options === void 0 ? void 0 : options.compensations,
        };
        this.addToHistory(key, change);
        this.logger.debug(`[StateStore] 更新状态: ${stateType}/${stateId} v${expectedVersion} -> v${newVersion}`);
        return {
            success: true,
            version: newVersion,
            changeId,
        };
    }
    async createCheckpoint(stateId, stateType, actor, reason) {
        const state = await this.get(stateId, stateType);
        if (!state) {
            return null;
        }
        const checkpoint = {
            checkpointId: this.generateId('checkpoint'),
            stateId,
            stateType,
            version: state.meta.version,
            snapshot: JSON.parse(JSON.stringify(state.data)),
            createdAt: new Date().toISOString(),
            createdBy: actor,
            reason,
        };
        const key = this.getKey(stateId, stateType);
        const checkpointList = this.checkpoints.get(key) || [];
        checkpointList.push(checkpoint);
        this.checkpoints.set(key, checkpointList);
        this.logger.debug(`[StateStore] 创建检查点: ${stateType}/${stateId} v${state.meta.version}`);
        return checkpoint;
    }
    async rollbackToCheckpoint(stateId, stateType, checkpointId, actor, traceId) {
        const key = this.getKey(stateId, stateType);
        const checkpointList = this.checkpoints.get(key) || [];
        const checkpoint = checkpointList.find(c => c.checkpointId === checkpointId);
        if (!checkpoint) {
            return {
                success: false,
                rolledBackTo: 0,
                compensationsExecuted: 0,
                error: 'Checkpoint not found',
            };
        }
        const state = this.states.get(key);
        if (!state) {
            return {
                success: false,
                rolledBackTo: 0,
                compensationsExecuted: 0,
                error: 'State not found',
            };
        }
        const history = this.changeHistory.get(key) || [];
        const changesToRollback = history.filter(c => c.version > checkpoint.version);
        let compensationsExecuted = 0;
        for (const change of changesToRollback.reverse()) {
            if (change.compensations) {
                for (const comp of change.compensations) {
                    if (!comp.executed) {
                        await this.executeCompensation(comp);
                        compensationsExecuted++;
                    }
                }
            }
        }
        const newVersion = state.meta.version + 1;
        const now = new Date().toISOString();
        state.data = JSON.parse(JSON.stringify(checkpoint.snapshot));
        state.meta.version = newVersion;
        state.meta.updatedAt = now;
        const change = {
            changeId: this.generateId('change'),
            stateId,
            stateType,
            version: newVersion,
            previousVersion: state.meta.version - 1,
            patches: [{ op: 'replace', path: '/', value: checkpoint.snapshot }],
            meta: {
                traceId,
                actor,
                action: 'rollback',
                reason: `Rollback to checkpoint ${checkpointId}`,
                timestamp: now,
            },
            checkpointId,
        };
        this.addToHistory(key, change);
        this.logger.log(`[StateStore] 回滚成功: ${stateType}/${stateId} -> v${checkpoint.version} (checkpoint)`);
        return {
            success: true,
            rolledBackTo: checkpoint.version,
            compensationsExecuted,
        };
    }
    async acquireLock(stateId, stateType, actor) {
        const state = await this.get(stateId, stateType);
        if (!state) {
            return false;
        }
        if (state.meta.lockedBy && state.meta.lockExpiresAt) {
            const lockExpires = new Date(state.meta.lockExpiresAt).getTime();
            if (lockExpires > Date.now() && state.meta.lockedBy !== actor) {
                return false;
            }
        }
        state.meta.lockedBy = actor;
        state.meta.lockExpiresAt = new Date(Date.now() + this.LOCK_TIMEOUT_MS).toISOString();
        return true;
    }
    async releaseLock(stateId, stateType, actor) {
        const state = await this.get(stateId, stateType);
        if (!state) {
            return false;
        }
        if (state.meta.lockedBy === actor) {
            state.meta.lockedBy = undefined;
            state.meta.lockExpiresAt = undefined;
            return true;
        }
        return false;
    }
    async rebaseAndRetry(stateId, stateType, patchGenerator, actor, traceId, maxRetries = 3) {
        var _a;
        let retries = 0;
        while (retries < maxRetries) {
            const state = await this.get(stateId, stateType);
            if (!state) {
                return {
                    success: false,
                    version: 0,
                    error: { code: 'NOT_FOUND', message: 'State not found' },
                };
            }
            const patches = patchGenerator(state.data);
            const result = await this.update(stateId, stateType, patches, state.meta.version, actor, traceId, { action: 'rebase_retry', reason: `Retry ${retries + 1}` });
            if (result.success || ((_a = result.error) === null || _a === void 0 ? void 0 : _a.code) !== 'VERSION_CONFLICT') {
                return result;
            }
            retries++;
            this.logger.warn(`[StateStore] 版本冲突，重试 ${retries}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, 100 * retries));
        }
        return {
            success: false,
            version: 0,
            error: {
                code: 'VERSION_CONFLICT',
                message: `Failed after ${maxRetries} retries`,
            },
        };
    }
    getKey(stateId, stateType) {
        return `${stateType}:${stateId}`;
    }
    generateId(prefix) {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    addToHistory(key, change) {
        const history = this.changeHistory.get(key) || [];
        history.push(change);
        if (history.length > 1000) {
            history.splice(0, history.length - 1000);
        }
        this.changeHistory.set(key, history);
    }
    applyPatches(data, patches) {
        let result = JSON.parse(JSON.stringify(data));
        for (const patch of patches) {
            const pathParts = patch.path.split('/').filter(p => p);
            switch (patch.op) {
                case 'replace':
                case 'add':
                    if (pathParts.length === 0) {
                        result = patch.value;
                    }
                    else {
                        let current = result;
                        for (let i = 0; i < pathParts.length - 1; i++) {
                            current = current[pathParts[i]];
                        }
                        current[pathParts[pathParts.length - 1]] = patch.value;
                    }
                    break;
                case 'remove':
                    if (pathParts.length > 0) {
                        let current = result;
                        for (let i = 0; i < pathParts.length - 1; i++) {
                            current = current[pathParts[i]];
                        }
                        delete current[pathParts[pathParts.length - 1]];
                    }
                    break;
            }
        }
        return result;
    }
    async executeCompensation(compensation) {
        this.logger.debug(`[StateStore] 执行补偿动作: ${compensation.type} - ${compensation.action}`);
        compensation.executed = true;
        compensation.executedAt = new Date().toISOString();
    }
};
exports.StateStoreService = StateStoreService;
exports.StateStoreService = StateStoreService = StateStoreService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], StateStoreService);
//# sourceMappingURL=state-store.service.js.map
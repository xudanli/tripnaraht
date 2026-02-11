// src/trips/decision/optimization/controllers/index.ts
/**
 * Optimization Controllers Export
 * 
 * 按端分组:
 * - /api/v2/user/*   - 用户端 API
 * - /api/v2/admin/*  - 管理端 API
 */

// ========== 用户端控制器 ==========
export * from './user';

// ========== 管理端控制器 ==========
export * from './admin';

// ========== 旧版控制器（保留兼容） ==========
export { OptimizationController } from './optimization.controller';
export { TeamCollaborationController } from './team-collaboration.controller';
export { RealtimeStateController } from './realtime-state.controller';
export { ABTestingController } from './ab-testing.controller';
export { AxiomValidationController } from './axiom-validation.controller';

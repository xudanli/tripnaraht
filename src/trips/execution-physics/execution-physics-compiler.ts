import type { ExecutionCompilerAST } from '../compiler-ast/execution-compiler-ast.types';
import type { CompiledExecutionPhysics, ExecutionPhysicsModel } from './execution-physics.types';

export function transformTimeSemantics(model: ExecutionPhysicsModel): CompiledExecutionPhysics['rewrittenTimeRules'] {
  return {
    interpretation: model.timeModel.type,
    driftPolicy: model.timeModel.driftBehavior,
    constraintEnvelope: model.constraints,
  };
}

export function transformCausality(model: ExecutionPhysicsModel): CompiledExecutionPhysics['rewrittenCausality'] {
  return {
    mode: model.causalityModel,
    orderingLaw: model.constraints,
  };
}

export function transformStateModel(model: ExecutionPhysicsModel): CompiledExecutionPhysics['rewrittenStateRules'] {
  return {
    collapseDefault: model.stateTransitionModel.defaultCollapse,
    physicsVersion: model.version,
  };
}

export function compileExecutionPhysics(
  physicsModel: ExecutionPhysicsModel,
  compilerAst: ExecutionCompilerAST,
): CompiledExecutionPhysics {
  return {
    rewrittenTimeRules: {
      ...transformTimeSemantics(physicsModel),
      compilerOptimizationCount: compilerAst.optimizations.length,
      loweringRuleCount: compilerAst.loweringRules.length,
    },
    rewrittenCausality: transformCausality(physicsModel),
    rewrittenStateRules: transformStateModel(physicsModel),
  };
}

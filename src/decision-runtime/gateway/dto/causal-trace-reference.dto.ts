import { IsIn, IsString } from 'class-validator';
import { CAUSAL_TRACE_PROTOCOL_VERSION } from '../../../causal-protocol/causal-trace-reference.types';

export class CausalTraceReferenceDto {
  @IsString()
  traceId!: string;

  @IsString()
  worldStateVersion!: string;

  @IsIn([CAUSAL_TRACE_PROTOCOL_VERSION])
  protocolVersion!: typeof CAUSAL_TRACE_PROTOCOL_VERSION;
}

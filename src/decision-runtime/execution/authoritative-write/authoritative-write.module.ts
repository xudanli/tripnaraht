import { Module } from '@nestjs/common';
import { AuthoritativeWriteGatewayService } from './authoritative-write-gateway.service';

/**
 * UWC v1 Nest module — gateway only.
 * Corridor HTTP controllers stay on existing paths; bind handlers in a later ticket.
 */
@Module({
  providers: [AuthoritativeWriteGatewayService],
  exports: [AuthoritativeWriteGatewayService],
})
export class AuthoritativeWriteModule {}

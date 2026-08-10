import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AuthoritativeWriteGatewayService } from './authoritative-write-gateway.service';
import { AuthoritativeWriteHandlerRegistryService } from './corridor-handler.registry';
import { AuthoritativeWriteShadowProbeService } from './authoritative-write-shadow-probe.service';
import { ClientWriteProtocolService } from './client-write-protocol.service';
import { ClientWriteProtocolController } from './client-write-protocol.controller';

/**
 * UWC v1 Nest module — handlers, shadow probe, UWC-1e protocol + HTTP adapter.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ClientWriteProtocolController],
  providers: [
    AuthoritativeWriteHandlerRegistryService,
    AuthoritativeWriteGatewayService,
    AuthoritativeWriteShadowProbeService,
    ClientWriteProtocolService,
  ],
  exports: [
    AuthoritativeWriteHandlerRegistryService,
    AuthoritativeWriteGatewayService,
    AuthoritativeWriteShadowProbeService,
    ClientWriteProtocolService,
  ],
})
export class AuthoritativeWriteModule {}

import { Module } from '@nestjs/common';
import { AuthoritativeWriteGatewayService } from './authoritative-write-gateway.service';
import { AuthoritativeWriteHandlerRegistryService } from './corridor-handler.registry';
import { AuthoritativeWriteShadowProbeService } from './authoritative-write-shadow-probe.service';

/**
 * UWC v1 Nest module — handlers bound; shadow probe exported for legacy hooks.
 */
@Module({
  providers: [
    AuthoritativeWriteHandlerRegistryService,
    AuthoritativeWriteGatewayService,
    AuthoritativeWriteShadowProbeService,
  ],
  exports: [
    AuthoritativeWriteHandlerRegistryService,
    AuthoritativeWriteGatewayService,
    AuthoritativeWriteShadowProbeService,
  ],
})
export class AuthoritativeWriteModule {}

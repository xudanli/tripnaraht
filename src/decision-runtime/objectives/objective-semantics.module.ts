import { Module } from '@nestjs/common';
import { ObjectiveSemanticsRegistry } from './objective-semantics.registry';

@Module({
  providers: [ObjectiveSemanticsRegistry],
  exports: [ObjectiveSemanticsRegistry],
})
export class ObjectiveSemanticsModule {}

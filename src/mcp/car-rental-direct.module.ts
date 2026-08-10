import { Module } from '@nestjs/common';
import { BrowserbaseMcpModule } from './browserbase-mcp.module';
import { CarRentalDirectService } from './car-rental-direct.service';

@Module({
  imports: [BrowserbaseMcpModule],
  providers: [CarRentalDirectService],
  exports: [CarRentalDirectService],
})
export class CarRentalDirectModule {}

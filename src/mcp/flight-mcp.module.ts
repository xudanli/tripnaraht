import { Module } from '@nestjs/common';
import { FlightMcpService } from './flight-mcp.service';

@Module({
  providers: [FlightMcpService],
  exports: [FlightMcpService],
})
export class FlightMcpModule {}

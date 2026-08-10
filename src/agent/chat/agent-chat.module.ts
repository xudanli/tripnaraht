import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AgentModule } from '../agent.module';
import { AgentChatController } from './agent-chat.controller';
import { AgentChatService } from './agent-chat.service';
import { AgentChatEventsService } from './agent-chat-events.service';

@Module({
  imports: [PrismaModule, forwardRef(() => AgentModule)],
  controllers: [AgentChatController],
  providers: [AgentChatService, AgentChatEventsService],
  exports: [AgentChatService, AgentChatEventsService],
})
export class AgentChatModule {}

import { Module, forwardRef } from '@nestjs/common';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { WorkflowExecutionEngine } from './engine/workflow-execution.engine';
import { WorkflowTriggerMatcher } from './engine/workflow-trigger.matcher';
import { WorkflowResumeProcessor } from './engine/workflow-resume.processor';
import { WorkflowEventListener } from './engine/workflow-event.listener';
import { ALL_NODE_HANDLERS } from './engine/node-handlers';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [forwardRef(() => WhatsAppModule)],
  controllers: [WorkflowController],
  providers: [
    WorkflowService,
    WorkflowExecutionEngine,
    WorkflowTriggerMatcher,
    WorkflowResumeProcessor,
    WorkflowEventListener,
    ...ALL_NODE_HANDLERS,
  ],
  exports: [WorkflowService, WorkflowExecutionEngine, WorkflowTriggerMatcher],
})
export class WorkflowModule {}

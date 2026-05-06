import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_WORKFLOW_RESUME } from '../../../queue/queue.module';
import { WorkflowExecutionEngine } from './workflow-execution.engine';

@Processor(QUEUE_WORKFLOW_RESUME)
export class WorkflowResumeProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkflowResumeProcessor.name);

  constructor(private readonly engine: WorkflowExecutionEngine) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { schema, executionId, timeoutMessage } = job.data;

    this.logger.log(`Processing ${job.name} for execution ${executionId}`);

    switch (job.name) {
      case 'workflow-delay-resume':
        await this.engine.resumeExecution({
          schema,
          executionId,
          resumeSource: 'delay',
        });
        break;

      case 'workflow-timeout':
        await this.engine.resumeExecution({
          schema,
          executionId,
          resumeSource: 'timeout',
        });
        break;

      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }
}

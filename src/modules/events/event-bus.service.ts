import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent } from './domain-events';

@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  emit(event: DomainEvent): void {
    this.logger.debug(`Emitting event: ${event.eventName} [tenant: ${event.tenantSchema}]`);
    this.eventEmitter.emit(event.eventName, event);
  }

  async emitAsync(event: DomainEvent): Promise<void> {
    this.logger.debug(`Emitting async event: ${event.eventName} [tenant: ${event.tenantSchema}]`);
    await this.eventEmitter.emitAsync(event.eventName, event);
  }
}

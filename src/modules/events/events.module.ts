import { Module, Global } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { EventBusService } from './event-bus.service';

@Global()
@Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [EventBusService],
  exports: [EventBusService],
})
export class EventsModule {}

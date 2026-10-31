import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ScheduledTasks } from './scheduled-tasks';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [ScheduledTasks],
})
export class SchedulerModule {}

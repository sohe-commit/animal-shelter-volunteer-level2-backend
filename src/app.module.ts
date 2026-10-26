import { Module } from '@nestjs/common';
import { AdminController } from './admin/admin.controller.js';
import { AppController } from './app.controller.js';
import { ApplicationsController } from './applications/applications.controller.js';
import { ApplicationsService } from './applications/applications.service.js';
import { DatabaseService } from './db/database.service.js';
import { SchedulesController } from './schedules/schedules.controller.js';
import { SchedulesService } from './schedules/schedules.service.js';
import { StatsController } from './stats/stats.controller.js';

@Module({
  controllers: [AppController, SchedulesController, ApplicationsController, StatsController, AdminController],
  providers: [DatabaseService, SchedulesService, ApplicationsService],
})
export class AppModule {}

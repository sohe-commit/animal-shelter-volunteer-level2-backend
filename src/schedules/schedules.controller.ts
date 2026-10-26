import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { idPipe } from '../common/id.pipe.js';
import { ApplyDto } from '../applications/applications.dto.js';
import { ApplicationsService } from '../applications/applications.service.js';
import { CreateScheduleDto } from './schedules.dto.js';
import { SchedulesService } from './schedules.service.js';
import type { ScheduleFilter } from './schedules.service.js';

@Controller('schedules')
export class SchedulesController {
  constructor(
    private readonly schedules: SchedulesService,
    private readonly applications: ApplicationsService,
  ) {}

  @Get()
  list(@Query() filter: ScheduleFilter) {
    return this.schedules.list(filter);
  }

  @Get(':id')
  findOne(@Param('id', idPipe) id: number) {
    return this.schedules.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateScheduleDto) {
    return this.schedules.create(dto);
  }

  @Post(':id/applications')
  apply(@Param('id', idPipe) id: number, @Body() dto: ApplyDto) {
    return this.applications.apply(id, dto);
  }
}

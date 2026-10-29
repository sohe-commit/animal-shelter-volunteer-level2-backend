import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { idPipe } from '../common/id.pipe.js';
import { StaffGuard } from '../common/staff.guard.js';
import { ApplyDto } from '../applications/applications.dto.js';
import { ApplicationsService } from '../applications/applications.service.js';
import { CancelScheduleDto, CreateScheduleDto } from './schedules.dto.js';
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

  // ':id'보다 먼저 두어야 'weeks'가 번호로 읽히지 않는다.
  @Get('weeks')
  weeks() {
    return this.schedules.weeks();
  }

  @Get(':id')
  findOne(@Param('id', idPipe) id: number) {
    return this.schedules.findOne(id);
  }

  @Post()
  @UseGuards(StaffGuard)
  create(@Body() dto: CreateScheduleDto) {
    return this.schedules.create(dto);
  }

  @Put(':id')
  @UseGuards(StaffGuard)
  update(@Param('id', idPipe) id: number, @Body() dto: CreateScheduleDto) {
    return this.schedules.update(id, dto);
  }

  // 일정 삭제: 기록을 남기려고 실제로 지우지 않고 '취소됨'으로 바꾼다.
  @Post(':id/cancel')
  @HttpCode(200)
  @UseGuards(StaffGuard)
  cancel(@Param('id', idPipe) id: number, @Body() dto: CancelScheduleDto) {
    return this.schedules.cancel(id, dto);
  }

  @Get(':id/applications')
  @UseGuards(StaffGuard)
  roster(@Param('id', idPipe) id: number) {
    return this.schedules.roster(id);
  }

  @Post(':id/applications')
  apply(@Param('id', idPipe) id: number, @Body() dto: ApplyDto) {
    return this.applications.apply(id, dto);
  }
}

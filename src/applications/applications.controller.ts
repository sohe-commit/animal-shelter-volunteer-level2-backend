import { Body, Controller, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { idPipe } from '../common/id.pipe.js';
import { IdentityDto } from './applications.dto.js';
import { ApplicationsService } from './applications.service.js';

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  // 전화번호가 주소창이나 서버 기록에 남지 않게 GET 대신 POST로 받는다.
  @Post('lookup')
  @HttpCode(200)
  lookup(@Body() dto: IdentityDto) {
    return this.applications.lookup(dto);
  }

  @Patch(':id/cancel')
  cancel(@Param('id', idPipe) id: number, @Body() dto: IdentityDto) {
    return this.applications.cancel(id, dto);
  }
}

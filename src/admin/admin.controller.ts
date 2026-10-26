import { Body, Controller, HttpCode, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { StaffGuard, isStaffPassword } from '../common/staff.guard.js';
import { DatabaseService } from '../db/database.service.js';

class StaffLoginDto {
  @IsString({ message: '담당자 비밀번호를 적어 주세요.' })
  password: string;
}

@Controller('admin')
export class AdminController {
  constructor(private readonly db: DatabaseService) {}

  /** 담당자 모드: 비밀번호가 맞는지만 확인한다. 맞으면 화면이 이후 요청에 비밀번호를 함께 보낸다. */
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: StaffLoginDto) {
    if (!isStaffPassword(dto.password)) {
      throw new UnauthorizedException('담당자 비밀번호가 맞지 않아요.');
    }
    return { message: '담당자 모드로 바뀌었어요.' };
  }

  /** 모든 데이터를 지우고 가상 데이터를 다시 채운다. */
  @Post('reset-demo-data')
  @HttpCode(200)
  @UseGuards(StaffGuard)
  async resetDemoData() {
    const counts = await this.db.resetDemoData();
    return { message: '가상 데이터를 다시 채웠어요.', counts };
  }
}

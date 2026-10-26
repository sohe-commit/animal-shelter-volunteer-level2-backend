import { Controller, HttpCode, Post } from '@nestjs/common';
import { DatabaseService } from '../db/database.service.js';

@Controller('admin')
export class AdminController {
  constructor(private readonly db: DatabaseService) {}

  /** 모든 데이터를 지우고 가상 데이터를 다시 채운다. */
  @Post('reset-demo-data')
  @HttpCode(200)
  async resetDemoData() {
    const counts = await this.db.resetDemoData();
    return { message: '가상 데이터를 다시 채웠어요.', counts };
  }
}

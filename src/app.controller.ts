import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from './db/database.service.js';

@Controller()
export class AppController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  root() {
    return { name: '동물보호소 봉사활동 신청 API', health: '/health' };
  }

  /** 서버와 DB가 연결되어 있는지 확인한다. */
  @Get('health')
  async health() {
    try {
      await this.db.query('SELECT 1');
      return { status: 'ok', db: 'connected', time: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException({ status: 'error', db: 'disconnected', message: 'DB에 연결할 수 없어요.' });
    }
  }

  @Get('activities')
  activities() {
    return this.db.query('SELECT id, name, capacity, description FROM activities ORDER BY id');
  }
}

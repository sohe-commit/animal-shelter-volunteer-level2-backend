import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { StaffGuard } from '../common/staff.guard.js';
import { DatabaseService } from '../db/database.service.js';
import { maskName, todayKst } from '../rules.js';

@Controller('stats')
export class StatsController {
  constructor(private readonly db: DatabaseService) {}

  /** 월별 현황. 봉사 날짜가 그 달에 있는 신청만 세고, 취소한 신청은 뺀다. */
  @Get('monthly')
  @UseGuards(StaffGuard)
  async monthly(@Query('month') month?: string) {
    const target = month || todayKst().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(target)) {
      throw new BadRequestException('월은 2026-10처럼 적어 주세요.');
    }
    const [year, mon] = target.split('-').map(Number);
    const start = `${target}-01`;
    const end = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, '0')}-01`;

    const monthApplications = `
      SELECT ap.volunteer_id, s.activity_id
      FROM applications ap JOIN schedules s ON s.id = ap.schedule_id
      WHERE ap.status = 'applied' AND s.date >= $1 AND s.date < $2`;

    const [totals, popular, top] = await Promise.all([
      this.db.query<{ applications: number; volunteers: number }>(
        `SELECT COUNT(*)::int AS applications, COUNT(DISTINCT volunteer_id)::int AS volunteers
         FROM (${monthApplications}) m`,
        [start, end],
      ),
      this.db.query<{ name: string; count: number }>(
        `SELECT a.name, COUNT(*)::int AS count
         FROM (${monthApplications}) m JOIN activities a ON a.id = m.activity_id
         GROUP BY a.id ORDER BY count DESC, a.id LIMIT 1`,
        [start, end],
      ),
      this.db.query<{ name: string; count: number }>(
        `SELECT v.name, COUNT(*)::int AS count
         FROM (${monthApplications}) m JOIN volunteers v ON v.id = m.volunteer_id
         GROUP BY v.id ORDER BY count DESC, v.id LIMIT 1`,
        [start, end],
      ),
    ]);

    return {
      month: target,
      applicationCount: totals[0].applications,
      volunteerCount: totals[0].volunteers,
      popularActivity: popular[0] ?? null,
      topVolunteer: top[0] ? { name: maskName(top[0].name), count: top[0].count } : null,
    };
  }
}

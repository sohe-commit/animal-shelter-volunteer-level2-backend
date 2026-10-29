// 테이블 4개: activities(활동 종류) → schedules(봉사 일정) → applications(신청) ← volunteers(봉사자)
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS activities (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(20) NOT NULL UNIQUE,
  capacity    INT NOT NULL CHECK (capacity > 0),
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS schedules (
  id                SERIAL PRIMARY KEY,
  activity_id       INT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  date              DATE NOT NULL,
  start_time        TIME NOT NULL,
  end_time          TIME NOT NULL,
  place             VARCHAR(100) NOT NULL,
  supplies          TEXT NOT NULL DEFAULT '',
  notes             TEXT NOT NULL DEFAULT '',
  gives_certificate BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at      TIMESTAMPTZ,
  cancel_reason     TEXT,
  CONSTRAINT schedules_time_order CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS volunteers (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(20) NOT NULL,
  phone      VARCHAR(13) NOT NULL,
  is_minor   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT volunteers_name_phone_unique UNIQUE (name, phone)
);

CREATE TABLE IF NOT EXISTS applications (
  id           SERIAL PRIMARY KEY,
  schedule_id  INT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  volunteer_id INT NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  status       VARCHAR(10) NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'cancelled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  -- 누가 취소했는지: volunteer(봉사자 본인) | staff(담당자가 일정을 취소함)
  cancelled_by VARCHAR(10) CHECK (cancelled_by IN ('volunteer', 'staff')),
  cancel_reason TEXT
);

CREATE INDEX IF NOT EXISTS applications_schedule_idx ON applications (schedule_id);
CREATE INDEX IF NOT EXISTS applications_volunteer_idx ON applications (volunteer_id);
CREATE INDEX IF NOT EXISTS schedules_date_idx ON schedules (date);

-- 예전에 만든 DB에도 새 칸을 더한다.
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(10) CHECK (cancelled_by IN ('volunteer', 'staff'));
ALTER TABLE applications ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- 같은 날 같은 활동은 하나만. 담당자가 취소한 일정은 기록으로 남기고, 그 자리에 새로 등록할 수 있다.
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_activity_date_unique;
CREATE UNIQUE INDEX IF NOT EXISTS schedules_activity_date_open_unique ON schedules (activity_id, date) WHERE cancelled_at IS NULL;
`;

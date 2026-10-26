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
  CONSTRAINT schedules_activity_date_unique UNIQUE (activity_id, date),
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
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS applications_schedule_idx ON applications (schedule_id);
CREATE INDEX IF NOT EXISTS applications_volunteer_idx ON applications (volunteer_id);
CREATE INDEX IF NOT EXISTS schedules_date_idx ON schedules (date);
`;

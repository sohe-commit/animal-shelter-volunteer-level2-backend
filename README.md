# 온기 동물보호소 봉사활동 신청: 백엔드

동물보호소 봉사 일정을 보고, 신청하고, 취소하는 웹앱의 **서버(API)** 입니다. 과제 Level 2 결과물이에요.

- 프론트엔드 저장소: https://github.com/sohe-commit/animal-shelter-volunteer-level2-frontend
- 기획서: [기획서.md](기획서.md)
- 기술: NestJS, PostgreSQL / 배포: Render

> ⏳ **첫 접속이 느릴 수 있어요.** 무료 서버(Render Free)를 쓰고 있어서, 한동안 아무도 접속하지 않으면 서버가 잠들어요. 잠든 뒤 첫 요청에는 서버가 깨어나느라 **30초~1분 정도** 걸릴 수 있어요. 잠시 기다린 뒤 새로고침해 주세요. 그다음부터는 빠르게 동작해요.

## 이 서버가 하는 일

- 봉사 일정 목록·상세·등록
- 봉사 신청과 취소 (로그인 없이 **이름 + 전화번호**로 본인 확인)
- 이번 달 현황 숫자
- 가상 데이터 다시 채우기
- `/health`로 서버와 DB 연결 확인

모든 이름과 전화번호는 **가상 데이터**예요.

## 서버가 지키는 규칙

화면에서 버튼을 숨기는 것과 별개로, 서버가 직접 확인해서 규칙에 맞지 않으면 저장하지 않고 쉬운 안내 문구를 돌려줘요.

| # | 규칙 |
|---|---|
| R1 | 활동마다 하루 정원을 넘을 수 없어요 (산책 2, 청소 3, 목욕 3, 미용 4, 사진 2) |
| R2 | 한 사람은 한 주(일~토)에 2번까지 신청할 수 있어요. 취소는 2번까지 세지 않고, 3번째 취소부터 1회로 세요 |
| R3 | 취소는 봉사 전날 낮 12시(한국 시간) 전까지만 할 수 있어요 |
| R4 | 같은 날 두 활동을 신청할 수 없어요 (봉사는 하루 한 번) |
| R5 | 오늘이나 지난 날짜의 일정은 신청할 수 없어요 |
| R6 | 신청할 때 쓴 이름과 전화번호가 맞아야 취소할 수 있어요 |

마지막 한 자리에 여러 명이 동시에 신청해도 한 명만 들어가요.

## API

| 주소 | 설명 |
|---|---|
| `GET /health` | 서버·DB 연결 확인 |
| `GET /activities` | 활동 종류 5개 |
| `GET /schedules?date=&activityId=&available=true` | 일정 목록 + 필터 (`available=true`: 신청 마감 전이고 자리가 남은 일정만) |
| `GET /schedules/:id` | 일정 상세 |
| `POST /schedules` | 일정 등록 |
| `POST /schedules/:id/applications` | 봉사 신청 (R1, R2, R4, R5) |
| `POST /applications/lookup` | 이름 + 전화번호로 내 신청 찾기 |
| `PATCH /applications/:id/cancel` | 신청 취소 (R3, R6) |
| `GET /stats/monthly?month=2026-10` | 월별 현황 |
| `POST /admin/reset-demo-data` | 가상 데이터 다시 채우기 |

## 내 컴퓨터에서 실행

Node.js 22 이상이 필요해요.

```bash
cp .env.example .env   # DATABASE_URL 값을 채워 주세요
npm install
npm run start:dev      # http://localhost:4000
```

서버가 켜질 때 테이블이 없으면 자동으로 만들고, DB가 비어 있으면 가상 데이터를 채워요.

## 설정값 (환경 변수)

| 이름 | 뜻 | 예시 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 접속 주소 | `postgresql://USER:PASSWORD@HOST/DBNAME` |
| `FRONTEND_ORIGIN` | 이 서버를 불러도 되는 프론트엔드 주소. 여러 개면 쉼표로 구분 | `https://xxx.vercel.app` |
| `DATABASE_SSL` | (선택) SSL을 쓰지 않는 DB일 때만 `false` | `false` |
| `PORT` | (선택) 서버 포트. Render는 자동으로 넣어 줘요 | `4000` |

비밀 값은 `.env`에만 적고, `.env`는 GitHub에 올라가지 않아요.

## Render에 올리기

1. Render에서 **New → Web Service**를 누르고 이 저장소를 고릅니다.
   - 저장소에 있는 `render.yaml`로 **New → Blueprint**를 써도 돼요.
2. 아래처럼 설정합니다.

| 항목 | 값 |
|---|---|
| Runtime | Node |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm run start:prod` |
| Health Check Path | `/health` |
| Instance Type | Free |

3. **Environment**에 `DATABASE_URL`과 `FRONTEND_ORIGIN`을 넣습니다.
   - `DATABASE_URL`: Render PostgreSQL 화면의 **External Database URL**
   - `FRONTEND_ORIGIN`: Vercel에 올린 프론트엔드 주소. 끝에 `/`를 붙이지 않아요.
4. 배포가 끝나면 `https://(서버 주소)/health`가 `{"status":"ok","db":"connected"}`로 나오는지 확인합니다.

## 테스트

```bash
npm test   # 규칙 계산(주 범위, 취소 마감, 취소 횟수 등) 단위 테스트
```

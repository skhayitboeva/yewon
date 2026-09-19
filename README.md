# 예원예술대학교 유학생 관리 시스템

React (Vite) + Netlify Functions + MongoDB Atlas.
기능 명세는 [`SPEC.md`](./SPEC.md) 참고.

> ⚠️ **아직 한 번도 빌드하지 않은 상태입니다.** 개발 환경에 npm 접근이 없어
> `npm install` / `npm run build` 를 실행하지 못했습니다. 아래 1~2단계에서
> 오류가 나오면 그대로 알려주시면 바로 고치겠습니다.

---

## 1. 설치

```bash
cd ~/Documents/yewon-sms
npm install
```

## 2. 타입 검사 (설치 직후 한 번)

```bash
npm run typecheck
```

## 3. MongoDB Atlas 준비

1. <https://cloud.mongodb.com> 에서 무료 M0 클러스터 생성
2. **Database Access** → 사용자 추가 (긴 비밀번호로)
3. **Network Access** → `0.0.0.0/0` 허용
   *Netlify는 고정 IP가 없어서 필요합니다. 대신 DB 비밀번호를 길게 잡으세요.*
4. **Connect → Drivers** 에서 연결 문자열 복사

## 4. 환경변수

```bash
cp .env.example .env
```

`.env` 를 열어 채웁니다.

```bash
# 직원 로그인 비밀번호 해시 생성 (아이디는 admin / manager 로 고정)
npm run hash-password -- "admin 비밀번호"
# → 출력된 scrypt$... 줄을 APP_PASSWORD_HASH_ADMIN 에 붙여넣기
npm run hash-password -- "manager 비밀번호"
# → APP_PASSWORD_HASH_MANAGER 에 붙여넣기

# 세션 서명 키 생성
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# → JWT_SECRET 에 붙여넣기

# 텔레그램 봇 토큰 (@BotFather 에서 발급) — 미니앱 로그인/연결 + 알림 발송에 사용
# TELEGRAM_BOT_TOKEN="..."
```

로그인 아이디에 따라 권한이 갈립니다: `admin`(전체 읽기/쓰기), `manager`(전체 읽기 전용,
CSV 내보내기 제외). 학생은 별도 계정이 없고, 로그인 화면에서 "학생이신가요?" 를 눌러
본인 휴대전화 번호로 로그인합니다 — 처음 로그인할 때 비밀번호(5자 이상)를 직접 설정하고,
다음부터는 그 번호+비밀번호로 로그인합니다(`user` 권한, 내 정보·프로필·안내만 조회). 학생이
비밀번호를 잊으면 학생 표에서 관리자가 "비밀번호 초기화" 버튼으로 초기화해줄 수 있습니다.

같은 학생 로그인을 텔레그램 미니앱으로도 열 수 있습니다 (`@BotFather` 의 메뉴 버튼에
배포 URL을 등록). 최초 진입 시에는 마찬가지로 휴대전화 번호+비밀번호로 본인 확인 후
텔레그램 계정이 연결되고, 이후에는 앱을 열기만 해도 자동 로그인됩니다. 휴대전화 번호가
등록되지 않은 학생은 로그인 화면에서 "접속 요청하기" 로 이름·생년월일·번호를 제출할 수
있고, admin 계정의 "알림" 탭에서 승인하면 그 번호가 학생 정보에 등록됩니다. 같은 탭에서
텔레그램을 연결한 학생들에게 필터 조건으로 알림 메시지를 보낼 수 있습니다.

## 5. 초기 데이터 넣기 (개발용 551명)

```bash
set -a && source .env && set +a
npm run seed
```

인덱스를 만들고 `data/students.seed.json` 의 551명을 넣습니다.
`npm run seed -- --replace` 를 쓰면 기존 학생을 지우고 새로 넣습니다.

## 6. 로컬 실행

```bash
npm i -g netlify-cli   # 최초 1회
netlify dev
```

<http://localhost:8888> 에서 열립니다. `netlify dev` 가 Vite와 Functions를
같이 띄우고 `/api/*` 를 연결합니다.

## 7. Netlify 배포

```bash
netlify login
netlify init        # 새 사이트 생성 + 이 폴더 연결
netlify deploy --prod
```

사이트 대시보드 → **Site configuration → Environment variables** 에 네 개를 등록:

| 변수 | 값 |
|---|---|
| `MONGODB_URI` | Atlas 연결 문자열 |
| `MONGODB_DB` | `yewon_sms` |
| `APP_PASSWORD_HASH_ADMIN` | 4단계에서 생성한 admin `scrypt$...` |
| `APP_PASSWORD_HASH_MANAGER` | 4단계에서 생성한 manager `scrypt$...` |
| `JWT_SECRET` | 4단계에서 생성한 랜덤 문자열 |
| `TELEGRAM_BOT_TOKEN` | @BotFather 에서 발급받은 봇 토큰 (선택 — 미니앱/알림 기능에 필요) |

등록 후 한 번 더 `netlify deploy --prod`.

## 8. 엑셀 실데이터 이관

```bash
set -a && source .env && set +a

# ① 먼저 검증만 (아무것도 저장하지 않음)
node scripts/import-excel.mjs data/students.xlsx --dry-run

# ② 매핑과 건수를 확인한 뒤 실제 이관
node scripts/import-excel.mjs data/students.xlsx --mode=upsert
```

- `upsert` — 학번 기준으로 학적 정보만 갱신. **등록금·출결·연락횟수·메모·상담 기록은 보존.**
- `replace` — 기존 학생 전부 삭제 후 새로 넣기
- `insert-only` — 새 학번만 추가

실행 직전 `students_backup_YYYYMMDD` 컬렉션으로 자동 백업합니다.
엑셀 헤더가 매핑되지 않으면 dry-run 출력에 `(무시됨)` 으로 표시되니,
`scripts/import-excel.mjs` 상단의 `HEADER_MAP` 에 추가하면 됩니다.

---

## 폴더 구조

```
src/                     React 앱
  components/            화면 조각 (대시보드, 표, 모달)
  api.ts                 /api/* 호출 래퍼
  hooks.ts               URL 상태 · 토스트 · 디바운스
shared/domain.ts         프론트·백엔드 공용 타입과 상수
netlify/functions/*.mts  API 엔드포인트 (각 파일이 config.path 로 경로 선언)
netlify/lib/*.mts        DB 연결 · 인증 · 검증 · 쿼리 빌더
scripts/                 비밀번호 해시 · 시드 · 엑셀 이관
data/students.seed.json  참고 HTML에서 추출한 551명 (개발용)
```

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/login` | 아이디(admin/manager) + 비밀번호 로그인 |
| POST | `/api/student-login` | 휴대전화 번호(+ 최초 로그인 시 비밀번호 설정) 학생 로그인 |
| POST | `/api/students/:id/reset-password` | 학생 비밀번호 초기화 (admin 전용) |
| POST | `/api/logout` | 로그아웃 |
| GET | `/api/me` | 세션 확인 |
| GET | `/api/stats` | 대시보드 집계 |
| GET | `/api/facets` | 필터 드롭다운 값 (전공 · 코호트) |
| GET · POST | `/api/students` | 목록 조회 · 학생 추가 |
| GET · PATCH · DELETE | `/api/students/:id` | 단건 조회 · 수정 · 삭제 |
| GET · POST | `/api/consultations` | 상담 이력 · 추가 |
| PATCH · DELETE | `/api/consultations/:id` | 상담 수정 · 삭제 |
| GET · PUT | `/api/settings` | 현재 학기 |
| GET | `/api/export.csv` | 현재 필터 기준 CSV |
| GET | `/api/my/details` | 내 학적·등록금·출결·상담 이력 (학생 본인) |
| PATCH | `/api/my/profile` | 내 이름·주소·휴대전화·비밀번호 수정 (학생 본인) |
| POST | `/api/telegram/auth` | 텔레그램 미니앱 재진입 시 세션 토큰 발급 |
| POST | `/api/telegram/link` | 휴대전화+비밀번호로 텔레그램 계정 최초 연결 |
| POST | `/api/access-requests` | 접속 요청 제출 (미인증) |
| GET · PATCH | `/api/access-requests(/:id)` | 접속 요청 목록 · 승인/거절 (admin 전용) |
| POST | `/api/broadcast` | 텔레그램 알림 발송, 한 번에 일부씩 (admin 전용) |

## 보안 메모

- 학생 개인정보(생년월일·주소·연락처)가 들어 있습니다. URL과 비밀번호를 공유하지 마세요.
- 로그인 성공 시 역할(admin/manager/user)이 담긴 12시간짜리 HttpOnly 세션 쿠키를 발급합니다.
- 학생의 비밀번호는 scrypt 해시로만 저장하며, 관리자/매니저 화면에는 절대 내려주지 않습니다.
- 같은 IP에서 10회 실패하면(직원·학생 로그인 합산) 15분 차단됩니다.
- `robots` 차단 헤더가 걸려 있어 검색엔진에 노출되지 않습니다.
- `.env` 는 절대 커밋하지 마세요 (`.gitignore` 에 포함되어 있습니다).

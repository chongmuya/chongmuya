# 총무야 (chongmuya)

총무야는 개인 행사와 모임을 관리하는 웹앱입니다. 이메일 가입·로그인, 모임 관리, 개인 행사 생성·조회·모임 연결을 제공합니다. 행사는 생성한 계정이 소유하며 모임이나 예약 없이 이용할 수 있습니다.

## 개발 환경

Node.js **24.15.0**과 pnpm **11.25.0**을 사용합니다. 버전은 `.nvmrc`와 루트 `packageManager`에 고정합니다. PostgreSQL 실행에는 Docker Engine 또는 Docker Desktop이 필요합니다.

- 웹: Next.js App Router, React, TanStack Query, React Hook Form + Zod, Tailwind CSS
- API: NestJS, Passport JWT, TypeORM, PostgreSQL, 네이티브 ESM
- pnpm workspace와 단일 `pnpm-lock.yaml`, Turborepo 빌드·개발 명령

## 처음 실행하기

저장소 루트에서 실행합니다. 기존 `.env`가 있다면 덮어쓰지 말고 필요한 값만 반영하세요.

```bash
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
pnpm db:up
```

`apps/api/.env`에서 `AUTH_SECRET`을 32자 이상의 임의 값으로 설정하고 `WEB_ORIGIN`과 `DATABASE_URL`을 확인합니다. 예제 DB는 로컬 개발 전용입니다. **대상 DB를 확인한 뒤** 테이블을 준비하고 앱을 시작합니다.

```bash
pnpm --filter @chongmuya/api build
pnpm --filter @chongmuya/api db:migration:show
pnpm --filter @chongmuya/api db:migration:run
pnpm dev
```

install·build·서버 시작은 migration을 자동 적용하지 않습니다. `synchronize`, `migrationsRun`, `dropSchema`는 모두 false입니다. 개발 서버는 `Ctrl+C`, DB는 `pnpm db:down`으로 종료합니다. `db:down`은 데이터를 보존합니다.

| 주소                               | 용도                                              |
| ---------------------------------- | ------------------------------------------------- |
| <http://localhost:3000>            | 비로그인 공개 홈                                  |
| <http://localhost:3000/start>      | 시작 화면: 가입·로그인·공개 홈 선택               |
| <http://localhost:3000/auth>       | 이메일 로그인 (`?mode=signup`으로 기존 가입 폼)   |
| <http://localhost:3000/events>     | 로그인한 계정의 전체 행사·개인 행사 생성          |
| <http://localhost:3000/mypage>     | 모임 목록·생성·이름 수정, 계정·로그아웃           |
| <http://localhost:3001/health>     | DB와 독립된 liveness                              |
| <http://localhost:3001/ready>      | 실제 DB 쿼리; 정상 200, 가용성 장애 503           |
| <http://localhost:3000/api/health> | Next rewrite를 거친 liveness                      |
| <http://localhost:3001/docs>       | 개발용 Swagger; 변경 요청은 Origin·CSRF 헤더 필요 |

모임이 없어도 행사명과 선택적 일정으로 개인 행사를 만들 수 있습니다. 생성 시 본인 모임을 선택하거나 개인 행사 상세에서 나중에 연결할 수 있습니다. 연결은 행사 소유자와 기록을 유지하며 다른 사용자에게 권한을 주지 않습니다. 모임 명단 불러오기·연결 해제·다른 모임 이동·소유권 이전은 제공하지 않습니다.

`/events?event=<행사 UUID>`는 모임과 독립된 상세 주소이며 `/events?group=<모임 UUID>`는 본인 행사 목록의 필터입니다. 로그인 후에는 요청한 유효한 내부 경로로 돌아갑니다. 모임 선택은 URL에 두며 브라우저 저장소에 계정 공통 값을 남기지 않습니다.

시작·로그인·가입 간 이동은 유효한 `next`를 유지합니다. 비회원 시작은 공개 홈으로 연결하며 개인 행사 권한을 부여하지 않습니다. 카카오 로그인과 비밀번호 재설정은 준비 중입니다.

## 환경변수

| 변수                | 위치                           | 기본값·조건                                             |
| ------------------- | ------------------------------ | ------------------------------------------------------- |
| `DATABASE_URL`      | API `.env` 또는 실행 환경      | 필수. 호스트·DB 이름이 있는 PostgreSQL URL              |
| `AUTH_SECRET`       | API `.env` 또는 실행 환경      | 필수. 32자 이상; 운영은 암호학적 난수                   |
| `WEB_ORIGIN`        | API `.env` 또는 실행 환경      | 필수. 경로·끝 슬래시 없는 웹 origin. production은 HTTPS |
| `API_PORT`          | API `.env` 또는 실행 환경      | 3001; 1~65535                                           |
| `NODE_ENV`          | API 실행 환경                  | development; test/production 허용                       |
| `API_DOCS_ENABLED`  | API `.env` 또는 실행 환경      | true/false; production 기본 false                       |
| `API_URL`           | 웹 `.env.local` 또는 실행 환경 | `http://127.0.0.1:3001`; 서버 전용                      |
| `TEST_DATABASE_URL` | 테스트 실행 환경               | DB 통합 테스트용 격리 PostgreSQL                        |

API는 `.env`보다 지정된 셸 환경변수를 우선하며 Zod로 검증합니다. 오류에는 변수 이름만 표시합니다. 로컬 DB는 `127.0.0.1:15432`에만 열립니다. API 주소 변경 시 웹 개발 서버를 재시작하고 production 빌드는 다시 만듭니다. 브라우저는 `/api/v1/*`와 `/api/health` 상대 경로를 사용합니다. `API_URL`에 `NEXT_PUBLIC_`을 붙이지 않습니다.

HttpOnly 쿠키, CSRF Origin·전용 헤더, Refresh 회전 정책은 [인증 기준](docs/authentication.md)을 따릅니다. 홈의 연결 성공 표시는 liveness이며 DB 정상 여부는 `/ready`로 확인합니다.

## 폴더와 명령

```text
apps/web/   app → features → shared
apps/api/   bootstrap, config, common/http, modules, database
            Entity는 각 업무 모듈, migration은 src/database/migrations
tools/     ESLint 의존 경계 규칙과 검사
docs/      아키텍처·인증·협업 문서
```

| 명령                                           | 용도                                                |
| ---------------------------------------------- | --------------------------------------------------- |
| `pnpm dev`                                     | 웹·API 개발 서버                                    |
| `pnpm build`                                   | 두 앱 빌드; API TypeScript → ESM                    |
| `pnpm format` / `pnpm format:check`            | 포맷 적용·검사                                      |
| `pnpm lint` / `pnpm typecheck`                 | 린트·의존 경계·타입 검사                            |
| `pnpm test`                                    | 경계·설정·HTTP·세션·폼 테스트                       |
| `pnpm test:integration`                        | 격리 PostgreSQL의 migration·권한·동시성·인증 테스트 |
| `pnpm --filter @chongmuya/web dev`             | 웹만 실행                                           |
| `pnpm --filter @chongmuya/api dev`             | API만 실행                                          |
| `pnpm db:up` / `pnpm db:down` / `pnpm db:logs` | 로컬 DB 실행·종료·로그                              |

의존성은 실제 사용하는 앱에 선언합니다. Turbo는 앱 빌드 산출물을 캐시하며 개발 서버는 캐시하지 않습니다. 웹 API_URL·환경변수 파일은 빌드 입력에 포함됩니다.

## 데이터와 migration

계정·세션·Refresh 이력, 모임, 행사를 저장합니다. 기존 migration은 수정하지 않고 후속 파일을 추가합니다. 행사 소유자는 필수이며 모임 연결은 선택입니다. `PersonalEvents` migration은 기존 모임 소유자로 행사 소유자를 backfill하고 누락을 검증한 뒤 NOT NULL·FK·인덱스를 적용합니다. 기존 ID·일정·생성 시각과 인증 데이터는 보존합니다.

개인 행사 또는 변경된 행사 버전이 있는 DB는 이전 스키마로 안전하게 되돌릴 수 없으므로 down이 중단됩니다. rollback을 위해 데이터를 지우거나 임의 모임을 만들지 않습니다. 적용 순서·복구 제한은 [아키텍처의 DB 절](docs/architecture.md#postgresqltypeorm)을 참고하세요.

Entity 변경 시 로컬 개발 DB에서 `pnpm --filter @chongmuya/api db:migration:generate src/database/migrations/<이름>`으로 SQL을 생성할 수 있습니다. 검토 후 다시 build하고 명시적으로 적용합니다. CLI는 컴파일한 `dist/database/data-source.js`를 읽으며 `migration:show`도 이력 테이블을 생성할 수 있습니다. 운영 DB에 검증 명령이나 reset/drop을 실행하지 않습니다.

## 검증

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
# 마이그레이션과 테스트 데이터를 기록하므로 전용 격리 DB만 지정
TEST_DATABASE_URL=<격리된_PostgreSQL_URL> pnpm test:integration
```

통합 테스트는 migration·가입·세션 회전·소유권·동시 연결·장애 복구를 실행하며 실제 테스트 데이터를 씁니다. 개발 중인 계정이나 운영 데이터가 있는 DB를 지정하지 않습니다. GitHub Actions도 임시 PostgreSQL 서비스에서 같은 검증을 수행합니다. DOM·HTTP 테스트와 실제 브라우저의 전체 클릭·모바일 시각 검수는 구분합니다.

## 문서

- [아키텍처](docs/architecture.md): 책임·의존 방향·API·캐시·오류·migration
- [인증 기준](docs/authentication.md): Passport·쿠키·CSRF·세션·개인 자원 접근
- [협업 규칙](docs/CONTRIBUTING.md): 커밋·브랜치·PR과 검증
- [PR 템플릿](.github/pull_request_template.md)

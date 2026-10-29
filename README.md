# 총무야 (chongmuya)

총무야는 대학 모임의 예약·차수별 참석·정산·증빙을 행사 단위로 관리하는 모바일 우선 반응형 웹앱입니다. 현재는 Next.js·NestJS 개발 기반, PostgreSQL 연결, HTTP 계약과 연결 확인 화면을 구현했습니다. JWT 인증은 방향만 정했으며 업무 기능·UI/UX·파일 저장소·worker·배포는 후속 작업입니다.

## 필요한 버전

- Node.js **24.15.0** (`.nvmrc`, `engines`), pnpm **11.25.0** (`packageManager` 고정).
- Docker Engine와 Compose: 로컬 PostgreSQL 실행용. 앱 전체를 컨테이너화하지 않습니다.
- Next.js 16.4.3, React 19.3.1, NestJS 12.2.0, TypeScript 5.9.3, Turbo 2.11.10.
- PostgreSQL 17.11, TypeORM 1.1.2, @nestjs/typeorm 12.0.2, pg 8.23.1, Zod 4.6.7, TanStack Query 5.104.5. API는 네이티브 ESM으로 실행합니다.

기존 Node·pnpm이 맞으면 그대로 사용합니다. nvm 사용자는 `nvm install`, `nvm use`로 이 저장소의 버전을 선택할 수 있습니다. pnpm이 없고 Corepack을 사용 중이면 `corepack pnpm`을 사용할 수 있습니다. 전역 변경 없이 실행하려면 `npx --yes pnpm@11.25.0 <명령>`도 가능합니다.

## 처음 실행하기

Docker Desktop 또는 Docker 엔진을 먼저 실행한 후 **저장소 루트**에서 실행합니다.

```bash
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
pnpm db:up
pnpm dev
```

기존 `.env`가 있다면 덮어쓰지 말고 필요한 값만 반영하세요. API `.env`는 Git에서 제외됩니다. `pnpm dev`는 API와 웹을 함께 실행합니다. 별도의 ORM 코드 생성 단계는 없습니다. 실제 DB 테이블이나 마이그레이션은 만들지 않습니다.

| 주소                               | 의미                                       |
| ---------------------------------- | ------------------------------------------ |
| <http://localhost:3000>            | 서비스명·API 연결 상태                     |
| <http://localhost:3001/health>     | 프로세스 liveness, DB 상태와 독립          |
| <http://localhost:3001/ready>      | TypeORM의 실제 DB 쿼리; 정상 200, 장애 503 |
| <http://localhost:3000/api/health> | Next.js rewrite를 거친 liveness            |
| <http://localhost:3001/docs>       | 개발용 Swagger UI                          |
| <http://localhost:3001/docs-json>  | OpenAPI JSON                               |

웹은 활성 탭에서 5초마다 API를 확인하고, 요청 제한 시간은 3초입니다. API 중단 시 실패, 재시작 시 성공으로 복구합니다. **화면의 연결 성공은 DB 정상 여부를 의미하지 않습니다.** DB는 `/ready`로 확인합니다.

개발 서버 종료는 `Ctrl+C`, DB 종료는 `pnpm db:down`입니다. `db:down`은 데이터를 보존합니다. 데이터 삭제 옵션이나 DB reset/drop은 사용하지 않습니다. 로컬 DB는 `127.0.0.1:15432`에만 열리며 예제 비밀번호는 로컬 전용입니다.

## 환경변수

| 변수               | 위치                           | 기본값/필수 여부                              |
| ------------------ | ------------------------------ | --------------------------------------------- |
| `DATABASE_URL`     | API `.env` 또는 실행 환경      | 필수, PostgreSQL URL                          |
| `API_PORT`         | API `.env` 또는 실행 환경      | 3001                                          |
| `NODE_ENV`         | API 실행 환경                  | development; development/test/production 허용 |
| `API_DOCS_ENABLED` | API `.env` 또는 실행 환경      | true/false; production에서는 기본 false       |
| `API_URL`          | 웹 `.env.local` 또는 실행 환경 | `http://127.0.0.1:3001`                       |

API는 `apps/api/.env`를 읽고 이미 지정된 셸 환경변수를 우선합니다. Zod가 필수 값·포트 범위·PostgreSQL URL·true/false 설정을 검증하고, 오류가 있으면 시작을 거부합니다. 오류에는 변수 이름만 표시합니다. `.env.example`의 문서 활성화 값은 개발용이며 production에 그대로 복사하지 마세요.

웹의 주소를 바꿀 때만 `cp apps/web/.env.example apps/web/.env.local`을 실행합니다. `API_URL`은 서버 전용이며 `NEXT_PUBLIC_` 접두사를 사용하지 않습니다. 브라우저는 상대 경로 `/api/health`만 호출합니다. 주소 변경 후 개발 서버를 재시작하고, `next start`를 사용할 때는 다시 빌드해야 합니다.

## 폴더와 모노레포

```text
apps/web/     Next.js 앱: app → features → shared
apps/api/     NestJS 앱: bootstrap, config, common, modules, database
              Entity는 각 업무 모듈, DB 설정·마이그레이션은 src/database/
tools/        저장소 공통 ESLint 경계 규칙·검증
docs/         아키텍처·협업 문서
```

**pnpm workspace**는 앱별 의존성을 루트에서 한 번에 설치하고 `pnpm-lock.yaml` 하나로 재현합니다. `features/shared/common`은 앱 내부 폴더이지 workspace 패키지가 아닙니다. 공유 패키지가 필요하지 않아 `packages`는 없습니다.

**Turborepo**는 앱의 명령을 함께 실행하고 빌드 결과를 캐시합니다. 개발 서버는 persistent이며 캐시하지 않습니다. API 빌드 캐시는 ESM으로 컴파일한 `dist`를 포함합니다. 웹은 `.next` 출력과 API_URL·환경변수 파일을 고려합니다. Next.js의 Turbopack은 웹 번들러로 별개입니다.

의존성은 사용하는 앱에 선언합니다. 예: `pnpm --filter @chongmuya/web add <패키지>`. pnpm의 설치 스크립트 제한은 유지하며 필요한 정확한 버전만 `allowBuilds`로 허용합니다.

## 주요 명령

| 루트에서 실행                                    | 내용                                              |
| ------------------------------------------------ | ------------------------------------------------- |
| `pnpm dev`                                       | 웹·API 동시 개발 실행                             |
| `pnpm build`                                     | 두 앱 빌드; API는 TypeScript → ESM                |
| `pnpm lint`                                      | 린트·의존 경계 검사                               |
| `pnpm typecheck`                                 | 앱 및 테스트 타입 검사                            |
| `pnpm test`                                      | 경계·HTTP·설정·프론트 오류 처리 테스트, DB 불필요 |
| `pnpm test:integration`                          | 실제 PostgreSQL 테스트, `TEST_DATABASE_URL` 필수  |
| `pnpm --filter @chongmuya/web dev`               | 웹만 실행                                         |
| `pnpm --filter @chongmuya/api dev`               | API만 실행                                        |
| `pnpm --filter @chongmuya/api db:migration:show` | 빌드 후 DB 마이그레이션 상태 확인                 |
| `pnpm db:up` / `pnpm db:down`                    | 로컬 DB 실행·종료, 데이터 보존                    |
| `pnpm db:logs`                                   | DB 로그 확인                                      |

빌드 후 각 앱의 `start` 스크립트로 실행할 수 있습니다. API는 같은 환경변수 설정이 필요합니다.

## DB와 마이그레이션

현재 **업무 Entity·테이블·마이그레이션은 없습니다.** TypeORM DataSource로 `SELECT 1`을 실행해 연결을 확인합니다. `synchronize`, `migrationsRun`, `dropSchema`는 모두 false이며 서버가 스키마를 자동 수정하지 않습니다.

첫 업무 Entity는 `apps/api/src/modules/<업무>/*.entity.ts`에 추가합니다. API DTO와 DB Entity는 구분합니다. 이후 **로컬 개발 DB**에서 다음을 실행합니다.

```bash
# Entity를 빌드하고 DB와 비교해 TypeScript 마이그레이션 생성
pnpm --filter @chongmuya/api db:migration:generate src/database/migrations/CreateEvent
# 생성된 SQL을 검토한 후 새 마이그레이션을 컴파일
pnpm --filter @chongmuya/api build
pnpm --filter @chongmuya/api db:migration:show
pnpm --filter @chongmuya/api db:migration:run
```

배포에서는 검토·커밋된 마이그레이션이 포함된 빌드 결과에 `db:migration:run`을 **별도 단계에서 한 번** 실행합니다. install/build/서버 시작에 포함하지 않습니다. CLI도 `apps/api/.env` 또는 실행 환경을 사용하므로 대상 DB를 확인하세요. `show`/`run`은 미리 빌드한 `dist/database/data-source.js`를 읽습니다. 개발·배포 모두 같은 ESM 출력을 사용하며 ts-node 로더는 필요 없습니다.

TypeORM 1.1.2의 `migration:show`도 이력용 `migrations` 테이블이 없으면 생성합니다. 이번 로컬 검증 DB에는 빈 이력 테이블만 있으며 업무 테이블은 없습니다. 상태 확인 명령도 DB 접근 권한이 필요합니다.

마이그레이션 생성에는 DB 접속이 필요합니다. 현재처럼 변경할 Entity가 없으면 generate는 변경 없음으로 종료하며 파일을 만들지 않습니다. 첫 마이그레이션 추가 시 CI의 빈 테스트 DB에 적용하는 검증도 추가해야 합니다.

## 검증

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
pnpm test
# 로컬 개발 전용 DB에 읽기 쿼리로 연결 검증
TEST_DATABASE_URL=postgresql://chongmuya:chongmuya_local@127.0.0.1:15432/chongmuya pnpm test:integration
```

`pnpm dev` 실행 후 health와 ready를 curl로 확인합니다. 전용 로컬 DB만 `docker compose stop postgres`로 중단하면 `/ready`는 503, `/health`는 200이어야 합니다. `pnpm db:up`으로 복구한 뒤 readiness 200을 확인합니다. 웹만 켜면 연결 실패, API를 추가로 실행하면 성공으로 복구되어야 합니다.

GitHub Actions는 같은 명령과 격리된 PostgreSQL 서비스를 사용하도록 정의했습니다. 외부 시크릿은 필요 없습니다. 원격 실행 결과는 PR의 Checks 또는 Actions에서 확인하세요. Ruleset·필수 체크 설정은 별도입니다.

## 문서와 다음 단계

- [아키텍처와 선택 이유](docs/architecture.md): 책임·의존 방향·현재 구현과 후속 과제
- [커밋·브랜치·PR 협업 규칙](docs/CONTRIBUTING.md): `type(scope): 한국어 설명`
- [PR 템플릿](.github/pull_request_template.md): 변경 내용·확인 방법·관련 이슈

다음 기능은 웹 `features/<업무>`와 API `modules/<업무>`에 필요한 만큼 추가합니다. 첫 업무 모델·마이그레이션, JWT 세부 정책, 정산·파일·알림 정책과 실제 배포는 후속 범위입니다.

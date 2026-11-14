# 기본 아키텍처

총무야는 Next.js App Router 웹과 NestJS API로 구성한다. 프론트는 라우팅·기능·공용 코드의 책임을 나누고, 인증 계약은 [authentication.md](authentication.md)를 따른다. 현재 모임·행사 화면은 소유 모임을 기준으로 동작하며 이메일·비밀번호 인증을 사용한다. 제품 정책이나 API·DB 모델 변경은 구조 정리와 별도 작업으로 다룬다.

## 책임과 폴더

```text
apps/web/
  app/                       라우트, 레이아웃, Provider, 페이지 조합
    workspace-screen.tsx     인증 화면과 모임·행사 화면 조합, URL별 화면 key
  features/
    auth/
      api/                   profile 요청·query options
      components/            Provider, 인증·복구 화면, 로그인·가입 폼
      hooks/                 인증 mutation
      lib/                   SessionClient 생명주기·갱신·잠금
      schemas/               credentials.schema.ts
      types/                 계정·인증 상태·요청 타입
      client.ts / types.ts   외부 공개 진입점
    groups/
      api/                   groups.api.ts, groups.queries.ts
      components/            GroupBoundary, GroupSettings, GroupForm
      hooks/                 use-save-group.ts
      schemas/               group.schema.ts
      types/                 group.types.ts
      client.ts              외부 컴포넌트 공개
    events/
      api/                   events.api.ts, events.queries.ts
      components/            EventList, EventDetail, EventForm
      hooks/                 use-create-event.ts
      lib/                   한국 시간 표시
      schemas/               event.schema.ts
      types/                 event.types.ts
      client.ts              외부 컴포넌트 공개
    health/
      api/                   health 요청·응답 검증·polling options
      components/            연결 상태 UI
      client.ts              외부 컴포넌트 공개
  shared/
    http/                    JSON 전송, 취소·타임아웃, ApiError
    hooks/use-active-screen  화면 이탈 후 지연 저장 응답 방어
    lib/cn                   조건부 className과 Tailwind 충돌 병합
    ui/                      Button, Input, FormError, 로딩·오류·빈 상태
  test/                      세션·HTTP·렌더링·폼 DOM 회귀 테스트
apps/api/
  src/
    main.ts             앱 실행과 정상 종료 훅
    bootstrap/          실제 서버와 E2E가 공유하는 HTTP 설정
    config/             환경변수 로딩·검증, 타입이 있는 설정
    common/http/        공통 오류·requestId·요청 로그
    modules/auth/       인증·세션·시도 제한, 공개 Guard/사용자 타입/데코레이터
    modules/groups/     모임 CRUD·소유권 검증, GroupsService 공개
    modules/events/     행사 생성·조회, GroupsService로 모임 소유권 확인
    modules/health/     DB와 독립된 liveness·실제 쿼리 readiness
    database/           TypeORM 옵션·CLI DataSource·연결 생명주기·오류 분류
      migrations/       기존 Authentication·GroupEvents 마이그레이션
  test/                 설정·HTTP 계약 테스트와 DB 통합 테스트
tools/                  ESLint 의존 경계 규칙과 회귀 테스트
compose.yaml            로컬 PostgreSQL만 실행
.github/workflows/ci.yml 검증 워크플로
```

별도 entities/widgets 계층, 공통 패키지, 빈 폴더는 만들지 않는다. feature 내부는 게더와 같이 역할별 폴더로 구분한다. `api/`에는 API 함수와 query key/options, `hooks/`에는 mutation 등 React 훅, `components/`에는 화면과 폼, `schemas/`에는 입력 검증, `types/`에는 데이터 계약, `lib/`에는 React와 무관한 로직을 둔다. health에는 폼이나 mutation이 없으므로 schemas/hooks 폴더를 만들지 않는다. API 함수가 단순해도 경로·HTTP 계약을 화면에서 분리한다. query options를 감싸기만 하는 조회 훅은 만들지 않는다.

## 프론트엔드

### 공개 경계와 페이지 조합

`app → features → shared`가 기본 방향이다. app은 페이지를 조합하고 `GroupBoundary`가 소유 모임 조회·선택·첫 모임 생성 조건을 처리한다. 선택된 모임에 대해 app이 `GroupSettings`, `EventList`, `EventDetail`을 조합한다. 모임과 행사 사이에 불필요한 직접 의존을 만들지 않는다.

app과 다른 feature에서 접근하는 공개 경로는 다음과 같다.

- `features/<name>/client`: `use client` 진입점. 실제로 외부에서 사용하는 훅·컴포넌트만 이름을 명시해 export한다.
- `features/<name>/types`: 다른 feature에서 실제 사용하는 타입만 재공개하는 루트 `types.ts`. 내부 타입 정의는 `types/` 폴더에 둔다. 예를 들어 groups/events API는 auth의 공개 `SessionRequest` 타입을 사용한다.
- `features/<name>/server`: 서버 기능이 실제로 생기면 추가하고 `server-only`로 보호한다. 현재는 필요하지 않아 만들지 않았다.

서버·클라이언트 코드를 공통 index에서 재공개하지 않는다. feature 내부는 상대 경로를 사용하고 자신의 공개 진입점을 역으로 참조하지 않는다. 다른 feature 내부를 직접 import하지 않으며 타입 의존도 feature 간 순환 검사에 포함한다. shared가 업무 feature를 참조하거나 웹이 API 앱 소스를 import하는 것은 금지한다.

페이지/layout은 Server Component를 유지하고 상호작용 경계만 Client Component로 둔다. 인증 상태와 QueryClient는 Provider의 마운트 인스턴스에 속하며 서버 전역 사용자 상태를 만들지 않는다. 현재 업무 API는 클라이언트 세션 요청을 사용한다. SSR prefetch/hydration이나 Next에서 DB를 직접 다루는 코드는 없다.

### API와 캐시

컴포넌트 → query options / mutation → feature API → SessionClient.request → shared JSON 전송 → Nest API 순서다. 세션의 Access 만료 갱신, 한 번 재시도, 계정 변경 감지, 로그아웃 대기·실패 복구는 기존 SessionClient를 유지한다. 업무 API 함수를 단독 fetch로 우회하지 않는다. profile은 인증 feature가 소유한다.

| 데이터    | Query key                                      | 정책                                      |
| --------- | ---------------------------------------------- | ----------------------------------------- |
| profile   | `user / accountId / profile`                   | 인증 상태에서만 조회                      |
| 내 모임   | `user / accountId / groups`                    | 계정마다 별도 목록                        |
| 행사 목록 | `user / accountId / groups / groupId / events` | 모임마다 별도 목록                        |
| 행사 상세 | 위 목록 key + `eventId`                        | 목록과 상세 데이터를 구분                 |
| health    | `health`                                       | 비활성 탭 제외 5초 polling, 3초 요청 제한 |

업무 query는 `staleTime: 0`, `retry: false`이며 Query 기본 마운트·포커스·재연결 재조회를 사용한다. 실패는 오류 UI와 사용자의 다시 시도로 복구한다. placeholder로 이전 계정·모임 데이터를 재사용하지 않는다. `isError`를 잔존 성공 데이터보다 우선한다. Query의 AbortSignal을 API까지 전달한다.

mutation은 자동 재시도하지 않는다. 모임 저장 성공 시 진행 중인 목록 조회를 취소하고 응답으로 해당 계정 목록을 갱신한 뒤 stale로 표시한다. 첫 생성의 캐시 갱신과 이동은 같은 보호된 콜백에서 처리해 온보딩 폼 unmount와 경쟁하지 않는다. 행사 저장은 해당 모임의 조회를 취소하고 상세 응답을 저장한 뒤 그 목록만 무효화한다. 저장 성공 뒤 재조회 실패 때문에 생성 요청을 자동 반복하지 않는다.

계정·모드·URL이 바뀌면 app의 화면 key가 달라진다. mutation의 캐시 처리에는 화면 생존 검사를 두고, 행사 생성 후 이동은 마운트된 observer의 per-call callback에서 실행한다. 이전 화면의 늦은 응답이 캐시나 navigation을 복원하면 안 된다. 계정 전환·로그아웃 시 `user` query 취소·제거와 mutation cache 정리는 기존 AuthProvider가 담당한다.

### 폼과 공용 UI

폼은 React Hook Form + Zod resolver로 관리하고 제출된 유효 값만 mutation에 보낸다. 모임·행사명은 공백 제거 후 1~100자, 인증은 기존 이메일·12~128자 비밀번호 계약을 유지한다. 비밀번호를 trim하거나 Query mutation 변수에 저장하지 않는다. 일정은 선택 입력이며 유효한 한국 시각을 UTC ISO 문자열로 변환한다. 서버 DTO와 권한 검증은 최종 검증으로 유지한다.

서버 상태는 Query, 폼 입력·오류는 RHF, 로그인/가입 탭은 useState다. 공용 UI에는 도메인 타입이나 API 호출을 넣지 않는다. Button은 기본 `type="button"`이며 제출 버튼만 submit을 명시한다. Input은 ref와 표준 속성을 그대로 전달하고 오류 텍스트는 label·aria-invalid·aria-describedby와 연결한다. 로딩·오류 메시지는 status/alert로 전달한다.

Tailwind 4는 `@tailwindcss/postcss`를 웹의 PostCSS 설정에 등록하고 루트 CSS에서 import한다. 색상·radius는 CSS `@theme`로 정의하며 기존 화면의 색상과 폭을 유지한다. 컴포넌트 스타일은 utility, 공통 문서 기본값은 base layer, 폼 패널은 components layer에 둔다. `cn`은 clsx와 tailwind-merge를 합쳐 호출부의 className 재정의를 허용한다. 대규모 UI 디자인이나 별도 컴포넌트 라이브러리는 이번 범위가 아니다.

### 의존성 선택 (2026-11-14)

의존성은 모두 `apps/web/package.json`에 정확한 버전으로 선언한다. Next 16.4.3 / React 19.3.1 / TanStack Query 5.104.5는 유지한다.

| 추가 항목                             | 버전            | 용도                                         |
| ------------------------------------- | --------------- | -------------------------------------------- |
| react-hook-form / @hookform/resolvers | 7.92.0 / 7.0.6  | 폼 상태와 Zod 연동                           |
| zod                                   | 4.6.7           | 기능별 입력 스키마, 타입 추론                |
| clsx / tailwind-merge                 | 2.1.1 / 3.7.0   | 공통 cn                                      |
| tailwindcss / @tailwindcss/postcss    | 4.3.5 / 4.3.5   | CSS 토큰과 Next PostCSS 빌드                 |
| postcss                               | 8.5.32          | 배포 유예 예외가 필요 없는 호환 안정 버전    |
| @tanstack/react-query-devtools        | 5.104.5         | 기존 Query와 peer 범위를 맞춘 개발 전용 도구 |
| jsdom / @types/jsdom                  | 31.0.1 / 30.0.0 | Node 24.15.0에서 실제 React 폼 DOM 회귀 검사 |

스타일 빌드·Devtools·DOM 테스트 의존성은 devDependencies다. Devtools는 `NODE_ENV === "development"`에서만 렌더링하며 패키지의 production 비활성 export도 사용한다. pnpm 단일 lockfile과 기존 설치 스크립트 허용 정책을 유지한다. Zustand·Axios·Vite·별도 라우터는 추가하지 않는다.

게더 develop의 [아키텍처](https://github.com/KUIT-GATHER/gather-front/blob/develop/docs/architecture.md), [query options](https://github.com/KUIT-GATHER/gather-front/blob/develop/src/features/team/api/team.queries.ts), [mutation](https://github.com/KUIT-GATHER/gather-front/blob/develop/src/features/team/hooks/useCreateMeetingMutation.ts)을 읽고 책임별 파일·실사용 공용 UI·필요한 feature 간 의존 원칙을 참고했다. Vite, React Router, Zustand 인증, 게더의 제품 정책과 API는 옮기지 않았다.

### 검증 범위

루트의 frozen 설치·format:check·lint·typecheck·build·test를 기준으로 한다. 테스트는 기존 인증 갱신·계정 변경·로그아웃 복구와 함께 다음 동작을 검사한다.

- 공개 feature 참조 허용, 내부 참조·역방향 의존·feature 순환 차단.
- 첫 모임 생성 후 캐시 갱신과 이동, 이름 수정 실패 시 입력 유지와 수동 재시도.
- 한국 시간 일정 변환, 해당 모임 목록만 무효화, 화면 이탈 후 늦은 저장 응답 차단.
- 로그인·로그아웃 실패 복구 UI, 사용자 캐시 정리, 비밀번호의 mutation 변수 미포함.

2026-11-14 기준 최신 백엔드 PR #7을 반영한 뒤 설치·포맷·lint·타입 검사·프로덕션 빌드와 테스트 35개(경계 3, 웹 26, API 6)가 통과했다. 빌드는 앱 소스가 같아 기존 Turbo 캐시를 사용했다. 백엔드 병합 전에는 격리된 임시 PostgreSQL과 `pnpm dev`에서 직접 API·Next rewrite 응답, 로그인 → 두 모임 생성 → 행사 생성·목록 분리·잘못된 모임/행사 조합 404 → 모임 이름 수정 → 로그아웃 및 401을 확인했다. 기존 마이그레이션을 임시 DB에만 명시적으로 적용했다. 이 프론트 변경에는 API·DB 변경이 없어 DB 통합 테스트 전체는 로컬에서 다시 실행하지 않았다. 병합할 코드의 전체 검증과 DB 통합 테스트 결과는 PR의 CI에서 확인한다.

Chrome에서는 인증 화면 로딩과 개발용 Query Devtools 표시까지 확인했다. 전체 클릭 흐름·모바일 시각 검수는 사용자 브라우저 사용을 방해하지 않도록 중단했으며, DOM·HTTP 검증이 이를 대신했다고 보지 않는다.

## 백엔드와 HTTP 계약

하나의 Nest API에서 업무별 모듈을 추가하는 모듈형 모놀리스입니다. Controller는 HTTP 입출력, Service는 업무 처리·트랜잭션 조정을 맡습니다. Service는 DatabaseService.connect()로 초기화된 DataSource를 받아 Repository·EntityManager·트랜잭션 API를 사용합니다. DB Entity는 해당 modules/<업무> 안에 두고 외부 응답 DTO와 구분합니다. 단순 위임용 Repository·BaseService 계층은 없습니다.

업무 모듈은 `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.entity.ts`와 `*-request.dto.ts` / `*-response.dto.ts`로 구성합니다. 현재 규모에서는 깊은 계층보다 파일의 업무 의미가 잘 드러나는 평평한 구성을 사용합니다. DTO가 많아질 때만 해당 모듈 안의 `dto/request`, `dto/response`로 옮깁니다. Event DTO는 Group DTO를 상속하지 않습니다. 응답은 작은 변환 함수로 만들고 Entity를 노출하지 않습니다. 기존 Swagger 스키마 클래스 이름은 유지합니다.

의존 방향은 `events → groups → auth`, `events → auth`입니다. GroupsModule은 GroupsService를, AuthModule은 AccessGuard·AuthService를 Nest `exports`에 공개합니다. 사용하는 쪽은 해당 Module을 `imports`에 넣고 실제 Service/Guard 파일에서 named import합니다. `AuthUser`와 `CurrentUser`는 공개 타입·데코레이터로 직접 사용합니다. `.module.ts`는 DI 조립만 맡으며 내부 구현을 TypeScript로 재수출하지 않습니다. 내부 Repository/Entity는 외부 모듈에서 직접 사용하지 않습니다. Event FK는 테이블 이름 `groups`로 지정해 Entity import 없이 기존 제약 이름과 스키마를 유지합니다.

`AccessGuard`가 인증을 확인하고 `@CurrentUser()`가 검증된 id/email을 제공합니다. 소유권은 GroupsService가 별도로 검사하며 타인 자원과 없는 자원은 모두 404입니다. 행사 상세는 groupId와 eventId를 함께 조회합니다. 기존 `/api/v1/groups/:groupId/events` URL은 EventsController에 그대로 등록됩니다. 이름 trim·길이, nullable 일정·시간대 검증, 목록 정렬, 응답 필드, no-store, 쿠키·CSRF·인증 오류 코드를 유지합니다.

### DB 작업과 트랜잭션

단순 CRUD는 Service에서 `await database.connect()` 후 `getRepository()`로 처리합니다. AuthRepository는 원자적인 시도 제한 upsert만 담당하며 호출자가 전달한 EntityManager로 실행합니다. 범용 `run()`/예외 변환 래퍼는 두지 않습니다. 향후 반복되는 복잡한 조회·잠금이 생기면 해당 업무 내부 Repository 또는 QueryService로 분리합니다.

업무 트랜잭션은 Service의 `dataSource.transaction(async manager => ...)`에서 시작·종료합니다. 내부 조회·쓰기·권한 확인은 모두 그 manager를 사용해야 하며 중간에 전역 Repository나 `database.connect()`로 다른 매니저를 얻지 않습니다. EventsService.create는 GroupsService.assertOwned에 같은 manager를 전달한 뒤 행사를 저장합니다. 현재 모임 소유자 변경·삭제 API는 없으며, 향후 추가 시 동시 권한 변경에 대한 잠금 정책도 함께 설계해야 합니다.

AuthService는 가입 계정·세션·Refresh 저장과 Access 서명을 한 트랜잭션에 유지합니다. 비밀번호 해싱과 시도 제한 기록은 그 밖에 둡니다. Refresh 회전·재사용 폐기와 로그아웃의 세션 행 잠금도 유지합니다. 재사용 탐지 시 폐기를 먼저 커밋한 후 인증 오류를 반환합니다. 지연 초기화·동시 연결 대기·실패 후 재시도는 DatabaseService의 기존 책임이며 변경하지 않습니다.

실제 서버와 E2E 모두 `configureHttp`를 호출합니다. 앱 루트 prefix를 새로 붙이지 않아 기존 `/health`와 웹 rewrite 계약을 유지합니다.

| 경로                      | 의미                                     | 결과                                             |
| ------------------------- | ---------------------------------------- | ------------------------------------------------ |
| `GET /health`             | 프로세스 liveness, DB와 독립             | 200, `{"status":"ok","service":"chongmuya-api"}` |
| `GET /ready`              | TypeORM으로 PostgreSQL에 `SELECT 1` 실행 | 정상 200 + `database: "up"`, 장애 503            |
| `GET /docs`, `/docs-json` | Swagger UI·OpenAPI                       | 개발 기본 활성, production 기본 비활성           |

웹의 연결 화면은 **liveness**를 보여줍니다. DB까지 정상이라는 의미가 아니며 DB 상태는 `/ready`로 확인합니다.

입력 검증은 Nest ValidationPipe + class-validator/class-transformer 한 방식으로 통일했습니다. Swagger와 호환되는 클래스 DTO를 사용하고, 허용되지 않은 필드는 400으로 거부합니다. DTO 인스턴스 변환은 켜되 문자열의 숫자·boolean 암묵 변환은 끕니다. 업무 요청·응답 DTO는 각 업무 모듈에 둡니다. 검증 동작 확인용 Controller는 테스트에만 존재합니다.

오류는 원래 오류 HTTP 상태를 유지하며 다음 최소 규격을 반환합니다.

```json
{
  "statusCode": 503,
  "code": "SERVICE_UNAVAILABLE",
  "message": "서비스가 준비되지 않았습니다.",
  "requestId": "서버가 생성한 UUID"
}
```

오류 메시지는 공통 안전 문구로 제한합니다. SQL·예외 원문·스택·요청 입력값은 응답에 포함하지 않습니다. 향후 필드별 폼 오류가 필요하면 이 계약을 확장하고 테스트합니다.

모든 요청에 서버가 새 requestId를 만들고 `X-Request-Id` 헤더와 오류 본문에 연결합니다. 클라이언트가 보낸 ID를 신뢰하지 않습니다. 로그는 requestId·메서드·라우트 패턴·상태·처리 시간과 허용된 오류 진단을 기록합니다. 오류 진단은 `failure.category`(http/database_unavailable/unexpected), 고정된 오류 타입, 허용된 DB 코드와 최대 5개 앱 소스 위치(상대 경로·행·열)입니다. 예외 메시지·원본 stack·동적 함수 이름·비밀번호·토큰·쿠키·DB URL·SQL 파라미터는 기록하지 않습니다. URL의 실제 파라미터·query·body·인증 헤더를 기록하지 않습니다. 운영용 로그 수집기나 분산 추적 시스템은 아직 없습니다.

예상한 입력·권한·중복은 Service/Guard/ValidationPipe에서 400/401/403/404/409로 처리합니다. 이메일 동시 가입 충돌도 기존 409 처리입니다. 공통 필터는 알려진 PostgreSQL 연결 장애·서버 종료·연결 고갈·쿼리 시간 초과만 503으로 분류합니다. 알 수 없는 예외, TypeError, 스키마/쿼리 오류, 처리되지 않은 제약 위반은 500입니다. 모든 unique/FK 오류를 전역에서 입력 오류로 치환하지 말고, 사용자가 해결할 수 있는 예상된 충돌만 해당 업무 Service에서 해석합니다. DB 비밀번호·스키마 설정 오류는 일시적인 가용성 장애로 숨기지 않습니다. `/ready`도 실제 가용성 장애는 503이며 코드 오류는 500입니다.

## ESM과 환경변수 검증

API package.json은 `type: module`이며 기존 TypeScript `module/moduleResolution: NodeNext`를 유지합니다. 상대 import는 실행될 `.js` 확장자를 명시하고, 경로 계산에는 Node 24의 `import.meta.dirname`을 사용합니다. Nest CLI watch·프로덕션 실행·Node test runner·TypeORM CLI 모두 컴파일된 ESM을 사용합니다. 테스트는 tsc로 decorator metadata를 보존하며 별도 실험적 로더를 쓰지 않습니다.

Nest 12와 @nestjs/typeorm 12는 네이티브 ESM으로 배포됩니다. 공식 가이드는 CJS 유지도 지원하므로 전환이 필수는 아닙니다. 이 저장소는 초기 단계이고 Node 24가 고정되어 있어, 앞으로 ESM 의존성을 직접 사용하고 두 모듈 형식 간 변환 의존을 줄이는 쪽을 선택했습니다. 설치된 Nest·CLI·TypeScript 버전은 유지했습니다. 업계의 ESM 사용률을 확인했다는 의미는 아닙니다.

Zod **4.6.7**은 API 환경변수의 단일 스키마를 담당하며 설정 타입도 추론합니다. 포트는 숫자 문자열 → 정수 1~65535, DB는 호스트·DB 이름이 있는 PostgreSQL URL, 문서 노출 설정은 정확한 true/false 문자열만 허용합니다. `Boolean("false")` 같은 암묵 변환을 사용하지 않습니다. production 기본 문서 노출은 false입니다. Zod 오류 객체 전체를 로그로 출력하지 않고 잘못된 변수 이름만 표시합니다.

HTTP DTO는 기존 class-validator/class-transformer 및 Swagger 연동을 유지합니다. 환경변수와 HTTP 입력은 다른 경계이므로 같은 입력을 두 도구로 중복 검증하지 않습니다. 웹의 Zod는 실제 인증·모임·행사 폼 입력 검증에 별도로 사용합니다.

## PostgreSQL·TypeORM

- PostgreSQL `17.11-alpine` 로컬 컨테이너와 기존 볼륨을 유지합니다. 호스트의 `127.0.0.1:15432`로만 연결합니다.
- TypeORM **1.1.2**, @nestjs/typeorm **12.0.2**, pg **8.23.1**을 정확히 고정합니다. 공식 릴리스와 peer/Node 지원 범위를 확인했습니다. 현재 Node 24.15.0, Nest 12.2.0과 호환됩니다.
- `database-options.ts`는 Nest 런타임과 CLI가 공유하는 옵션입니다. Entity는 컴파일된 `modules/**/*.entity.js`, 마이그레이션은 `database/migrations/*.js`에서 읽습니다. 상대 경로는 현재 작업 디렉터리 대신 해당 파일 위치를 기준으로 계산합니다. src와 dist를 동시에 읽지 않습니다.
- `data-source.ts`는 CLI 전용 DataSource 진입점입니다. Nest는 이 파일을 import하지 않고 ConfigService와 공통 옵션으로 연결을 구성합니다. `.env` 로딩은 dotenv, 검증은 Zod가 담당합니다.
- `synchronize: false`, `migrationsRun: false`, `dropSchema: false`입니다. 인증·모임·행사 Entity와 두 개의 기존 마이그레이션이 있으며 install/build/start에서 자동 적용하지 않습니다.
- `TypeOrmModule.forRootAsync`의 `manualInitialization: true`로 DB 연결 없이 API를 시작합니다. DatabaseService.connect()가 첫 DB 요청에서 initialize하고 동시 요청은 같은 초기화 Promise를 기다립니다. 실패한 시도는 다음 요청에서 다시 연결합니다.
- DB 작업은 `await database.connect()` 후 반환된 DataSource의 Repository/transaction을 사용합니다. 초기화 전 @InjectRepository/DataSource를 바로 호출하지 않습니다. 업무 로직을 이 연결 서비스에 넣거나 GenericRepository를 만들지 않습니다.
- pool 크기는 5, 접속·SQL 제한 시간은 2초입니다. 종료 시 진행 중인 초기화를 기다린 다음 Nest TypeOrmModule이 DataSource.destroy()로 pool을 종료합니다.
- DB가 중단되어도 `/health`는 200이며 `/ready`의 실제 SELECT 1은 503입니다. 재시작 후 다음 readiness 요청에서 회복합니다. 응답·요청 로그에 SQL·접속 URL·예외 원문을 노출하지 않습니다.

### 빌드·마이그레이션

ORM Client 코드 생성 단계가 없습니다. API `build`는 Nest/TypeScript 컴파일이며 Turbo는 `dist/**`만 캐시합니다. Entity·마이그레이션·옵션 파일은 기본 입력에 포함됩니다. 런타임 DATABASE_URL은 빌드에 포함하지 않습니다. 웹의 API_URL·환경변수 캐시 규칙은 유지합니다.

Entity는 `modules/<업무>/*.entity.ts`에 실제로 필요한 모델만 추가합니다. 개발 DB에서 `pnpm --filter @chongmuya/api db:migration:generate src/database/migrations/<변경이름>`을 실행하면 먼저 빌드한 후 Entity와 DB 차이를 비교해 TypeScript 파일을 만듭니다. 생성 SQL을 검토하고 **다시 build**한 후 `db:migration:show`, `db:migration:run`을 실행합니다.

배포에서는 검토·커밋된 마이그레이션을 포함한 빌드 결과에 `db:migration:run`을 별도 단계에서 한 번 적용합니다. CLI는 ESM `dist/database/data-source.js`를 사용합니다. ts-node/실험적 ESM 로더를 추가하지 않았으며, build와 migrate를 서버 replica 시작에 묶지 않습니다. CLI의 대상 DATABASE_URL은 실행 전에 확인합니다.

이번 모듈 이동은 기존 마이그레이션과 DB 스키마를 변경하지 않습니다. `modules/**/*.entity.js`가 새 events 위치를 포함하며 격리 DB에서 기존 마이그레이션 적용 후 schema diff가 비어 있는지 검증합니다. Nest 빌드는 deleteOutDir를 사용하므로 이전 Entity 산출물을 남기지 않습니다.

인증·모임·행사 마이그레이션은 CI의 격리된 PostgreSQL에서 검증합니다. 이번 프론트 기반 변경에는 새 DB 마이그레이션이 없습니다.

TypeORM 1.1.2의 `migration:show`는 이력 테이블이 없으면 생성할 수 있으므로 대상 DB를 확인합니다. 운영 DB reset/drop은 수행하지 않습니다.

## 의존 경계 검사와 CI

기존 ESLint에 로컬 규칙을 추가했습니다. 상대 경로·웹 `@/` 별칭·`@chongmuya/` 패키지 경로의 정적 import/export, 문자열 리터럴 dynamic import/require를 검사합니다.

- 앱 간 직접 소스 import 금지.
- 웹 shared → features/app, features → app 역방향 금지. app과 다른 feature는 client/types/server 공개 진입점만 사용하며, feature 간 순환 의존은 타입 참조까지 검사한다.
- API common/config/database → 업무 modules 금지. 업무 module에서 bootstrap·app.module 역참조 금지.
- API 업무 모듈 간 `.module` 및 명시적 공개 Service·Guard·타입·데코레이터 import를 허용합니다. `tools/eslint-boundaries.mjs`의 `apiPublicImports` 목록은 실제 Nest exports와 함께 관리합니다. 모든 `*.service`를 무조건 공개하지 않으며 내부 Repository·Entity·미공개 Service와 module 재수출을 차단합니다. 소스 정적 import/export 그래프의 순환은 테스트에서 검사하고, 실제 DI 연결은 HTTP/통합 테스트로 검증합니다. 편의상 forwardRef·전역 모듈을 추가하지 않습니다.

계산된 dynamic import, 새로 추가한 별칭, 런타임 DI 의존 관계는 정적 규칙이 모두 검사하지 못합니다. 우회 경로를 만들지 않고 새 별칭 도입 시 규칙과 테스트를 함께 수정합니다. 타입 전용 import도 같은 경계를 지킵니다.

CI는 고정된 Node·pnpm과 커밋 SHA로 고정한 공식 Actions를 사용합니다. 외부 비밀 없이 임시 PostgreSQL 서비스에서 frozen 설치·lint·빌드·typecheck·일반 테스트·DB 통합 테스트를 실행하도록 구성했습니다. PR 및 main push가 트리거이며 Ruleset은 변경하지 않습니다. 워크플로 파일 추가와 GitHub에서 실제 실행 성공은 별개입니다.

pnpm 설치 스크립트는 테스트 런타임의 esbuild, 기존 린트 resolver의 정확한 버전만 허용합니다. 제거한 ORM의 엔진 설치 허용 항목도 제거했습니다. Swagger의 선택적 Scarf 설치 분석은 비활성화합니다.

## 과거 기반 검증 (2026-10-26)

2026-10-26 ESM·TypeORM·Zod 전환 이후 실제 실행한 결과입니다.

| 검증                                             | 결과                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| 기존 설치 산출물 정리 후 frozen 설치             | 성공, 제거한 ORM의 의존성·생성 코드·설치 허용 항목 없음          |
| 루트 lint·typecheck·build·test                   | 모두 통과                                                        |
| API dist 제거 후 Turbo 캐시 빌드                 | ESM 산출물 복원 및 Node 구문 검사 성공                           |
| Zod 및 실제 API 시작 실패 검사                   | 잘못된 필수 값·포트·문서 설정 거부, 비밀값 노출 없음             |
| 실제 HTTP·OpenAPI 계약                           | 정상·오류 상태 및 requestId 유지                                 |
| 실제 PostgreSQL 통합 테스트                      | 6개 동시 readiness 요청 성공, 종료 후 DataSource 연결 해제       |
| DB가 꺼진 상태의 API 시작 및 DB 복구             | liveness 200, readiness 503 → 200; API 재시작 불필요             |
| 연결된 DB 중단·복구                              | readiness 503 → 200, liveness 200 유지                           |
| 루트 dev·프로덕션 ESM start                      | 실행 성공; production에서 명시적으로 끈 docs-json은 404          |
| 브라우저 웹 연결                                 | 성공 → API 종료 시 실패 → API 재시작 후 새로고침 없이 성공       |
| CLI migration:generate --check 및 migration:show | ESM DataSource 로딩 성공, 변경할 Entity·실행할 마이그레이션 없음 |

위 표의 실행 당시에는 마이그레이션이 없었습니다. 위 표는 당시 로컬 검증 결과이며, 원격 CI 결과는 PR의 Checks 또는 Actions에서 확인합니다. GitHub Ruleset 등 저장소 설정은 변경하지 않았습니다.

## 다음 기능의 위치와 미구현 사항

- 웹 화면을 추가할 때 `features/<업무>`에 실제 사용하는 파일만 만들고 `app`의 페이지에서 조합합니다. 공통 UI는 실제 재사용할 때 shared로 이동합니다.
- API 업무는 `modules/<업무>`에 Controller·DTO·Service·Module을 추가합니다. DB Entity는 해당 모듈의 *.entity.ts에, 복잡한 계산은 해당 업무 내부 순수 함수나 서비스에 둡니다.
- 계정과 명단 구성원, 행사 당시 스냅샷과 현재 명단은 구분해야 합니다. 예약 없는 행사도 가능해야 합니다. 아직 이를 구현한 모델은 없습니다.
- 매장 하나 선택과 나머지 문의 종료는 같은 트랜잭션 및 DB 제약을 포함해 설계해야 합니다. 알림은 향후 상태 변경과 발송할 기록을 같은 트랜잭션에 남기고 별도 worker가 처리하는 방향을 검토합니다. 현재 outbox 테이블·worker·큐는 없습니다.
- JWT 로그인·쿠키·갱신과 현재 소유자 권한 검사는 구현되어 있습니다. 게스트 링크, 멤버십 확장, 정산 잔액 배분·버전 정책, 비공개 파일 접근, 데이터 삭제·인수인계 정책은 후속 작업입니다. Next.js가 업무 DB를 직접 수정하거나 Nest 업무 규칙을 중복 구현하지 않습니다.
- Zustand, infrastructure, 공유 패키지, API 클라이언트 생성, 클라우드 배포는 실제 필요가 생길 때 추가합니다.

## 공식 근거

아래 공식 자료, npm 패키지 메타데이터와 설치된 코드를 확인했습니다. 프론트 구조 참고 범위는 위 게더 문단에 명시합니다.

- [Nest 12 ESM 전환 가이드](https://docs.nestjs.com/migration-guide), [@nestjs/typeorm 12 릴리스](https://github.com/nestjs/typeorm/releases)
- [TypeORM 1.1.2 릴리스](https://github.com/typeorm/typeorm/releases/tag/1.1.2), [TypeORM 메타데이터](https://registry.npmjs.org/typeorm/1.1.2), [마이그레이션 실행](https://typeorm.io/docs/migrations/executing/)
- [Zod API](https://zod.dev/api), [Zod 4.6.7 메타데이터](https://registry.npmjs.org/zod/4.6.7)
- [Nest Validation](https://docs.nestjs.com/techniques/validation), [OpenAPI](https://docs.nestjs.com/openapi/introduction), [lifecycle](https://docs.nestjs.com/fundamentals/lifecycle-events)
- [Next Server/Client 경계](https://nextjs.org/docs/app/getting-started/server-and-client-components); 설치된 Next 16.4.3의 `dist/docs`도 확인
- [TanStack Query v5 SSR](https://tanstack.com/query/v5/docs/framework/react/guides/advanced-ssr), [요청 취소](https://tanstack.com/query/v5/docs/framework/react/guides/query-cancellation)
- [PostgreSQL 공식 이미지 목록](https://github.com/docker-library/official-images/blob/master/library/postgres)
- [actions/checkout](https://github.com/actions/checkout/releases/tag/v7.0.1), [actions/setup-node](https://github.com/actions/setup-node/releases/tag/v7.1.0), [pnpm/action-setup](https://github.com/pnpm/action-setup/releases/tag/v6.1.0)

- [Tailwind Next.js 설정](https://tailwindcss.com/docs/installation/framework-guides/nextjs), [theme 토큰](https://tailwindcss.com/docs/theme)
- [React Hook Form Zod 연동](https://react-hook-form.com/docs/useform), [resolver](https://github.com/react-hook-form/resolvers)
- [TanStack mutation 콜백](https://tanstack.com/query/latest/docs/framework/react/guides/mutations), [Devtools](https://tanstack.com/query/latest/docs/framework/react/devtools)
- [tailwind-merge](https://github.com/dcastil/tailwind-merge), [clsx](https://github.com/lukeed/clsx)

## 참고 저장소와 이번 구조의 선택 (2026-11-14)

[혼여족 develop](https://github.com/leedongkyu0701/honyeojok-backend/tree/c859ae75976108bca2159549236435e329d337a0)을 실제로 조회했습니다. `tags`의 Module/Service와 request DTO, `auth`의 Module/Service, `trip-routes`의 트랜잭션, 공통 HTTP bootstrap을 사용하는 E2E helper와 실제 DB 롤백 테스트를 참고했습니다.

- 참고 저장소 package.json은 Nest 11·TypeORM 0.3 계열 범위, 총무야 lockfile은 Nest 12.2.0·@nestjs/typeorm 12.0.2·TypeORM 1.1.2 고정입니다. Nest 공식 모듈 공개/사용자 데코레이터와 TypeORM 트랜잭션 문서를 Context7로 확인하고 설치된 `typeorm-core.module.js`의 manualInitialization 및 `EntityManager.js`의 transaction 구현과 대조했습니다.
- 업무별 Module/Controller/Service와 DTO 분리, 단순 CRUD의 Repository 직접 사용, Service 트랜잭션과 실제 DB 실패 테스트는 채택합니다. 혼여족의 전역 AuthModule, 직접 InjectRepository 초기화 가정, 사용자당 Refresh 해시·Refresh JWT, Vitest/Testcontainers·Redis 의존성은 복사하지 않습니다.
- 총무야는 네이티브 ESM, 지연 DB 연결, 세션별 난수 Refresh 이력·재사용 감지, Node test runner와 기존 두 마이그레이션을 유지합니다. Helmet 등 신규 의존성은 추가하지 않습니다.
- 인증·모임·행사·마이그레이션·readiness 통합 테스트를 책임별 파일로 나눕니다. 명시적으로 지정한 격리 TEST_DATABASE_URL에서만 마이그레이션/테스트 트리거를 사용합니다. 같은 테스트 DB의 마이그레이션과 IP 제한 행을 공유하므로 파일은 `--test-concurrency=1`로 실행합니다. 더 큰 병렬 테스트가 필요하면 파일별 DB/schema를 분리해야 합니다.
- 가입에는 모임이 필요하지 않지만 현재 웹 온보딩은 첫 모임 생성을 요구하고 행사의 group_id는 NOT NULL입니다. 이를 모임 없는 행사 지원으로 해석하지 않습니다. 카카오 로그인·이메일/휴대폰 검증은 추가하지 않았으며 이번 작업으로 새 제품 정책을 정하지 않습니다.

근거: [Nest Modules](https://docs.nestjs.com/modules), [Custom decorators](https://docs.nestjs.com/custom-decorators), [TypeORM Transactions](https://typeorm.io/docs/advanced-topics/transactions/).

## 백엔드 구조 변경 검증 (2026-11-14)

아래는 PR #7의 백엔드 작업 당시 검증 기록입니다. 현재 프론트 변경의 검증 결과는 해당 PR 본문에서 확인합니다.

- Node 24.15.0 / pnpm 11.25.0에서 `pnpm install --frozen-lockfile`, 변경 파일만 Prettier 적용 후 `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` 통과. 빌드는 API를 실제 컴파일하고 변경 없는 웹은 Turbo 캐시를 사용했다.
- 일반 테스트: 의존 경계·순환 검사 2개, API 설정/HTTP/오류 분류 6개, 기존 웹 20개 통과. API 오류 응답·Swagger 스키마와 모듈별 URL 등록을 확인했다.
- 전용 PostgreSQL 17.11 컨테이너의 격리 DB에서 `pnpm test:integration` 11개 통과. 기존 인증 회전·재사용·잠금·가입 실패 롤백과 자원 격리를 보존하고 서명 오류 500·쿠키 미발급, DB 장애 503·인증 쿠키 유지, 행사 생성의 동일 EntityManager, 연결 장애/복구를 추가 검증했다. 기존 마이그레이션의 계정·세션 데이터 보존 테스트도 유지했다.
- 컴파일한 CLI DataSource의 `db:migration:show`에서 기존 두 마이그레이션 적용 상태를 확인했다. groups/events Entity 중복 등록이 없고 실제 schema diff가 비어 있다. 기존 마이그레이션 파일과 자동 적용 설정은 수정하지 않았다.
- API는 `pnpm dev --filter=@chongmuya/api`의 4318 포트, 웹은 소스 변경 없이 별도 Next dev 3318 포트로 실행했다. 실제 API·Next rewrite를 통한 health/readiness, 가입, 내 정보, 모임 생성·수정, 행사 생성·상세, Refresh, 로그아웃을 확인했다.
- 독립된 in-app 브라우저에서 가입 → 첫 모임 → 행사 생성·상세를 확인했다. 이번 작업 전용 DB 중단 시 오류·재시도 표시, 연결 복구 후 같은 API 프로세스에서 재시도로 행사 목록 복원을 확인했다. Docker 임의 포트가 재시작 시 바뀌어 테스트 전용 TCP 프록시로 원래 엔드포인트를 복원했으며 앱 코드는 수정하지 않았다. 자동화된 연결 복구 테스트도 별도 TCP 프록시로 기존 DB·다른 클라이언트에 영향 없이 수행한다.
- 설치/소켓 검사는 최초 샌드박스의 네트워크·IPC 제한으로 실패한 뒤 필요한 권한으로 재실행해 통과했다. 요청된 로컬 검증 중 미실행 항목은 없다. 원격 CI·배포는 수행하지 않았다.
- 다른 작업의 변경을 덮어쓰지 않았고 apps/web·루트 package.json·pnpm-lock.yaml·turbo.json은 변경하지 않았다. 병합 시 공통 변경은 AGENTS.md, docs/architecture.md, docs/authentication.md, tools/eslint-boundaries.mjs 및 그 테스트를 확인한다. 웹 규칙과 검증 사례는 유지했다. commit·push·PR은 생성하지 않았다.

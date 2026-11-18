# 기본 아키텍처

총무야는 Next.js App Router 웹과 NestJS API로 구성한다. 프론트는 라우팅·기능·공용 코드의 책임을 나누고, 인증 계약은 [authentication.md](authentication.md)를 따른다. 행사는 생성한 계정이 소유한다. 모임 연결은 선택이며 연결해도 행사 소유자와 기존 기록은 유지된다. 이메일·비밀번호 또는 카카오로 로그인한 뒤 API의 HttpOnly 세션 쿠키를 사용한다.

## 책임과 폴더

```text
apps/web/
  app/                       라우트, 레이아웃, Provider, 페이지 조합
    workspace-screen.tsx     인증 화면과 모임·행사 화면 조합, URL별 화면 key
  features/
    auth/
      api/                   profile·가입 약관 요청·query options·이메일/휴대폰 API
      components/            Provider, 인증·복구 화면, 로그인·가입 폼
      hooks/                 인증 mutation
      lib/                   SessionClient 생명주기·갱신·잠금
      schemas/               credentials·signup schema
      types/                 계정·인증 상태·요청 타입
      client.ts / types.ts   외부 공개 진입점
    onboarding/
      components/            가입 후 이용 유형·총무 닉네임·이용 방식·환영 화면
      hooks/                 첫 설정 저장 mutation, 화면 이탈 취소
      schemas/               이용 유형·닉네임 검증
      client.ts              GettingStartedScreen 공개
    groups/
      api/                   groups.api.ts, groups.queries.ts
      components/            등록·명단 미리보기, GroupBoundary, GroupSettings
      hooks/                 use-save-group.ts, 공개 use-groups.ts
      lib/                   TXT·붙여넣기 해석, 동명이인 확인
      schemas/               모임 이름·선택 유형·명단 검증
      types/                 group.types.ts
      client.ts / types.ts   외부 컴포넌트·모임 타입 공개
    home/
      components/            실제 계정·모임·행사 첫 홈, 모임 안내와 선택창
      client.ts              HomeScreen 공개
    events/
      api/                   events.api.ts, events.queries.ts
      components/            EventList, EventDetail, EventForm, 모임 연결 폼
      hooks/                 생성·모임 연결 mutation
      lib/                   한국 시간 표시·행사 캐시 갱신
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
    ui/                      Button, Input, Select, FormError, 로딩·오류·빈 상태
  test/                      세션·HTTP·렌더링·폼 DOM 회귀 테스트
apps/api/
  src/
    main.ts             앱 실행과 정상 종료 훅
    bootstrap/          실제 서버와 E2E가 공유하는 HTTP 설정
    config/             환경변수 로딩·검증, 타입이 있는 설정
    common/http/        안전한 업무/필드 오류·requestId·요청 로그
    modules/auth/       인증·세션·시도 제한, 공개 Guard/사용자 타입/데코레이터
    modules/groups/     모임·기본 명단 저장과 소유권 검증, GroupsService 공개
    modules/events/     행사 소유권·조회·생성·수정·선택적 모임 연결
    modules/health/     DB와 독립된 liveness·실제 쿼리 readiness
    # 각 업무 모듈의 파일 배치
      *.module.ts / *.controller.ts / *.service.ts
      dto/request/      생성·조회·수정·연결 요청 DTO
      dto/response/     응답 DTO
      entities/         DB Entity
    # auth의 인증 구현
      guards/ / strategies/ / decorators/
      repositories/ / types/ / utils/ / exceptions/
    database/           TypeORM 옵션·CLI DataSource·연결 생명주기·오류 분류
      migrations/       인증·행사·계정 확장·GroupRoster 데이터 보존 migration
  test/                 설정·HTTP 계약 테스트와 DB 통합 테스트
tools/                  ESLint 의존 경계 규칙과 회귀 테스트
compose.yaml            로컬 PostgreSQL만 실행
.github/workflows/ci.yml 검증 워크플로
```

웹에 별도 entities/widgets 계층, 공통 패키지, 빈 폴더는 만들지 않는다. feature 내부는 게더와 같이 역할별 폴더로 구분한다. `api/`에는 API 함수와 query key/options, `hooks/`에는 mutation 등 React 훅, `components/`에는 화면과 폼, `schemas/`에는 입력 검증, `types/`에는 데이터 계약, `lib/`에는 React와 무관한 로직을 둔다. health에는 폼이나 mutation이 없으므로 schemas/hooks 폴더를 만들지 않는다. API 함수가 단순해도 경로·HTTP 계약을 화면에서 분리한다. 다른 feature가 사용하는 모임 조회는 공개 useGroups 훅으로 제공한다. 내부에서만 사용하는 query options에는 불필요한 래퍼를 만들지 않는다.

## 프론트엔드

### 공개 경계와 페이지 조합

`app → features → shared`가 기본 방향이다. app은 인증·행사·모임 관리 화면을 조합한다. `/events`는 모임 생성이나 선택을 요구하지 않으며 전체 내 행사를 보여준다. `/events?event=<id>`의 상세도 모임 조회와 독립적이다. `/events?group=<id>`는 본인 행사 목록의 모임 필터이며 `/mypage?group=<id>`는 관리할 모임 선택이다. `/getting-started`는 auth의 공개 client/types로 인증을 확인하고 로그인된 본인의 이용 유형·총무 닉네임을 저장하고 정기 모임/일회성 행사 안내를 제공한다. 첫 설정은 기존 nullable accountType/nickname으로 판단하고 미완료 단계만 다시 표시한다. 선택은 이동을 위한 UI 상태이며 DB에 온보딩 완료 상태를 추가하지 않는다. auth는 onboarding을 import하지 않고 완료 시 경로로 이동한다. 이용 유형 확인창의 문구·아이콘·저장은 onboarding이 맡고, shared/ui의 Dialog는 native showModal·초기 포커스·취소·포커스 복귀·스크롤 잠금만 담당한다. 단계 화면 틀(StepLayout/StepHeading)과 라디오 선택 카드(ChoiceCard)는 shared/ui에 두고 기존 색상·타이포·버튼과 카드 radius/shadow 토큰을 사용한다. GroupBoundary는 마이페이지의 모임 조회·선택·빈 상태만 담당한다. `/onboarding`에서도 내 행사로 시작할 수 있다.

공개 홈은 비로그인 접근을 허용한다. home은 auth·groups·events의 공개 진입점으로 실제 계정·선택 모임·행사를 조합한다. `/groups/new`는 첫 설정과 홈에서 재사용하는 등록 화면이다. 선택적인 유형·명단을 모두 저장한 응답을 받은 후 완료창을 표시한다. 모임 없는 홈에서는 개인 행사로 바로 진입한다. `/intro`와 `/start`는 auth의 공개 소개·가입 진입 화면이고, 개발용 `/dev/auth`는 기존 인증 미리보기와 health 연결 상태를 제공한다.

개인 화면은 인증 상태를 확인하고 로그인 링크에 원래 경로를 전달한다. auth의 safeReturnPath는 지원하는 내부 페이지와 UUID query만 재구성하며 외부 URL·프로토콜 상대 URL·역슬래시·제어 문자·인증/API 경로를 반환하지 않는다. next가 없는 새 가입·로그인은 홈으로 이동하고, 유효하지 않은 next의 안전한 기본값은 `/events`다. 실제 자료 권한은 Nest에서 검사한다.

app과 다른 feature에서 접근하는 공개 경로는 다음과 같다.

- `features/<name>/client`: `use client` 진입점. 실제로 외부에서 사용하는 훅·컴포넌트만 이름을 명시해 export한다.
- `features/<name>/types`: 다른 feature에서 실제 사용하는 타입만 재공개하는 루트 `types.ts`. 내부 타입 정의는 `types/` 폴더에 둔다. 예를 들어 groups/events API는 auth의 공개 `SessionRequest` 타입을 사용하고 events는 groups의 공개 `useGroups` 훅으로 선택지를 조회한다.
- `features/<name>/server`: 서버 기능이 실제로 생기면 추가하고 `server-only`로 보호한다. 현재는 필요하지 않아 만들지 않았다.

서버·클라이언트 코드를 공통 index에서 재공개하지 않는다. feature 내부는 상대 경로를 사용하고 자신의 공개 진입점을 역으로 참조하지 않는다. 다른 feature 내부를 직접 import하지 않으며 타입 의존도 feature 간 순환 검사에 포함한다. shared가 업무 feature를 참조하거나 웹이 API 앱 소스를 import하는 것은 금지한다.

페이지/layout은 Server Component를 유지하고 상호작용 경계만 Client Component로 둔다. 인증 상태와 QueryClient는 Provider의 마운트 인스턴스에 속하며 서버 전역 사용자 상태를 만들지 않는다. 현재 업무 API는 클라이언트 세션 요청을 사용한다. SSR prefetch/hydration이나 Next에서 DB를 직접 다루는 코드는 없다.

### API와 캐시

컴포넌트 → query options / mutation → feature API → SessionClient.request → shared JSON 전송 → Nest API 순서다. 세션의 Access 만료 갱신, 한 번 재시도, 계정 변경 감지, 로그아웃 대기·실패 복구는 기존 SessionClient를 유지한다. 업무 API 함수를 단독 fetch로 우회하지 않는다. profile은 인증 feature가 소유한다.

| 데이터         | Query key                                       | 정책                                      |
| -------------- | ----------------------------------------------- | ----------------------------------------- |
| profile        | `user / accountId / profile`                    | 인증 상태에서만 조회                      |
| 내 모임        | `user / accountId / groups`                     | 계정마다 별도 목록                        |
| 모임 기본 명단 | `user / accountId / groups / groupId / members` | 소유자만 조회, 행사 명단과 별개           |
| 내 행사        | `user / accountId / events / list`              | 개인·모임 연결 행사 전체                  |
| 모임별 내 행사 | `user / accountId / groups / groupId / events`  | 모임 필터에도 행사 소유권 적용            |
| 행사 상세      | `user / accountId / events / detail / eventId`  | 모임과 독립된 식별                        |
| health         | `health`                                        | 비활성 탭 제외 5초 polling, 3초 요청 제한 |

업무 query는 `staleTime: 0`, `retry: false`이며 Query 기본 마운트·포커스·재연결 재조회를 사용한다. 실패는 오류 UI와 사용자의 다시 시도로 복구한다. placeholder로 이전 계정·모임 데이터를 재사용하지 않는다. `isError`를 잔존 성공 데이터보다 우선한다. Query의 AbortSignal을 API까지 전달한다.

mutation은 자동 재시도하지 않는다. 모임 저장 성공 시 진행 중인 목록 조회를 취소하고 해당 계정의 목록을 응답으로 갱신한 뒤 stale로 표시한다. 캐시 갱신과 생성 후 이동은 같은 보호된 콜백에서 처리한다.

행사 생성·모임 연결 성공 시 전체 내 행사 목록, 연결된 모임별 목록과 상세의 진행 중 조회를 취소한다. 기존 목록의 해당 항목과 행사 상세를 응답으로 갱신하고 두 목록을 무효화한다. 활성 목록은 재조회하며 비활성 목록은 다음 사용 시 재조회한다. 다른 계정·다른 모임의 목록은 건드리지 않는다. 재조회 실패는 생성·연결을 자동 반복하지 않는다.

계정·모드·URL이 바뀌면 화면 key를 바꿔 폼과 mutation observer를 분리한다. 캐시 처리 전후 화면 생존을 검사하고 이동은 마운트된 observer의 콜백에서 실행한다. SessionClient도 계정 변경·로그아웃 이전 요청의 결과를 거부한다. AuthProvider는 `user` query 취소·제거와 mutation cache 정리를 담당한다. 늦은 응답이 이전 캐시나 화면 이동을 복원하면 안 된다.

### 폼과 공용 UI

폼은 React Hook Form + Zod resolver로 관리하고 제출된 유효 값만 mutation에 보낸다. 모임·행사명은 공백 제거 후 1~100자, 인증은 이메일과 공백 없는 ASCII 영문·숫자·특수문자 8~16자 비밀번호를 검증한다. 문자 종류별 필수 조합은 없다. 비밀번호를 trim하거나 Query mutation 변수에 저장하지 않는다. 일정은 선택 입력이며 유효한 한국 시각을 UTC ISO 문자열로 변환한다. 서버 DTO와 권한 검증은 최종 검증으로 유지한다.

서버 상태는 Query, 폼 입력·오류는 RHF, 로그인/가입 탭은 useState다. 공용 UI에는 도메인 타입이나 API 호출을 넣지 않는다. fieldErrors는 허용한 서버 필드를 폼 필드에 매핑해 setError로 표시한다. 예를 들어 scheduledAt은 date 입력에 연결한다. 알 수 없는 필드·업무 오류는 root.server에 표시하고 입력을 보존한다. Button은 기본 `type="button"`이며 제출 버튼만 submit을 명시한다. Input은 ref와 표준 속성을 그대로 전달하고 오류 텍스트는 label·aria-invalid·aria-describedby와 연결한다. 로딩·오류 메시지는 status/alert로 전달한다.

Tailwind 4는 `@tailwindcss/postcss`를 웹의 PostCSS 설정에 등록하고 루트 CSS에서 import한다. 색상·radius는 CSS `@theme`로 정의하며 기존 화면의 색상과 폭을 유지한다. 컴포넌트 스타일은 utility, 공통 문서 기본값은 base layer, 폼 패널은 components layer에 둔다. `cn`은 clsx와 tailwind-merge를 합쳐 호출부의 className 재정의를 허용한다. 모임 없음·행사 없음·조회 실패는 별도로 표시한다. 모임 조회가 실패해도 개인 행사 생성과 행사 상세 조회는 사용할 수 있다.

### 의존성

의존성은 모두 `apps/web/package.json`에 정확한 버전으로 선언한다. Next 16.4.3 / React 19.3.1 / TanStack Query 5.104.5는 유지한다.

| 항목                                  | 버전            | 용도                                         |
| ------------------------------------- | --------------- | -------------------------------------------- |
| react-hook-form / @hookform/resolvers | 7.92.0 / 7.0.6  | 폼 상태와 Zod 연동                           |
| zod                                   | 4.6.7           | 기능별 입력 스키마, 타입 추론                |
| clsx / tailwind-merge                 | 2.1.1 / 3.7.0   | 공통 cn                                      |
| tailwindcss / @tailwindcss/postcss    | 4.3.5 / 4.3.5   | CSS 토큰과 Next PostCSS 빌드                 |
| postcss                               | 8.5.32          | 배포 유예 예외가 필요 없는 호환 안정 버전    |
| @tanstack/react-query-devtools        | 5.104.5         | 기존 Query와 peer 범위를 맞춘 개발 전용 도구 |
| jsdom / @types/jsdom                  | 31.0.1 / 30.0.0 | Node 26.13.1에서 실제 React 폼 DOM 회귀 검사 |

스타일 빌드·Devtools·DOM 테스트 의존성은 devDependencies다. Devtools는 `NODE_ENV === "development"`에서만 렌더링하며 패키지의 production 비활성 export도 사용한다. pnpm 단일 lockfile과 기존 설치 스크립트 허용 정책을 유지한다. Zustand·Axios·Vite·별도 라우터는 추가하지 않는다.

게더 develop의 [아키텍처](https://github.com/KUIT-GATHER/gather-front/blob/develop/docs/architecture.md), [query options](https://github.com/KUIT-GATHER/gather-front/blob/develop/src/features/team/api/team.queries.ts), [mutation](https://github.com/KUIT-GATHER/gather-front/blob/develop/src/features/team/hooks/useCreateMeetingMutation.ts)을 읽고 책임별 파일·실사용 공용 UI·필요한 feature 간 의존 원칙을 참고했다. Vite, React Router, Zustand 인증, 게더의 제품 정책과 API는 옮기지 않았다.

## 백엔드와 HTTP 계약

하나의 Nest API에서 업무별 모듈을 추가하는 모듈형 모놀리스입니다. Controller는 HTTP 입출력, Service는 업무 처리·트랜잭션 조정을 맡습니다. Service는 DatabaseService.connect()로 초기화된 DataSource를 받아 Repository·EntityManager·트랜잭션 API를 사용합니다. DB Entity는 해당 modules/<업무> 안에 두고 외부 응답 DTO와 구분합니다. 단순 위임용 Repository·BaseService 계층은 없습니다.

업무 모듈 루트에는 `*.module.ts`, `*.controller.ts`, `*.service.ts`를 둡니다. 요청 DTO는 `dto/request/*.request.dto.ts`, 응답 DTO는 `dto/response/*.response.dto.ts`, Entity는 `entities/*.entity.ts`에 둡니다. 인증 구현은 guards·strategies·decorators·repositories·types·utils·exceptions로 나눕니다. 실제 파일이 있는 폴더만 만들며 단순 CRUD를 위해 별도 Repository나 Mapper 계층을 만들지 않습니다. Event DTO는 Group DTO를 상속하지 않습니다. 응답은 작은 변환 함수로 만들고 Entity를 노출하지 않습니다. 기존 Swagger 스키마 클래스 이름은 유지합니다.

의존 방향은 `events → groups → auth`, `events → auth`입니다. GroupsModule은 GroupsService를, AuthModule은 AccessGuard·AuthService를 Nest `exports`에 공개합니다. 사용하는 쪽은 해당 Module을 `imports`에 넣고 실제 Service/Guard 파일에서 named import합니다. `AuthUser`와 `CurrentUser`는 공개 타입·데코레이터로 직접 사용합니다. `.module.ts`는 DI 조립만 맡으며 내부 구현을 TypeScript로 재수출하지 않습니다. 내부 Repository/Entity는 외부 모듈에서 직접 사용하지 않습니다. Event FK는 테이블 이름 `accounts`·`groups`로 지정해 Entity import 없이 기존 제약 이름과 스키마를 유지합니다.

`AccessGuard`가 인증을 확인하고 `@CurrentUser()`가 검증된 id/email을 제공합니다. 모임 소유권은 GroupsService, 행사 소유권은 EventsService가 검사합니다. 행사 상세·수정·연결은 id와 ownerId로 조회하며 타인 자원과 없는 자원은 모두 404입니다. 목록을 모임으로 필터링해도 행사 ownerId 조건을 유지합니다. 이름 trim·길이, nullable 일정·시간대 검증, 고정 목록 정렬과 no-store를 적용합니다.

### 모임·행사 API

업무 경로는 `/api/v1`입니다. 성공 응답은 DTO, 목록은 배열이며 페이지네이션이나 공통 성공 wrapper를 사용하지 않습니다.

| 메서드·경로                                  | 입력·동작                                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| GET /groups, POST /groups                    | 내 모임 목록, `{ name, groupType?, creationKey?, members?, duplicatesConfirmed? }`로 모임·명단 원자적 생성 |
| GET /groups/:groupId, PATCH /groups/:groupId | 소유 모임 조회, `{ name }`으로 이름 수정                                                                   |
| GET /groups/:groupId/members                 | 소유자에게만 기본 명단의 ID·이름·구분 표시·선택 뒤 4자리 반환                                              |
| GET /events                                  | 전체 내 행사. 선택적 `groupId` query로 필터                                                                |
| POST /events                                 | `{ name, scheduledAt?, groupId? }`. ownerId는 인증 계정                                                    |
| GET /events/:eventId                         | 행사 소유자 상세 조회                                                                                      |
| PATCH /events/:eventId                       | `{ expectedVersion, name?, scheduledAt? }`. ownerId·groupId 입력 금지                                      |
| PUT /events/:eventId/group                   | `{ expectedVersion, groupId }`. 개인 행사에 본인 모임 연결                                                 |

EventDto는 `id`, `ownerId`, nullable `groupId`, `name`, nullable `scheduledAt`, `version`입니다. 이름은 trim 후 1~100자, 일정은 생략/null 또는 시간대가 있는 ISO 8601입니다. groupId는 생성에서 생략/null을 허용하고 연결 명령에서는 필수 UUID입니다. expectedVersion은 1 이상의 정수입니다. 서버 결정 필드와 알 수 없는 입력을 ValidationPipe가 거부합니다. 이전 `/groups/:groupId/events` 중첩 API는 제공하지 않습니다.

### DB 작업과 트랜잭션

모임 등록은 groups 업무에서 Group·GroupMember를 같은 EntityManager로 저장한다. `(owner_id, creation_key)` 고유 인덱스와 입력 해시로 같은 등록의 동시 요청·통신 재시도를 처리한다. 명단은 계정이나 행사 명단과 관계없는 비공개 기본 자료다. 동명이인은 총무가 확인하고 서로 다른 구분 표시(label)를 입력한 별도 행으로 보존한다. 이름과 구분 표시는 별도 컬럼이며 전화번호 뒤 4자리는 앞의 0을 보존하는 nullable 문자열이다. 그룹 단위 조회에 소유권을 검사하고 응답에 인증·권한 필드를 포함하지 않는다. JSON body는 500명의 긴 UTF-8 이름을 수용하도록 256KB까지 허용하고, DTO의 행 수·필드 길이 제한도 적용한다.

`POST /groups/:groupId/members`는 `{ requestKey, members, duplicatesConfirmed? }`로 기존 명단에 구성원을 추가한다. 소유한 Group 행을 먼저 잠근 뒤 최신 명단과 이름·구분 표시를 비교한다. 기존 구성원을 선택하면 `existingMemberId`와 해당 구성원의 이름·구분 표시·뒤 4자리를 검증하고 추가나 수정 없이 유지한다. 새 동명이인은 기존 명단과도 구분되는 표시를 요구한다. GroupMember 추가와 GroupRosterAddition의 `(group_id, request_key)` 재시도 기록을 같은 트랜잭션에서 저장한다. 같은 키의 다른 입력은 409이며 기존 행·순서·ID나 행사 명단을 교체하지 않는다. 최초 등록과 `/groups/new?group=<id>`의 추가 등록은 GroupRegistration의 입력·TXT·미리보기를 재사용한다. 변경된 원문만 다시 해석하고 원문이 같으면 편집·제외 결과를 보존한다.

홈의 모임 선택은 `/?group=<id>`로 유지하며 하단 홈과 새 행사 진입에 전달한다. 모임 조회가 미완료·실패했거나 요청한 모임에 접근할 수 없으면 행사 생성 진입을 표시하지 않는다. 조회에 성공한 빈 목록에서는 개인 행사를 바로 시작한다.

단순 CRUD는 Service에서 `await database.connect()` 후 `getRepository()`로 처리합니다. AuthAttemptsRepository는 원자적인 시도 제한 upsert만 담당하며 호출자가 전달한 EntityManager로 실행합니다. 범용 `run()`/예외 변환 래퍼는 두지 않습니다. 향후 반복되는 복잡한 조회·잠금이 생기면 해당 업무 내부 Repository 또는 QueryService로 분리합니다.

업무 트랜잭션은 Service의 `dataSource.transaction(async manager => ...)`에서 시작·종료합니다. 내부 조회·쓰기·권한 확인은 모두 그 manager를 사용해야 하며 중간에 전역 Repository나 `database.connect()`로 다른 매니저를 얻지 않습니다. EventsService.create는 groupId가 있으면 GroupsService.assertOwned에 같은 manager를 전달하고 행사를 저장합니다. 연결 명령은 행사 id/ownerId 조건으로 행을 FOR UPDATE 잠금하고, 같은 manager로 모임 소유권을 확인한 뒤 expectedVersion과 미연결 상태를 검사합니다. groupId와 version만 갱신하며 소유자·일정·생성 시각은 그대로 둡니다. 일반 수정도 같은 행사 잠금·버전 검사를 사용합니다. 동시 연결 중 먼저 커밋한 요청만 반영되고 뒤의 요청은 VERSION_CONFLICT입니다. 최신 버전으로 이미 연결된 행사를 다시 연결하면 EVENT_ALREADY_LINKED입니다. 현재 모임 소유자 변경·삭제 API는 없으며, 향후 추가 시 동시 권한 변경에 대한 잠금 정책도 함께 설계해야 합니다.

AuthService는 이메일·휴대폰 인증 소비·가입 계정·동의·세션·Refresh 저장과 Access 서명을 한 트랜잭션에 유지합니다. 비밀번호 해싱과 시도 제한 기록은 그 밖에 둡니다. Refresh 회전·재사용 폐기와 로그아웃의 세션 행 잠금도 유지합니다. 재사용 탐지 시 폐기를 먼저 커밋한 후 인증 오류를 반환합니다. 지연 초기화·동시 연결 대기·실패 후 재시도는 DatabaseService의 기존 책임이며 변경하지 않습니다.

실제 서버와 E2E 모두 `configureHttp`를 호출합니다. 업무 API는 `/api/v1`, liveness는 `/health`입니다. 브라우저는 공개 API origin에 직접 요청하며 Next rewrite를 사용하지 않습니다. configureHttp의 CORS는 정확한 WEB_ORIGIN에 credentials와 요청 ID 응답 헤더 노출을 허용하고, preflight를 Guard 전에 처리합니다.

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

오류 메시지는 코드가 정의한 안전 문구로 제한합니다. DomainHttpException의 `VALIDATION_FAILED`(400), `VERSION_CONFLICT`(409), `EVENT_ALREADY_LINKED`(409)만 명시적으로 전달합니다. 임의 HttpException의 code/message는 신뢰하지 않으며 인증의 ACCESS_EXPIRED·SESSION_INVALID·INVALID_CREDENTIALS와 기존 공통 코드는 유지합니다.

DTO 검증 오류는 선택적 `fieldErrors: Array<{ field: string; code: string }>`를 제공합니다. code는 INVALID_TYPE·INVALID_LENGTH·INVALID_EMAIL·INVALID_UUID·INVALID_FORMAT·INVALID_VALUE 중 하나입니다. field는 DTO property path이며 알 수 없는 입력 키와 validator 원문·target·value는 포함하지 않습니다. 예: `[{ "field": "name", "code": "INVALID_LENGTH" }]`. 메시지·SQL·stack·비밀번호·토큰 등 입력이나 예외 원문을 응답·로그에 남기지 않습니다.

웹 requestJson은 상태 일치, code, message의 형식, UUID requestId와 fieldErrors를 검증합니다. 안전한 메시지는 클라이언트의 허용 코드 매핑으로 선택하며 서버 message 자체는 출력하지 않습니다. HTML·깨진 JSON·알 수 없는 구조는 HTTP_ERROR, 잘못된 성공 JSON은 INVALID_RESPONSE입니다. 취소·타임아웃·204와 POST/PUT/PATCH의 CSRF 처리는 같은 전송 함수를 사용합니다.

모든 요청에 서버가 새 requestId를 만들고 `X-Request-Id` 헤더와 오류 본문에 연결합니다. 클라이언트가 보낸 ID를 신뢰하지 않습니다. 로그는 requestId·메서드·라우트 패턴·상태·처리 시간과 허용된 오류 진단을 기록합니다. 오류 진단은 `failure.category`(http/database_unavailable/unexpected), 고정된 오류 타입, 허용된 DB 코드와 최대 5개 앱 소스 위치(상대 경로·행·열)입니다. 예외 메시지·원본 stack·동적 함수 이름·비밀번호·토큰·쿠키·DB URL·SQL 파라미터는 기록하지 않습니다. URL의 실제 파라미터·query·body·인증 헤더를 기록하지 않습니다. 운영 로그 수집기는 이 안전한 로그 형식을 유지해야 합니다.

예상한 입력·권한·중복은 Service/Guard/ValidationPipe에서 400/401/403/404/409로 처리합니다. 이메일 동시 가입 충돌도 기존 409 처리입니다. 공통 필터는 알려진 PostgreSQL 연결 장애·서버 종료·연결 고갈·쿼리 시간 초과만 503으로 분류합니다. 알 수 없는 예외, TypeError, 스키마/쿼리 오류, 처리되지 않은 제약 위반은 500입니다. 모든 unique/FK 오류를 전역에서 입력 오류로 치환하지 말고, 사용자가 해결할 수 있는 예상된 충돌만 해당 업무 Service에서 해석합니다. DB 비밀번호·스키마 설정 오류는 일시적인 가용성 장애로 숨기지 않습니다. `/ready`도 실제 가용성 장애는 503이며 코드 오류는 500입니다.

## ESM과 환경변수 검증

API package.json은 `type: module`이며 기존 TypeScript `module/moduleResolution: NodeNext`를 유지합니다. 상대 import는 실행될 `.js` 확장자를 명시하고, 경로 계산에는 Node 26의 `import.meta.dirname`을 사용합니다. Nest CLI watch·프로덕션 실행·Node test runner·TypeORM CLI 모두 컴파일된 ESM을 사용합니다. 테스트는 tsc로 decorator metadata를 보존하며 별도 실험적 로더를 쓰지 않습니다.

Nest 12와 @nestjs/typeorm 12의 ESM 패키지를 사용합니다. API 환경은 Zod로 검증합니다. AUTH_SECRET은 32자 이상, WEB_ORIGIN은 경로 없는 http/https origin이며 production은 https만 허용합니다. DATABASE_URL은 호스트·DB 이름이 있는 PostgreSQL URL입니다. API_PORT는 정수 1~65535, API_DOCS_ENABLED는 정확한 true/false 문자열만 받으며 production 기본값은 false입니다. OCTOMO_API_KEY는 선택적이지만 설정되면 공백 없는 비어 있지 않은 문자열이어야 하며 서버에서만 사용합니다. SIGNUP_TERMS_JSON은 네 약관의 식별자·버전·HTTPS URL 배열을 검증합니다. 두 변수는 Turbo의 API dev 작업에만 전달합니다. 오류에는 변수 이름만 표시합니다.

HTTP DTO는 기존 class-validator/class-transformer 및 Swagger 연동을 유지합니다. 환경변수와 HTTP 입력은 다른 경계이므로 같은 입력을 두 도구로 중복 검증하지 않습니다. 웹의 Zod는 실제 인증·모임·행사 폼 입력 검증에 별도로 사용합니다.

## PostgreSQL·TypeORM

- PostgreSQL `17.11-alpine` 로컬 컨테이너와 기존 볼륨을 유지합니다. 호스트의 `127.0.0.1:15432`로만 연결합니다.
- TypeORM **1.1.2**, @nestjs/typeorm **12.0.2**, pg **8.23.1**을 정확히 고정합니다. Node·Nest 버전은 packageManager·engines·lockfile과 함께 관리합니다.
- `database-options.ts`는 Nest 런타임과 CLI가 공유하는 옵션입니다. Entity는 컴파일된 `modules/**/*.entity.js`, 마이그레이션은 `database/migrations/*.js`에서 읽습니다. 상대 경로는 현재 작업 디렉터리 대신 해당 파일 위치를 기준으로 계산합니다. src와 dist를 동시에 읽지 않습니다.
- `data-source.ts`는 CLI 전용 DataSource 진입점입니다. Nest는 이 파일을 import하지 않고 ConfigService와 공통 옵션으로 연결을 구성합니다. `.env` 로딩은 dotenv, 검증은 Zod가 담당합니다.
- `synchronize: false`, `migrationsRun: false`, `dropSchema: false`입니다. 인증·모임·행사 Entity와 migration을 install/build/start에서 자동 적용하지 않습니다.
- `TypeOrmModule.forRootAsync`의 `manualInitialization: true`로 DB 연결 없이 API를 시작합니다. DatabaseService.connect()가 첫 DB 요청에서 initialize하고 동시 요청은 같은 초기화 Promise를 기다립니다. 실패한 시도는 다음 요청에서 다시 연결합니다.
- DB 작업은 `await database.connect()` 후 반환된 DataSource의 Repository/transaction을 사용합니다. 초기화 전 @InjectRepository/DataSource를 바로 호출하지 않습니다. 업무 로직을 이 연결 서비스에 넣거나 GenericRepository를 만들지 않습니다.
- pool 크기는 5, 접속·SQL 제한 시간은 2초입니다. 종료 시 진행 중인 초기화를 기다린 다음 Nest TypeOrmModule이 DataSource.destroy()로 pool을 종료합니다.
- DB가 중단되어도 `/health`는 200이며 `/ready`의 실제 SELECT 1은 503입니다. 재시작 후 다음 readiness 요청에서 회복합니다. 응답·요청 로그에 SQL·접속 URL·예외 원문을 노출하지 않습니다.

### 빌드·마이그레이션

ORM Client 코드 생성 단계가 없습니다. API `build`는 Nest/TypeScript 컴파일이며 Turbo는 `dist/**`만 캐시합니다. Entity·마이그레이션·옵션 파일은 기본 입력에 포함됩니다. Nest 빌드와 test:compile은 각 출력 폴더를 비워 이동 전 Entity 산출물이 중복 로드되지 않도록 합니다. Entity 탐색은 `modules/**/*.entity.js`로 역할별 하위 폴더를 포함합니다. 런타임 DATABASE_URL은 빌드에 포함하지 않습니다. 웹의 NEXT_PUBLIC_API_ORIGIN·환경변수 캐시 규칙은 유지합니다.

Entity는 `modules/<업무>/entities/*.entity.ts`에 실제로 필요한 모델만 추가합니다. 개발 DB에서 `pnpm --filter @chongmuya/api db:migration:generate src/database/migrations/<변경이름>`을 실행하면 먼저 빌드한 후 Entity와 DB 차이를 비교해 TypeScript 파일을 만듭니다. 생성 SQL을 검토하고 **다시 build**한 후 `db:migration:show`, `db:migration:run`을 실행합니다.

배포에서는 검토·커밋된 마이그레이션을 포함한 빌드 결과에 `db:migration:run`을 별도 단계에서 한 번 적용합니다. CLI는 ESM `dist/database/data-source.js`를 사용합니다. ts-node/실험적 ESM 로더를 추가하지 않았으며, build와 migrate를 서버 replica 시작에 묶지 않습니다. CLI의 대상 DATABASE_URL은 실행 전에 확인합니다.

`PersonalEvents` migration은 하나의 트랜잭션에서 owner_id nullable 추가 → 연결된 groups.owner_id로 backfill → 누락 검증 → NOT NULL/FK/index 적용 → group_id nullable 변경과 version 추가를 수행합니다. 기존 인증·모임·행사 ID, 일정·생성 시각을 보존하며 기존 migration 파일은 수정하지 않습니다. DDL 잠금이 적용 중 쓰기를 막으므로 서비스 쓰기를 멈추고 migration과 호환되는 앱을 함께 배포합니다. 새 API는 owner_id를 필수로 쓰므로 구버전 서버와 혼합 실행하지 않습니다.

`down`은 개인 행사, 모임 소유자와 다른 행사 소유자, version이 1이 아닌 기록이 있으면 중단합니다. 이러한 데이터는 이전 스키마에서 표현할 수 없습니다. 되돌리기 위해 데이터를 삭제하거나 모임을 만들지 않으며, 데이터가 생긴 뒤에는 보존 가능한 후속 migration과 앱 수정으로 복구합니다. 테스트는 격리 PostgreSQL의 빈 DB 전체 적용·기존 데이터 backfill·누락 검출·rollback 거부와 Entity schema diff를 검사합니다.

`1794787200000-VerifiedSignup`은 기존 Account의 id/email/password_hash/created_at과 기존 모임·행사·세션을 보존하고 이름·닉네임·전화번호·휴대폰/이메일 인증 시각을 nullable로 추가합니다. 기존 계정은 미인증 상태(null)를 유지하며 임의 backfill을 하지 않습니다. account_consents와 phone_verifications를 추가하고 전화번호·닉네임 unique 제약은 만들지 않습니다. 새 가입 필드·동의·인증 기록이 존재하면 down은 데이터 손실을 막기 위해 거부합니다. 운영 DB를 지우지 말고 후속 migration으로 복구합니다. 새 계약을 사용하는 API와 웹을 함께 배포합니다. 만료된 휴대폰 요청과 오래된 시도 제한 기록의 운영 정리 정책은 별도로 적용해야 합니다.

`1794790800000-AccountTypes`는 account_type nullable 컬럼과 organizer/owner 허용 제약을 추가합니다. 기존 계정의 이용 유형은 추측하지 않고 null로 유지하며 계정·모임·행사 ID를 보존합니다. 신규 가입의 유형은 null이며 인증된 본인의 첫 설정 API로 저장합니다. 세션 응답으로 전달하지만 자원 권한에는 사용하지 않습니다. 유형 기록이 생긴 뒤 down은 데이터 손실을 막기 위해 거부합니다.

TypeORM 1.1.2의 `migration:show`는 이력 테이블이 없으면 생성할 수 있으므로 대상 DB를 확인합니다. 운영 DB reset/drop은 수행하지 않습니다.

## 의존 경계 검사와 CI

ESLint 로컬 규칙으로 의존 경계를 검사합니다. 상대 경로·웹 `@/` 별칭·`@chongmuya/` 패키지 경로의 정적 import/export, 문자열 리터럴 dynamic import/require를 검사합니다.

- 앱 간 직접 소스 import 금지.
- 웹 shared → features/app, features → app 역방향 금지. app과 다른 feature는 client/types/server 공개 진입점만 사용하며, feature 간 순환 의존은 타입 참조까지 검사한다.
- API common/config/database → 업무 modules 금지. 업무 module에서 bootstrap·app.module 역참조 금지.
- API 업무 모듈 간 `.module` 및 명시적 공개 Service·Guard·타입·데코레이터 import를 허용합니다. `tools/eslint-boundaries.mjs`의 `apiPublicImports` 목록은 실제 Nest exports와 함께 관리합니다. 모든 `*.service`를 무조건 공개하지 않으며 내부 Repository·Entity·미공개 Service와 module 재수출을 차단합니다. 소스 정적 import/export 그래프의 순환은 테스트에서 검사하고, 실제 DI 연결은 HTTP/통합 테스트로 검증합니다. 편의상 forwardRef·전역 모듈을 추가하지 않습니다.

계산된 dynamic import, 새로 추가한 별칭, 런타임 DI 의존 관계는 정적 규칙이 모두 검사하지 못합니다. 우회 경로를 만들지 않고 새 별칭 도입 시 규칙과 테스트를 함께 수정합니다. 타입 전용 import도 같은 경계를 지킵니다. ESLint 오류는 내부 파일 직접 참조, feature 순환 의존, 클라이언트의 서버 전용 참조를 구분해 표시합니다.

CI는 고정된 Node·pnpm과 커밋 SHA로 고정한 공식 Actions를 사용합니다. 외부 비밀 없이 임시 PostgreSQL 서비스에서 frozen 설치·lint·빌드·typecheck·일반 테스트·DB 통합 테스트를 실행합니다. PR 및 main push가 트리거이며 실행 결과는 PR Checks와 Actions에서 확인합니다.

pnpm 설치 스크립트는 테스트 런타임의 esbuild, 기존 린트 resolver의 정확한 버전만 허용합니다. Swagger의 선택적 Scarf 설치 분석은 비활성화합니다.

`1794873600000-EmailVerification`은 요청자별 현재 이메일 인증을 email_verifications에 추가합니다. 기존 Account의 nullable 필드로 첫 설정 상태를 표현하므로 계정 상태 컬럼을 추가하지 않습니다. 기존 계정·모임·행사·세션과 인증 시각을 변경하지 않습니다. 인증 기록이 존재하면 down을 거부하며 운영 복구는 후속 마이그레이션으로 처리합니다.

가입 요청자 쿠키는 두 인증이 공유합니다. EmailVerificationService와 PhoneVerificationService는 각각 발급·검증·소비를 관리하고, ResendMailService와 OctomoService는 외부 통신만 담당합니다. 외부 응답을 기다리는 동안 DB 트랜잭션을 유지하지 않습니다. AuthService가 두 인증 행을 이메일→휴대폰 순서로 잠그고 소비·계정·동의·최초 세션을 원자적으로 저장합니다. 첫 설정 API는 AccessGuard/CurrentUser로 본인 계정을 결정하고 계정 행 잠금 안에서 이용 유형의 불변성을 검증합니다.

약관 Query는 공개 데이터입니다. 이미 받은 약관의 배경 재조회 실패에는 폼과 인증을 보존하고 안내만 표시합니다. 약관 버전 변경은 해당 동의만 다시 받으며 전체 폼 key로 쓰지 않습니다. 첫 설정 저장은 SessionClient가 결과를 현재 계정에 적용하고 계정 전환·로그아웃·화면 이탈 뒤 응답은 버립니다. 비밀번호와 두 인증의 비밀값은 Query·브라우저 영구 저장소에 보관하지 않습니다.

## 복구와 외부 로그인 저장 경계

PasswordResetService는 복구 토큰 발급·소비, KakaoFlowService는 브라우저별 OAuth 시도와 가입/연결 트랜잭션, KakaoOidcService는 외부 OIDC 검증을 담당합니다. SessionIssuerService는 기존 세션/JWT 발급을 공유하며 ResendMailService는 계속 발송만 담당합니다. 새 제공자 프레임워크나 공통 패키지는 없습니다.

자격 증명 경합은 Account 행 잠금으로 직렬화합니다. 로그인은 트랜잭션 밖에서 scrypt를 검증한 후 잠긴 Account의 passwordHash가 같은지 확인합니다. refresh/logout/link는 Account → AuthSession 순서입니다. 재설정도 Account를 먼저 잠그고 토큰 재검증·비밀번호·세션 폐기·남은 증명 무효화를 원자적으로 처리합니다. 외부 식별자를 생성/연결하는 경로는 issuer/sub advisory lock → Account(기존 계정) → 세션 → 시도 순서입니다. 일반 OAuth 콜백은 시도만 잠그며 외부 통신 전에 잠금을 풉니다. 계정 잠금 이전에 시작한 작업도 최종 잠금 안에서 현재 자격 증명/세션을 재검사합니다.

`1794960000000-PasswordResetKakao`는 password_resets, kakao_attempts, external_identities와 FK·인덱스·고유 제약을 추가합니다. 기존 password_hash만 nullable로 완화하고 email_verification_source/credentials_changed_at을 nullable로 추가합니다. 기존 Account·AuthSession·모임·행사 ID, 비밀번호와 인증 시각은 변경하지 않습니다. 기존 migration 뒤 API build → 대상 DB 확인 → db:migration:show → db:migration:run → 새 API/웹 배포 순서입니다. 구 API는 null 비밀번호 계정을 처리하지 못하므로 카카오를 활성화하기 전에 모든 API replica를 새 버전으로 전환합니다.

새 테이블 기록, null 비밀번호, 인증 출처/자격 변경 기록이 있으면 down은 중단합니다. 이전 스키마로 돌리기 위해 소셜 계정을 지우거나 가짜 비밀번호를 넣지 않습니다. 데이터가 생긴 뒤에는 nullable 비밀번호를 지원하는 코드와 보존 가능한 후속 migration으로 복구합니다. 자동 migrate/synchronize/dropSchema는 계속 false이며 운영 DB를 초기화하지 않습니다. 만료된 시도/복구 이력의 보존·정리는 운영 정책에 따라 별도로 수행해야 합니다.

브라우저의 HTTP 전송은 shared/http가 NEXT_PUBLIC_API_ORIGIN에 credentials를 포함해 요청합니다. 업무 요청은 기존 SessionClient를 사용하고, 공개 health 요청은 `/health`를 사용합니다. 인증 SSR과 BFF는 없으며 AuthProvider가 클라이언트에서 세션을 복원합니다. API 호스트의 host-only 쿠키는 Next 서버로 전달되지 않습니다.

카카오 GET 콜백은 명시적인 KAKAO_REDIRECT_URI의 Nest 엔드포인트에서만 처리합니다. 임시 결과를 DB에 저장한 뒤 WEB_ORIGIN의 깨끗한 완료 화면으로 이동하고, 프론트가 Origin·CSRF 헤더를 갖춘 POST로 API에 최종 확정을 요청합니다. 콜백 query는 프론트 URL이나 애플리케이션 로그에 전달하지 않습니다. 운영 ingress·CDN·APM의 query 수집도 배포 설정에서 제외해야 합니다.

`1795132800000-RosterAdditions`는 기존 구성원에 nullable label과 별도 명단 추가 재시도 기록 테이블을 추가한다. 기존 모임·구성원·행사·계정 ID와 데이터는 그대로 유지한다. API 빌드 → 대상 DB 확인 → `pnpm --filter @chongmuya/api db:migration:show` → `pnpm --filter @chongmuya/api db:migration:run` → 새 API/웹 순서로 적용한다. 구분 표시 또는 재시도 기록이 생긴 뒤에는 손실을 막기 위해 down을 거부한다. 새 환경변수는 없다. 신규 동명이인 등록에는 구분 표시가 필수이므로 API와 웹을 함께 갱신한다. 이전 버전의 레이블 없는 중복 등록 요청도 이미 저장된 creationKey가 있으면 기존 결과를 돌려준다.

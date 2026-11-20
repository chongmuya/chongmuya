# 작업 원칙

- 터미널 작업은 기존 작업 폴더에서 브랜치를 만들어 진행한다. 별도 Git worktree는 Codex 앱에서 작업할 때만 사용한다.

- 커밋·브랜치·PR은 [협업 규칙](docs/CONTRIBUTING.md)을 따른다. 커밋과 PR 제목은 `type(scope): 한국어 설명`, PR 본문은 `.github/pull_request_template.md`를 기준으로 작성한다.
- 패키지 관리는 pnpm만 사용한다. 루트 `packageManager`의 버전과 `.nvmrc`를 따른다.
- 의존성은 실제 사용하는 앱에 선언한다. 루트에는 저장소 관리 도구를 둔다.
- `apps/web`은 Next.js 웹, `apps/api`는 NestJS 표준 모드 API다. 다른 앱의 소스 코드를 직접 import하지 않는다.
- 루트의 단일 `pnpm-lock.yaml`을 유지한다. npm·Yarn lockfile이나 중첩 Git 저장소를 만들지 않는다.
- 기본 검증은 루트에서 `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`를 실행한다. DB 변경 시 격리된 로컬/테스트 DB로 `pnpm test:integration`도 실행한다.
- 연결 변경은 `pnpm dev`와 웹 → API 직접 호출·CORS 응답, 브라우저의 성공·실패·복구 표시를 확인한다. 실행하지 못한 검증은 이유와 함께 보고한다.
- 실제 필요가 생기기 전 공통 패키지, 빈 업무 모듈, 과도한 추상화를 추가하지 않는다.
- Next.js와 NestJS의 TypeScript 요구사항을 각각 유지한다. 검증을 통과시키기 위한 가짜 성공 스크립트나 오류 무시는 금지한다.
- [아키텍처](docs/architecture.md)의 책임·의존 방향을 따른다. 웹은 app → features → shared, API 업무 코드는 modules 안에 둔다. common에는 기술 공통 처리만 둔다.
- 웹의 다른 feature는 명시적인 `client.ts`(훅·컴포넌트)·`types.ts`(타입) 공개 진입점으로 사용한다. 서버 전용 기능이 실제로 필요할 때만 `server.ts`와 `server-only` 경계를 추가한다. 내부 파일 직접 참조와 feature 간 순환 의존은 금지하며 서버·클라이언트 export를 한 진입점에 섞지 않는다.
- 웹 서버 상태는 TanStack Query, 폼은 React Hook Form + Zod, 단순 UI 상태는 useState로 관리한다. 기능별 API·query options/key는 api, mutation 훅은 hooks, 화면은 components, 검증은 schemas, 계약은 types, 순수 로직은 lib 폴더에 실제 필요할 때만 두고, 사용자 query key는 `user / accountId / ...` 범위를 유지한다. 저장 후 캐시 변경과 이동은 계정·화면 이탈 이후 실행되지 않도록 검증한다.
- 웹 스타일은 Tailwind 토큰과 실제 사용하는 shared UI를 사용한다. `cn`으로 className을 합치고 Devtools는 개발 환경에서만 표시한다. 하위 폴더·공용 UI·상태 라이브러리는 실제 사용처가 있을 때만 추가한다.
- API는 업무별 모듈로 구성하며 현재 책임은 아키텍처 문서의 모듈 표를 따른다. 모임 소유권은 GroupsService, 행사 소유권·생성·수정은 EventsService가 담당한다. 모임·행사·기타 일정의 creatorId는 불변이고 ownerId는 현재 관리자다. 인수인계와 모임 관리 쓰기는 실제 모임 → 행사 → 업무 자원 잠금 순서를 따른다. 행사는 필수 ownerId와 선택적 groupId를 가지며 /api/v1/events로 접근한다. 모임은 행사 생성 시 확정하고 이후 연결·변경하지 않는다. 행사 수정은 같은 트랜잭션의 행사 잠금·버전 검사를 사용한다.
- 다른 모듈은 Nest imports/exports로 공개한 Service·Guard 및 명시적 공개 타입·데코레이터를 직접 import할 수 있다. 공개 항목은 tools/eslint-boundaries.mjs의 apiPublicImports와 함께 관리한다. .module.ts 재수출, 타 모듈 내부 Repository·Entity 참조, 순환 의존과 common/config/database 실행 코드의 업무 역참조를 금지한다. 독립 실행 도구인 database/seeds는 아래 시드 경계를 따른다. 편의상 forwardRef·전역 모듈을 추가하지 않는다.
- 단순 CRUD는 Service에서 TypeORM Repository를 사용한다. 반복·복잡한 조회나 잠금만 의미 있는 Repository/QueryService로 분리한다. Service가 업무 트랜잭션을 열고, 그 안의 권한 확인·조회·저장은 같은 EntityManager를 전달받아 사용한다. BaseService·단순 위임 계층을 추가하지 않는다.
- 모듈 루트에는 Module·Controller·Service를 두고 요청·응답 DTO는 dto/request/_.request.dto.ts와 dto/response/_.response.dto.ts로 나눈다. 인증의 Guard·Strategy·Decorator·Repository·타입·순수 함수·예외도 실제 파일이 있는 역할별 폴더에 둔다. 필드 유사성만으로 다른 업무 DTO를 상속하지 않는다. 인증 사용자는 AccessGuard + @CurrentUser()로 읽고 자원 권한은 Service에서 별도 검사한다. 간단한 응답 변환은 함수로 둔다.
- 업무 오류는 명시적 DomainHttpException의 허용 코드·문구만 전달하고 DTO fieldErrors에는 안전한 필드 경로·검증 코드만 넣는다. 웹은 오류 형식·코드를 검증하고 알려진 필드는 RHF setError, 그 외는 폼 오류로 표시한다. 서버 message·validator 원문·입력을 그대로 출력하지 않는다.
- 예상한 입력·권한·중복 오류는 해당 HTTP 예외로, 알려진 DB 가용성 장애는 공통 필터에서 503으로, 그 외 코드·스키마 오류는 500으로 처리한다. 모든 예외를 503으로 감싸지 않는다. 오류 응답·인증 코드 계약을 유지하고 서버 로그에는 requestId와 허용된 오류 분류·코드·소스 위치만 남긴다. 예외 원문·원본 stack·SQL/파라미터·비밀번호·토큰·쿠키·DB URL을 기록하지 않는다.
- DB는 PostgreSQL, ORM은 TypeORM이다. Entity는 API modules/<업무>/entities/*.entity.ts, 연결 설정과 마이그레이션은 src/database에 둔다. API DTO와 Entity를 구분하고 Next.js에서 업무 DB를 직접 수정하지 않는다.
- 개발 fixture는 src/database/seeds에 두며 Entity·최소 DB 설정·명시적으로 허용한 무부작용 codec만 참조한다. 업무 Service·AppModule·외부 공급자는 실행하지 않는다. 실제 입력 JSON은 Git·빌드·이미지에서 제외하고 개발 JSON과 seed/reset 실행 코드도 운영 이미지에서 제외한다.
- 운영 데이터 import/update의 업무 규칙은 restaurants 모듈의 RestaurantDataService와 공유 검증·연락처 함수에 둔다. scripts/restaurant-data.mjs만 최소 DB 구성과 해당 서비스를 직접 조립할 수 있다. CLI는 인자·비공개 파일·안전한 출력만 처리한다. AppModule·발송기·스케줄러를 부팅하지 않으며 기본 미리보기, --execute와 실행 단위 actor/reason으로만 반영한다. 이 예외를 database/common이나 다른 업무 모듈의 Entity 직접 참조 허용으로 확대하지 않는다.
- 개발 seed/reset은 허용된 loopback 호스트·DB 이름·계정·포트와 fake 공급자 조건을 확인한다. 운영 데이터 변경은 app DB 권한, migration은 migrator 권한을 사용한다. 배포·API 시작 시 데이터 import/update를 자동 실행하지 않는다.
- API는 네이티브 ESM이다. NodeNext를 유지하고 상대 import에 .js 확장자를 쓴다. Entity와 마이그레이션은 컴파일한 JS만 로드한다. synchronize·migrationsRun·dropSchema는 false로 유지한다. 컴파일·마이그레이션 생성·적용을 구분한다. install/build/서버 시작에 마이그레이션을 자동 적용하지 않는다. 운영 DB reset/drop을 수행하지 않는다.
- DB CLI는 공통 최소 DB schema만 검증하며 런타임 환경은 이를 조합한다. 로컬 시드는 Entity와 ESLint에 명시한 무부작용 codec만 사용하고 AppModule·업무 Service·외부 공급자를 부팅하지 않는다. 공급자는 Nest 조립 지점에서 선택하고 업무 서비스에는 정규화한 결과를 전달한다.
- API 환경변수는 Zod로 시작 시 검증한다. false 문자열을 참으로 강제 변환하지 않고 오류에는 변수 이름만 노출한다. HTTP DTO 검증은 class-validator를 사용한다.
- DB 접근 전 DatabaseService.connect()를 기다린다. 초기 DB 장애에도 liveness를 제공하며 readiness는 실제 쿼리로 확인한다.
- 실제 서버와 E2E는 configureHttp를 공유한다. 요청/오류 로그에 body·인증 헤더·query·DB URL을 포함하지 않는다.
- 인증은 [인증 기준](docs/authentication.md)의 Passport JWT·HttpOnly 쿠키·Refresh 세션 정책을 따른다. 업무 API는 /api/v1이며 자원 권한은 Nest에서 별도 검증한다. 별도 요청 없이 GitHub 설정 변경, commit·push·PR을 수행하지 않는다.

## 제품 문서 참고

[정책](https://app.notion.com/p/3ec8d571d6de810ca37bfa1ba7d5e90c)·[기능 명세](https://app.notion.com/p/3ec8d571d6de816fb87ce39531e0d531)·[화면 결정](https://app.notion.com/p/3ec8d571d6de816386e1fa2b1154e5f9)·[Decision Log](https://app.notion.com/p/3ec8d571d6de81f99af7f417c0b0d228)는 제품 의도 확인용이다. [Architecture](https://app.notion.com/p/3ec8d571d6de81c7a1f9ca0b1dc083b1)·[ERD](https://app.notion.com/p/3ec8d571d6de818ba06cd91d5a75d24b)·[API 정책](https://app.notion.com/p/3ec8d571d6de814d83a3dddb49957583)은 검토할 설계 참고안이며 전체 구조를 구현하지 않는다. 제목이 같은 문서 대신 지정 URL을 읽고, 정책 변경·미구현·오래된 설명을 구분한다. 접근 실패를 명시하며 Notion 수정은 별도 요청이 있을 때만 한다.

<!-- context7 -->

Use Context7 MCP to fetch current documentation whenever the user asks about a library, framework, SDK, API, CLI tool, or cloud service — even well-known ones like React, Next.js, Prisma, Express, Tailwind, Django, or Spring Boot. This includes API syntax, configuration, version migration, library-specific debugging, setup instructions, and CLI tool usage. Use even when you think you know the answer — your training data may not reflect recent changes. Prefer this over web search for library docs.

Do not use for: refactoring, writing scripts from scratch, debugging business logic, code review, or general programming concepts.

## Steps

1. Always start with `resolve-library-id` using the library name and what to look up in the library's documentation, unless the user provides an exact library ID in `/org/project` format
2. Pick the best match (ID format: `/org/project`) by: exact name match, description relevance, code snippet count, source reputation (High/Medium preferred), and benchmark score (higher is better). If results don't look right, try alternate names or queries (e.g., "next.js" not "nextjs", or rephrase the question). Use version-specific IDs when the user mentions a version
3. `query-docs` with the selected library ID and what to look up in the library's documentation (not single words), scoped to a single concept. If the question spans multiple distinct concepts (e.g. routing and auth and caching), make a separate `query-docs` call per concept with the same library ID, unless the question is about how the concepts interact — combined queries dilute ranking and return shallow results for each topic
4. Answer using the fetched docs

<!-- context7 -->

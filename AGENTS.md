# 작업 원칙

- 커밋·브랜치·PR은 [협업 규칙](docs/CONTRIBUTING.md)을 따른다. 커밋과 PR 제목은 `type(scope): 한국어 설명`, PR 본문은 `.github/pull_request_template.md`를 기준으로 작성한다.
- 패키지 관리는 pnpm만 사용한다. 루트 `packageManager`의 버전과 `.nvmrc`를 따른다.
- 의존성은 실제 사용하는 앱에 선언한다. 루트에는 저장소 관리 도구를 둔다.
- `apps/web`은 Next.js 웹, `apps/api`는 NestJS 표준 모드 API다. 다른 앱의 소스 코드를 직접 import하지 않는다.
- 루트의 단일 `pnpm-lock.yaml`을 유지한다. npm·Yarn lockfile이나 중첩 Git 저장소를 만들지 않는다.
- 기본 검증은 루트에서 `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`를 실행한다. DB 변경 시 격리된 로컬/테스트 DB로 `pnpm test:integration`도 실행한다.
- 연결 변경은 `pnpm dev`와 실제 API·rewrite 응답, 브라우저의 성공·실패·복구 표시를 확인한다. 실행하지 못한 검증은 이유와 함께 보고한다.
- 실제 필요가 생기기 전 공통 패키지, 빈 업무 모듈, 과도한 추상화를 추가하지 않는다.
- Next.js와 NestJS의 TypeScript 요구사항을 각각 유지한다. 검증을 통과시키기 위한 가짜 성공 스크립트나 오류 무시는 금지한다.
- [아키텍처](docs/architecture.md)의 책임·의존 방향을 따른다. 웹은 app → features → shared, API 업무 코드는 modules 안에 둔다. common에는 기술 공통 처리만 둔다.
- DB는 PostgreSQL, ORM은 TypeORM이다. Entity는 API modules/<업무>/*.entity.ts, 연결 설정과 마이그레이션은 src/database에 둔다. API DTO와 Entity를 구분하고 Next.js에서 업무 DB를 직접 수정하지 않는다.
- API는 네이티브 ESM이다. NodeNext를 유지하고 상대 import에 .js 확장자를 쓴다. Entity와 마이그레이션은 컴파일한 JS만 로드한다. synchronize·migrationsRun·dropSchema는 false로 유지한다. 컴파일·마이그레이션 생성·적용을 구분한다. install/build/서버 시작에 마이그레이션을 자동 적용하지 않는다. 운영 DB reset/drop을 수행하지 않는다.
- API 환경변수는 Zod로 시작 시 검증한다. false 문자열을 참으로 강제 변환하지 않고 오류에는 변수 이름만 노출한다. HTTP DTO 검증은 class-validator를 사용한다.
- DB 접근 전 DatabaseService.connect()를 기다린다. 초기 DB 장애에도 liveness를 제공하며 readiness는 실제 쿼리로 확인한다.
- 실제 서버와 E2E는 configureHttp를 공유한다. 요청/오류 로그에 body·인증 헤더·query·DB URL을 포함하지 않는다.
- 인증은 [인증 기준](docs/authentication.md)의 Passport JWT·HttpOnly 쿠키·Refresh 세션 정책을 따른다. 업무 API는 /api/v1이며 자원 권한은 Nest에서 별도 검증한다. 게스트 링크는 미정이다. worker·큐·파일 저장소·배포는 후속 작업이다. 별도 요청 없이 GitHub 설정 변경, commit·push·PR을 수행하지 않는다.

<!-- context7 -->

Use Context7 MCP to fetch current documentation whenever the user asks about a library, framework, SDK, API, CLI tool, or cloud service — even well-known ones like React, Next.js, Prisma, Express, Tailwind, Django, or Spring Boot. This includes API syntax, configuration, version migration, library-specific debugging, setup instructions, and CLI tool usage. Use even when you think you know the answer — your training data may not reflect recent changes. Prefer this over web search for library docs.

Do not use for: refactoring, writing scripts from scratch, debugging business logic, code review, or general programming concepts.

## Steps

1. Always start with `resolve-library-id` using the library name and what to look up in the library's documentation, unless the user provides an exact library ID in `/org/project` format
2. Pick the best match (ID format: `/org/project`) by: exact name match, description relevance, code snippet count, source reputation (High/Medium preferred), and benchmark score (higher is better). If results don't look right, try alternate names or queries (e.g., "next.js" not "nextjs", or rephrase the question). Use version-specific IDs when the user mentions a version
3. `query-docs` with the selected library ID and what to look up in the library's documentation (not single words), scoped to a single concept. If the question spans multiple distinct concepts (e.g. routing and auth and caching), make a separate `query-docs` call per concept with the same library ID, unless the question is about how the concepts interact — combined queries dilute ranking and return shallow results for each topic
4. Answer using the fetched docs

<!-- context7 -->

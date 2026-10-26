# 작업 원칙

- 패키지 관리는 pnpm만 사용한다. 루트 `packageManager`의 버전과 `.nvmrc`를 따른다.
- 의존성은 실제 사용하는 앱에 선언한다. 루트에는 저장소 관리 도구를 둔다.
- `apps/web`은 Next.js 웹, `apps/api`는 NestJS 표준 모드 API다. 다른 앱의 소스 코드를 직접 import하지 않는다.
- 루트의 단일 `pnpm-lock.yaml`을 유지한다. npm·Yarn lockfile이나 중첩 Git 저장소를 만들지 않는다.
- 기본 검증은 루트에서 `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm build`를 실행한다.
- 연결 변경은 `pnpm dev`와 실제 API·rewrite 응답, 브라우저의 성공·실패·복구 표시를 확인한다. 실행하지 못한 검증은 이유와 함께 보고한다.
- 실제 필요가 생기기 전 공통 패키지, 빈 업무 모듈, 과도한 추상화를 추가하지 않는다.
- Next.js와 NestJS의 TypeScript 요구사항을 각각 유지한다. 검증을 통과시키기 위한 가짜 성공 스크립트나 오류 무시는 금지한다.
- DB·인증·배포 방식은 아직 결정되지 않았다. 별도 요청 없이 GitHub 설정 변경, commit·push·PR을 수행하지 않는다.

<!-- context7 -->
Use Context7 MCP to fetch current documentation whenever the user asks about a library, framework, SDK, API, CLI tool, or cloud service — even well-known ones like React, Next.js, Prisma, Express, Tailwind, Django, or Spring Boot. This includes API syntax, configuration, version migration, library-specific debugging, setup instructions, and CLI tool usage. Use even when you think you know the answer — your training data may not reflect recent changes. Prefer this over web search for library docs.

Do not use for: refactoring, writing scripts from scratch, debugging business logic, code review, or general programming concepts.

## Steps

1. Always start with `resolve-library-id` using the library name and what to look up in the library's documentation, unless the user provides an exact library ID in `/org/project` format
2. Pick the best match (ID format: `/org/project`) by: exact name match, description relevance, code snippet count, source reputation (High/Medium preferred), and benchmark score (higher is better). If results don't look right, try alternate names or queries (e.g., "next.js" not "nextjs", or rephrase the question). Use version-specific IDs when the user mentions a version
3. `query-docs` with the selected library ID and what to look up in the library's documentation (not single words), scoped to a single concept. If the question spans multiple distinct concepts (e.g. routing and auth and caching), make a separate `query-docs` call per concept with the same library ID, unless the question is about how the concepts interact — combined queries dilute ranking and return shallow results for each topic
4. Answer using the fetched docs
<!-- context7 -->

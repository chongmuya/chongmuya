# 프론트엔드 작업 기준

- `app`은 App Router의 라우트·레이아웃·Provider·페이지 조합만 담당한다. 업무 조회·저장·선택 규칙과 폼은 `features`에 둔다.
- feature 내부는 역할별 `api/`, `components/`, `hooks/`, `schemas/`, `types/`, `lib/` 폴더를 사용한다. API 함수와 query key/options는 api, mutation 훅은 hooks, 폼과 화면은 components, 입력 검증은 schemas, 데이터 계약은 types, React와 무관한 로직은 lib에 둔다. 실제 파일이 없는 폴더는 만들지 않는다.
- app과 다른 feature에서는 `features/<name>/client`의 명시적 export와 `features/<name>/types`의 타입을 사용한다. 내부에서는 상대 import를 사용하며 자신의 공개 진입점을 다시 import하지 않는다. feature 간 순환 참조(타입 의존 포함)는 ESLint가 차단한다.
- `client.ts`는 `use client`가 있는 클라이언트 공개 진입점이고 `types.ts`는 타입만 공개한다. 서버 전용 기능이 필요해지면 `server.ts`에 `server-only`를 선언한다. 공통 index로 두 환경을 합치지 않는다. shared → features/app, features → app, 앱 간 소스 참조 금지는 유지한다.
- 서버 상태는 Query, 폼 상태·검증은 React Hook Form + Zod, 탭 같은 단순 상태는 useState를 사용한다. API는 인증 세션의 request 함수를 통해 호출하고 SessionClient의 갱신·로그아웃 동작을 우회하지 않는다.
- query key는 사용자 ID와 자원 ID를 포함한다. 현재 업무 query는 `staleTime: 0`, 자동 재시도 없음, 마운트·포커스·재연결 시 재조회다. 다른 자원의 query 데이터를 placeholder로 재사용하지 않는다. 최초 조회 오류는 오류 화면으로, 기존 데이터가 있는 일시 오류는 편집기를 유지한 채 안내한다. 권한 상실은 쓰기를 차단하고 계정·자원 전환 시 이전 데이터를 노출하지 않는다. mutation은 자동 재시도하지 않는다.
- 개인 행사는 모임 없이 생성·조회한다. 상세 query key는 행사 ID로 식별하고 모임 선택에 종속시키지 않는다. 생성·모임 연결 후 내 행사·해당 모임 목록과 상세를 갱신한다. 모임 조회 실패가 개인 행사 조회·생성을 막지 않게 한다.
- 로그인 복귀 경로는 auth의 safeReturnPath를 통과한 내부 페이지·UUID query만 사용한다. 업무 오류 응답을 검증하고 허용한 필드만 RHF 오류에 연결한다.
- 계정·업무 자원 변경 시 화면 key를 바꿔 폼과 mutation observer를 분리한다. 같은 문의 흐름의 페이지 전환에서는 편집값·선택·요청 키를 유지한다. 늦은 저장 응답으로 이전 사용자 캐시나 페이지 이동을 복원하지 않는다. 관련 DOM·세션 회귀 테스트를 함께 유지한다.
- 색상·간격 등 기본 스타일은 `app/globals.css`의 Tailwind 토큰과 shared UI를 사용한다. 공용 Button 기본 type은 button이므로 폼 저장 버튼은 submit을 명시한다. 입력 오류는 label·aria-invalid·aria-describedby로 연결한다.
- QueryClient와 SessionClient는 Provider 인스턴스에 둔다. 브라우저 토큰 저장소, 전역 사용자 singleton, Zustand·Axios를 임의 도입하지 않는다. 개발 Devtools와 mutation 변수에 비밀번호를 남기지 않는다.
- 검증 명령은 루트 AGENTS.md를 따른다. DOM 테스트는 실제 브라우저·모바일 시각 검수를 대체하지 않는다.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

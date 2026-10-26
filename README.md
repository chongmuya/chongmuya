# 총무야 (chongmuya)

총무야는 대학 모임의 예약·참석·정산을 관리하는 모바일 우선 반응형 웹앱입니다. 현재는 Next.js 웹과 NestJS API를 함께 개발할 수 있는 기반과 실제 API 연결 확인 화면만 제공합니다. DB·인증·배포 방식과 UI/UX는 아직 결정하지 않았습니다.

## 필요한 버전

- Node.js **24.15.0** (24 LTS): `.nvmrc`, `package.json`의 `engines`에 명시합니다.
- pnpm **11.25.0**: 루트 `packageManager`에 정확한 버전을 고정합니다.
- Turborepo 2.11.10, Next.js 16.4.3, React 19.3.1, NestJS 12.2.0, Nest CLI 12.0.10, TypeScript 5.9.3, ESLint 9.39.5.

각 도구의 안정 버전과 Node·peer dependency 범위를 확인해 선택했습니다. TypeScript는 린트 도구 지원 범위에 맞췄습니다. [Node LTS](https://nodejs.org/en/about/previous-releases), [pnpm 설치](https://pnpm.io/installation), [Next.js CLI](https://nextjs.org/docs/app/api-reference/cli/next), [Nest CLI](https://docs.nestjs.com/cli/overview)를 참고하세요.

이미 맞는 버전이 설치되어 있으면 아래 설치·실행으로 진행하세요. nvm 사용자는 `nvm install`과 `nvm use`로 이 저장소의 Node 버전을 선택할 수 있습니다. pnpm이 없는 환경에서는 기존 Corepack이 있다면 `corepack pnpm`으로 프로젝트에 고정된 버전을 실행할 수 있습니다. 전역 도구 변경 없이 일회성으로 실행하려면 `npx --yes pnpm@11.25.0 install`, `npx --yes pnpm@11.25.0 dev`도 가능합니다.

## 설치와 실행

저장소 루트에서 실행합니다.

```bash
node --version
pnpm --version
pnpm install
pnpm dev
```

- 웹: <http://localhost:3000>
- API: <http://localhost:3001/health>
- 웹을 통한 API: <http://localhost:3000/api/health>

기본값으로 실행할 때는 환경변수 파일이 필요하지 않습니다. 웹은 브라우저에서 `/api/health`를 요청하고, Next.js rewrite가 API의 `/health`로 전달합니다. 정상 응답은 `{"status":"ok","service":"chongmuya-api"}`입니다. 페이지는 5초마다 연결을 확인하며 요청이 3초를 넘거나 API가 응답하지 않으면 실패를 표시합니다. API를 다시 실행하면 자동으로 복구됩니다. `Ctrl+C`로 개발 서버를 종료합니다.

### 환경변수

API 주소를 변경할 때만 다음 파일을 복사합니다.

```bash
cp apps/web/.env.example apps/web/.env.local
```

| 변수 | 읽는 곳 | 기본값 | 용도 |
| --- | --- | --- | --- |
| `API_URL` | Next.js 서버 설정 | `http://127.0.0.1:3001` | API 원점 주소 |
| `API_PORT` | NestJS 실행 프로세스 | `3001` | API 수신 포트 |

`API_URL`에는 서버용 주소를 사용하며 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다. 브라우저는 API 주소 대신 웹의 상대 경로만 요청하므로 CORS 설정이 필요하지 않습니다. `.env.local` 변경 후 웹 개발 서버를 재시작하세요. 프로덕션 rewrite는 빌드 결과에 포함되므로 `pnpm build`를 다시 실행해야 합니다.

API는 환경변수 파일을 자동으로 읽지 않습니다. 포트 변경은 셸 환경변수로 전달합니다. 예를 들어 macOS/Linux에서는 `API_PORT=3002 API_URL=http://127.0.0.1:3002 pnpm dev`로 두 값을 함께 바꿀 수 있습니다. 웹 포트는 3000으로 고정하며 포트가 사용 중이면 기존 프로세스를 확인하세요.

## 폴더와 도구 역할

```text
apps/
  web/  # @chongmuya/web: Next.js App Router, 화면과 API rewrite
  api/  # @chongmuya/api: NestJS 표준 프로젝트, 기본 Express 어댑터
```

**pnpm workspace**는 두 앱의 의존성을 한 번에 설치하고, 루트 `pnpm-lock.yaml` 하나로 버전을 재현합니다. 의존성은 사용하는 앱에 선언합니다. 예: `pnpm --filter @chongmuya/web add <패키지>`.

pnpm 11은 의존성의 설치 스크립트를 기본 차단합니다. `pnpm-workspace.yaml`의 `allowBuilds`에는 Next.js 린트가 사용하는 네이티브 resolver의 확인된 버전만 허용했습니다. 새 패키지가 설치 스크립트를 요구하면 내용을 확인한 뒤 개별 허용하세요.

**Turborepo**는 각 앱의 스크립트를 루트에서 함께 실행하고 빌드 결과를 캐시합니다. 앱을 설치하거나 서버를 구현하는 도구는 아닙니다. `dev`는 종료되지 않는 작업이므로 persistent이며 캐시하지 않습니다. 웹 빌드의 `.next` 출력(내부 캐시·개발 출력 제외)과 API의 `dist`를 캐시하고, `API_URL`·환경변수 파일 변경을 웹 빌드 캐시에 반영합니다. Next.js의 **Turbopack**은 웹 내부 번들러로, Turborepo와 역할이 다릅니다.

Next.js와 NestJS의 TypeScript 설정은 각각 유지합니다. 웹 타입 검사는 `next typegen`으로 라우트 타입을 만든 뒤 수행하므로 첫 빌드 전에도 실행할 수 있습니다. 린트는 두 앱 모두 ESLint CLI를 사용합니다.

## 주요 명령

| 루트에서 실행 | 내용 |
| --- | --- |
| `pnpm dev` | 웹·API 개발 서버 동시 실행 |
| `pnpm build` | 두 앱 빌드 |
| `pnpm lint` | 두 앱 린트, 자동 수정 없음 |
| `pnpm typecheck` | 두 앱 타입 검사 |
| `pnpm --filter @chongmuya/web dev` | 웹만 실행 |
| `pnpm --filter @chongmuya/api dev` | API만 실행 |
| `pnpm install --frozen-lockfile` | lockfile 변경 없이 설치 |

빌드 후에는 각각 별도 터미널에서 `pnpm --filter @chongmuya/web start`, `pnpm --filter @chongmuya/api start`로 실행할 수 있습니다.

## 연결 검증

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
pnpm dev
```

다른 터미널에서 `curl -i http://localhost:3001/health`와 `curl -i http://localhost:3000/api/health`의 HTTP 200 및 JSON 응답을 확인하고, 브라우저에서 “API 연결 성공”을 확인합니다.

실패·복구 검증은 동시 실행을 종료한 뒤 웹만 실행해 “API 연결 실패”를 확인하고, 다른 터미널에서 API를 실행해 성공으로 바뀌는지 확인합니다. DB를 검사하거나 API 장애를 가짜 성공으로 대체하지 않습니다.

## 협업 규칙

[커밋·브랜치·PR 작성 가이드](docs/CONTRIBUTING.md)를 따릅니다. 커밋과 PR 제목은 `type(scope): 한국어 설명` 형식이며, PR 본문은 [템플릿](.github/pull_request_template.md)의 변경 내용·확인 방법·관련 이슈를 작성합니다.

## 다음 단계

UI/UX와 업무 요구사항을 정리한 뒤 예약·참석·정산 기능을 구현합니다. DB·인증·배포 방식, OpenAPI·API 클라이언트, CI 구성은 후속 결정 사항입니다. 현재 공유 패키지나 빈 업무 모듈은 만들지 않았습니다.

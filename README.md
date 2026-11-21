# 총무야 (chongmuya)

개인·모임 행사, 참석, 매장 문의·예약, 지출·정산·증빙을 관리하는 웹앱입니다. 캘린더·알림함·모임 관리와 사장님 매장 관리도 제공합니다. 파일럿에서는 신규 인수인계 요청과 수락을 보류합니다. 모임 없이 개인 행사를 사용할 수 있습니다.

## 로컬 시작

Node와 pnpm 버전은 [.nvmrc](.nvmrc)와 [package.json](package.json)의 `packageManager`를 사용합니다. 로컬 PostgreSQL에는 Docker가 필요합니다. 기존 `.env`는 덮어쓰지 마세요.

```sh
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
pnpm db:up
```

`apps/api/.env`의 `AUTH_SECRET`을 32자 이상의 임의 값으로 바꾸고 `DATABASE_URL`, `WEB_ORIGIN=http://localhost:3000`을 확인합니다. 로컬은 `MESSAGE_PROVIDER=fake`, `GEOCODING_PROVIDER=fake`를 사용합니다. 실제 인증을 연결하지 않을 때는 예제의 Octomo·카카오·Resend 설정을 제거하거나 주석 처리하고 demo 계정으로 로그인하세요. 카카오 설정 3개와 이메일 발송 설정 3개는 각각 함께 설정하거나 함께 생략합니다. 자세한 조건은 [인증 설정](docs/authentication.md#외부-인증-설정)에 있습니다.

```sh
pnpm --filter @chongmuya/api build
pnpm --filter @chongmuya/api db:migration:run
pnpm db:seed
pnpm dev
```

개발 데이터는 가짜 JSON과 demo 시나리오로 생성합니다. 계정·비밀번호·링크와 초기화 방법은 [매장 데이터 관리](docs/restaurant-data.md#로컬-준비)를 참고하세요. `pnpm db:reset`은 허용된 로컬 DB의 기존 데이터를 모두 삭제한 뒤 migration과 seed를 실행합니다. `pnpm db:down`은 컨테이너만 종료하고 데이터를 보존합니다.

| 주소                                  | 용도                                                                |
| ------------------------------------- | ------------------------------------------------------------------- |
| <http://localhost:3000>               | 시작 화면·총무 홈; 사장님은 `/owner`                                |
| <http://localhost:3000/events>        | 개인 행사 생성; `?group=<UUID>`는 모임 행사, `?event=<UUID>`는 상세 |
| <http://localhost:3000/calendar>      | 행사·기타 일정, 사장님 매장 일정                                    |
| <http://localhost:3000/notifications> | 알림함                                                              |
| <http://localhost:3000/mypage>        | 프로필·모임 관리·기존 인수인계 요청 확인 및 취소                    |
| <http://localhost:3001/health>        | DB와 독립된 liveness                                                |
| <http://localhost:3001/ready>         | 실제 DB 연결 확인                                                   |
| <http://localhost:3001/docs>          | 개발용 Swagger                                                      |

웹은 `NEXT_PUBLIC_API_ORIGIN`의 API를 직접 호출합니다. 개발 기본값은 `http://localhost:3001`이며 웹/API 호스트를 `localhost`로 통일합니다. 운영 웹 빌드에는 이 변수가 필수이고 변경 시 재빌드해야 합니다. 비밀값은 `NEXT_PUBLIC_*`에 넣지 않습니다.

## 구조와 명령

- `apps/web`: Next.js App Router, React, TanStack Query, React Hook Form + Zod, Tailwind. 의존 방향은 `app → features → shared`입니다.
- `apps/api`: NestJS 모듈형 모놀리스, Passport JWT, TypeORM/PostgreSQL, 네이티브 ESM. 업무 코드는 `src/modules`, migration은 `src/database/migrations`에 둡니다.
- `infra`: 운영 API Compose·배포/롤백·일회성 도구·Nginx 템플릿. 루트 `compose.yaml`은 로컬 DB용입니다.

| 명령                                                   | 역할                                  |
| ------------------------------------------------------ | ------------------------------------- |
| `pnpm dev` / `pnpm build`                              | 웹·API 실행 / 빌드                    |
| `pnpm db:up` / `pnpm db:down` / `pnpm db:logs`         | 로컬 DB 실행 / 종료 / 로그            |
| `pnpm db:seed` / `pnpm db:reset`                       | 개발 데이터 생성 / 로컬 데이터 초기화 |
| `pnpm --filter @chongmuya/api data:restaurants --help` | 매장 등록·부분 수정·메뉴 가격 관리    |
| `pnpm format` / `pnpm format:check`                    | 포맷 적용 / 검사                      |
| `pnpm lint` / `pnpm typecheck`                         | 의존 경계·린트 / 타입 검사            |
| `pnpm test`                                            | 저장소 규칙·API·웹 테스트             |
| `pnpm test:integration`                                | 격리 PostgreSQL 통합 테스트           |

앱 변경의 기본 검증은 frozen install → lint → typecheck → build → test입니다. DB 변경은 `TEST_DATABASE_URL`에 **전용 격리 DB**를 지정해 통합 테스트도 실행합니다. 운영 DB나 개발 중인 데이터가 있는 DB를 테스트 대상으로 사용하지 않습니다. 문서만 바꾸면 포맷·링크·실제 코드와의 일치 여부를 확인합니다.

## 문서

| 문서                                    | 다루는 내용                                                    |
| --------------------------------------- | -------------------------------------------------------------- |
| [아키텍처](docs/architecture.md)        | 책임·의존 경계, 권한·트랜잭션, 업무 불변 조건                  |
| [인증](docs/authentication.md)          | 쿠키·CSRF·세션, 가입·복구·외부 인증 설정                       |
| [회원 탈퇴](docs/account-withdrawal.md) | 탈퇴 차단 기준, 접수 검토, 카카오 연결 해제                    |
| [매장 데이터](docs/restaurant-data.md)  | 개발 seed/reset, 비공개 JSON import/update, 메뉴 가격·EC2 실행 |
| [운영](docs/operations.md)              | 배포 순서, 문자·예약 복구, 파일 저장소, 리마인더               |
| [협업](docs/CONTRIBUTING.md)            | 브랜치·커밋·PR·검증·병합                                       |

화면 원본은 [Figma](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS), 제품 문서 링크는 [AGENTS.md](AGENTS.md#제품-문서-참고)에 모아 둡니다.

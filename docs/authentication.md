# 인증과 개발 기준

2026-10-31 인증 리뷰 보완 기준. 모임 온보딩 → 행사 → 예약 → 참석·정산 순서로 확장한다. 계정 가입은 모임 생성·구성원 등록·온보딩 완료와 별개다. `accounts`에 모임 ID나 온보딩 완료 boolean을 넣지 않았다. `/onboarding`은 가입 완료 안내만 제공한다. 2026-10-31 다음 단계 정책: 최초 모임 생성은 필수로 하고 입력 필드는 최소화한다(모임 이름만 필수로 시작하는 안). 마이페이지에는 모임 정보 수정과 관리할 모임 전환을 구분해 제공한다. 이 PR에는 모임 생성·수정·전환이나 온보딩 강제 접근 제한을 구현하지 않았다.

## 책임

- 웹 `app`: 라우팅·Provider 조립. `features/auth`: 인증 API 조정, 세션 상태, 사용자 Query, 화면. `shared/http`: 업무를 모르는 HTTP 전송과 안전한 오류. shared → features 역참조 금지.
- Nest `AuthController`: HTTP DTO·쿠키·응답. `JwtAccessStrategy`: 쿠키 JWT 추출, 서명·알고리즘·issuer·audience·만료 검증, 필수 claim 검사, 현재 세션과 계정으로 인증 사용자 구성. `AccessGuard`: 인증 필수 요청, `OptionalAccessGuard`: 최초 복원에서 비회원 허용. `AuthService`: 가입·로그인·토큰 발급·세션 rotation/폐기. `AuthRepository`: 연결 대기·DB 오류 경계·원자적 시도 제한.
- Controller는 Entity를 반환하지 않는다. `AccountDto`는 id/email만 노출한다. 비밀번호·Refresh·JWT를 JSON이나 로그에 넣지 않는다.
- 인증과 자원 권한은 별개다. `/auth/me`는 검증된 `request.user`만 반환하고 사용자 ID 입력을 받지 않는다. JWT sub와 세션 accountId 일치를 확인한다. 이후 모임·행사 Service는 인증 계정의 소유/멤버십을 해당 자원 조회 조건으로 별도 검증해야 한다. 아직 없는 자원에 가짜 role/권한 모듈을 만들지 않는다.
- 업무 API는 웹/Nest 모두 `/api/v1`. Next rewrite는 동일 경로를 전달한다. 운영 확인용 `/health`, `/ready`, `/docs`와 기존 `/api/health`는 업무 API 밖에 유지한다.

## 패키지 선택

Nest 12.2.0에서 `@nestjs/passport 12.0.0` (Nest 11/12 지원), `@nestjs/jwt 12.0.3` (Nest 8~12 지원), `passport 0.7.0`, `passport-jwt 4.0.1`을 사용한다. 2026-10-30 npm peerDependencies 및 실제 타입·실행 테스트로 확인한다. API 네이티브 ESM/NodeNext와 `.js` 상대 import를 유지한다. jose는 직접 의존성으로 사용하지 않는다.

## 토큰·쿠키·CSRF

Access JWT는 5분, Refresh 세션은 로그인부터 절대 14일이다. Refresh는 JWT가 아닌 32바이트 난수이며 SHA-256 해시만 DB에 저장한다. 고엔트로피 토큰의 해시와 비밀번호 해시는 목적이 다르다. 비밀번호는 salt 16바이트, scrypt N=32768/r=8/p=3, 64바이트 결과를 버전과 함께 저장하고 constant-time으로 비교한다. 비밀번호는 12~128자, 이메일은 trim/lowercase 후 최대 254자이며 DB unique 제약으로 중복 가입을 막는다.

Access/Refresh 모두 HttpOnly, SameSite=Lax, Path=/, Domain 생략. production에서는 Secure 및 `__Host-access`/`__Host-refresh`; 로컬 HTTP에서는 `access`/`refresh`다. 삭제 시에도 같은 옵션을 사용한다. production WEB_ORIGIN은 HTTPS만 허용한다. AUTH_SECRET은 최소 32자이고 운영에서는 암호학적 난수로 생성한다. 환경 오류에는 변수 이름만 노출한다.

Access 메모리 방식 대신 쿠키를 선택했다. Next Server Component에서 `await cookies()`로 요청별 Access 쿠키를 읽고 Nest로 전달할 수 있고, 새로고침마다 JS 메모리를 복원할 필요가 없다. Next가 JWT 서명/업무 권한을 중복 판단하지 않는다. 향후 서버 데이터 조회는 필요한 쿠키만 전달하고 `cache: no-store`를 사용해야 한다. Server Component 렌더 중 Refresh rotation은 하지 않는다. Set-Cookie를 브라우저에 전달할 수 있는 브라우저 요청/Route Handler 경계에서 갱신한다. 현재 화면은 Client에서 복원하며 SSR 보호 페이지는 아직 없다.

쿠키 선택은 Passport와 독립이다. 전역 CSRF Guard가 GET/HEAD/OPTIONS 외 요청에 정확한 `Origin === WEB_ORIGIN`과 `X-CSRF-Protection: 1`을 요구하고 cross-site Fetch Metadata를 거부한다. 로그인/가입/복원/갱신/로그아웃 모두 적용한다. Origin 없는 변경 요청도 거부한다. CORS를 열지 않고 동일 출처 Next rewrite를 사용한다. 전용 헤더를 임의 사이트에서 추가하려면 preflight가 필요하므로 허용하지 않는 CORS와 Origin 검증을 함께 유지해야 한다. GET은 상태를 변경하지 않는다. Swagger/CLI POST에도 두 헤더가 필요하다.

## 세션 저장과 경쟁 조건

`accounts` → `auth_sessions` → `refresh_tokens` 구조이며 로그인마다 독립 세션을 만든다. 각 토큰의 사용 시각을 남겨 과거 토큰 재사용을 탐지한다. 현재 기기의 로그아웃은 해당 세션만 폐기한다.

가입 즉시 로그인되므로 신규 계정·세션·최초 Refresh 해시 삽입과 Access 서명은 한 DB 트랜잭션에서 완료한다. 세션/Refresh 저장 또는 서명이 실패하면 계정까지 롤백하고 쿠키를 보내지 않는다. 비밀번호 해싱은 트랜잭션 밖에서 수행해 DB 연결을 오래 점유하지 않는다. 이메일 중복은 DB unique 제약과 insert 충돌 처리로 409를 반환하며, 동시 가입도 하나의 계정·세션·Refresh만 남긴다. 로그인 시도 제한 기록은 보안상 실패한 가입 트랜잭션과 별개로 유지한다.

갱신은 트랜잭션에서 **세션 행 잠금** → 토큰 재조회 → 기존 토큰 사용 처리 → 새 토큰 해시 삽입 순서다. 사용된 토큰이 다시 들어오면 전체 세션을 폐기하고, 폐기 트랜잭션을 커밋한 뒤 401을 반환한다. 로그아웃도 같은 세션 잠금을 사용하며 과거 토큰으로도 그 세션을 폐기할 수 있다. Access 검증마다 세션 활성 상태를 확인하므로 JWT의 남은 수명과 무관하게 폐기가 반영된다.

재사용은 엄격하게 거부한다. 같은 Refresh를 직접 동시에 보내면 하나만 성공하고 재사용 요청이 세션을 폐기한다. 정상 웹은 single-flight와 탭 간 Web Locks로 이를 예방한다. Web Locks가 없는 브라우저에서는 탭 내 중복 방지만 가능하다. 갱신 결과가 네트워크에서 유실된 뒤 옛 토큰을 다시 쓰는 경우에도 세션 폐기로 이어질 수 있어 재로그인이 필요하다. 일시 장애 자체를 클라이언트가 세션 무효화로 해석하지는 않는다.

시도 제한은 DB upsert로 15분 고정 창 동안 이메일당 10회, 직접 연결 IP당 50회(가입·로그인 합산)를 적용한다. 알 수 없는 계정도 동일 비용의 비밀번호 연산을 수행한다. `trust proxy`를 켜지 않아 임의 X-Forwarded-For로 제한을 우회하지 못한다. 실제 프록시 배포 시 신뢰할 프록시 목록과 IP 집계를 확정해야 한다. 현재 Next 프록시 요청은 같은 IP 제한을 공유하므로 운영 배포 전 조정 항목이다.

만료 세션과 사용된 Refresh 이력은 만료 전 삭제하지 않는다. 운영 전 만료 세션(자식 토큰 cascade)과 오래된 시도 제한 행을 정리하는 보존·청소 작업을 추가해야 한다. 아직 worker/큐/운영 배포를 추가하지 않았다.

### 배포 전 IP 제한 설정

배포 경로가 확정되지 않았으므로 `trust proxy`는 기본 false를 유지한다. Next rewrite를 거친 요청은 Nest에서 Next 서버의 소켓 IP로 집계되어 사용자들이 IP 제한을 공유할 수 있다. 헤더를 그대로 읽거나 `trust proxy: true`를 켜서 우회하지 않는다. 배포를 확정할 때 다음 항목을 함께 검증한다.

1. 클라이언트 → CDN/LB → Next → Nest의 실제 경로, 우회 경로, 각 홉의 주소와 변경 범위를 확정한다. Nest 직접 접근은 신뢰한 프록시로 제한한다.
2. 외부 경계에서 클라이언트가 임의로 보낸 X-Forwarded-For/Host/Proto를 제거·덮어쓰고, Next를 포함한 각 홉이 검증된 체인을 어떻게 전달하는지 확인한다. 임의 X-Forwarded-For를 붙여도 사용자 IP를 바꿀 수 없어야 한다.
3. Nest에서 신뢰할 주소/CIDR 범위를 최소한으로 지정하는 안을 배포 구성에 맞게 선택한다. 경로 길이가 달라질 수 있으면 고정 홉 수나 모든 프록시 신뢰를 사용하지 않는다. 실제 경로에서 서로 다른 클라이언트가 서로 다른 제한 키를 갖는지 검증한다.
4. 프록시 우회·헤더 위조·IPv4/IPv6·여러 Next/API 인스턴스·공유 NAT 환경을 검증하고 IP 제한 수치를 조정한다. 이메일 제한과 DB 원자 집계는 유지한다. 이 설정은 배포 구성과 함께 변경하며 이번 리뷰에서 임의 활성화하지 않는다.

근거: [Express 5 프록시 설정](https://expressjs.com/en/5x/guide/behind-proxies/). 현재 통합 테스트는 위조 X-Forwarded-For가 제한 IP로 채택되지 않는 것까지 확인한다.

## 프론트 생명주기

- 최초 `POST /session/restore`: 유효 Access는 그대로 사용, 없거나 만료되면 Refresh를 회전한다. 세션 없음/무효는 200 `{ authenticated:false, account:null }`. DB/통신 장애는 확인 불가 상태이며 비회원으로 단정하지 않는다.
- 인증 요청: `ACCESS_EXPIRED`만 갱신 대상. 한 Provider의 Promise를 공유하고 같은 출처 탭 간 Web Lock을 사용한다. 잠금을 얻은 뒤 `/me`를 재확인하여 다른 탭이 이미 갱신한 경우 추가 rotation을 피한다. 늦게 도착한 만료 응답은 revision으로 구분한다. 원 요청은 같은 계정일 때만 한 번 재시도한다. `/me` 또는 `/refresh`에서 확인한 계정을 먼저 현재 상태에 반영한다. 계정 ID가 바뀌면 generation을 올리고 사용자 캐시를 정리하므로 이전 계정에서 시작한 모든 대기 요청은 자동 재시도하지 않는다. 새 계정은 로그인 상태로 유지하며, 이전 요청의 종료 오류가 새 세션을 무효화하지 않는다. 갱신 중 로그아웃/다른 복원이 발생했다면 늦은 응답도 반영하지 않는다.
- `SESSION_INVALID`: 사용자 캐시 취소·삭제와 세션 종료. 네트워크/타임아웃/5xx는 로그인 정보를 보존하고 재시도 UI를 제공한다. 403은 권한 실패이며 갱신하지 않는다.
- 로그아웃: generation을 올리고 사용자 캐시를 즉시 정리하며 진행 중 복원/갱신을 기다린 뒤 서버 폐기 요청을 보낸다. 오래된 요청은 결과를 적용하지 못한다. 실패하면 `logout-failed` 상태로 남아 **로그아웃 다시 시도**만 제공하고 자동 복원을 막는다. 동작하지 않는 연결 재확인 버튼은 표시하지 않는다. 일반 복원 통신 장애는 `unavailable` 상태에서 **연결 재확인**으로 세션 복원을 다시 요청한다. `logging-out`은 진행 표시만 제공한다.
- `user`로 시작하는 Query key는 사용자 전용이다. 해당 Query를 취소·삭제하고 mutation cache도 정리한다. health 같은 공개 Query는 유지한다. 로그인·로그아웃은 BroadcastChannel로 다른 탭의 재확인을 요청한다.
- 인증 상태는 Query cache와 분리하고 Provider 인스턴스에 둔다. 서버 프로세스 전역에 사용자 상태를 두지 않는다. 재사용되는 공용 UI가 아직 없어 인증 폼 내부에 유지한다.

## API

기본 경로 `/api/v1/auth`, 응답/Swagger는 `Cache-Control: no-store` 인증 응답 계약을 따른다.

| 메서드·경로           | 정상 결과                        |
| --------------------- | -------------------------------- |
| POST /signup          | 201 SessionDto, 쿠키 발급        |
| POST /login           | 200 SessionDto, 쿠키 발급        |
| GET /me               | 200 AccountDto, 인증 필수        |
| POST /session/restore | 200 SessionDto, 비회원 정상 허용 |
| POST /refresh         | 200 SessionDto, rotation         |
| POST /logout          | 204, 현재 세션 폐기·쿠키 삭제    |

기존 안전한 오류 규격에 `ACCESS_EXPIRED`, `SESSION_INVALID`, `INVALID_CREDENTIALS`를 추가했다. 입력 오류 400, CSRF/권한 403, 이메일 충돌 409, 시도 제한 429, DB 장애 503을 구분한다. 원문 DB 오류를 노출하지 않는다.

## 실행과 검증

`apps/api/.env.example`의 AUTH_SECRET/WEB_ORIGIN을 로컬 `.env`에 설정한다. 기존 DB에는 자동으로 테이블을 만들지 않는다. API 빌드 후 **대상 DB를 확인하고** `pnpm --filter @chongmuya/api db:migration:run`을 명시적으로 실행한다. install/build/start에서는 마이그레이션을 적용하지 않는다.

필수 검사: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`. 격리된 테스트 DB를 지정해 `TEST_DATABASE_URL=... pnpm test:integration`을 실행한다. 인증 통합 테스트만 명시적으로 마이그레이션을 적용하며 임의 이메일 계정을 생성한다. 운영 DB를 지정하지 않는다.

통합 테스트는 회원가입/중복/DTO, 로그인 실패, 쿠키/CSRF, Access 만료·위조·세션 소유 불일치, rotation, 재사용 후 세션 전체 폐기, 동시 갱신, 갱신/로그아웃 경쟁, 절대 만료, 시도 제한, Swagger/로그 비밀정보 제외를 검증한다. 웹 테스트는 bootstrap 중복, 단일 갱신/1회 재시도, 장애와 무효 세션 구분, 로그아웃 경쟁·실패 후 재시도, `/me`·`/refresh`의 계정 변경 시 이전 요청 중단, 늦은 응답 무시, 복구 UI별 버튼 렌더링을 검증한다. 가입 원자성 테스트는 테스트 계정에만 작동하는 PostgreSQL 트리거로 세션/Refresh insert 실패를 각각 유발하여 계정까지 롤백되는지 확인하고 트리거를 제거한 뒤 같은 이메일 재가입을 확인한다. 트리거는 테스트 전용이며 finally에서 제거한다.

## 확인한 설계와 참고

- [Notion Architecture](https://app.notion.com/p/3ec8d571d6de81c7a1f9ca0b1dc083b1), [ERD](https://app.notion.com/p/3ec8d571d6de818ba06cd91d5a75d24b), [기능 명세](https://app.notion.com/p/3ec8d571d6de816fb87ce39531e0d531), [User Flow](https://app.notion.com/p/3ec8d571d6de81a1b35af20c55cdae2b): 2026-10-29 편집 설계 확인. 계정/명단 구성원 분리와 행사·예약 독립 방향을 유지하고 온보딩은 위의 2026-10-31 사용자 결정에 따라 다음 단계에서 구현한다.
- [Gather develop 인증 생명주기](https://github.com/KUIT-GATHER/gather-front/blob/develop/docs/troubleshooting/auth-session-lifecycle.md), `fetchClient.ts`, `AuthProvider.tsx`, auth의 restore/refresh/clear 함수: 책임 분리·single-flight·한 번 재시도 참고. shared의 feature 역참조, 모든 refresh 실패 시 세션 삭제, 전체 공개 캐시 삭제는 그대로 복사하지 않았다.
- [혼여족 develop auth](https://github.com/leedongkyu0701/honyeojok-backend/tree/develop/src/modules/auth): Strategy/Guard/Service와 쿠키 책임 참고. 사용자당 Refresh 해시 하나·Bearer 추출·Refresh JWT 구조는 복사하지 않았다.
- [Nest Passport](https://docs.nestjs.com/recipes/passport), [Next 인증](https://nextjs.org/docs/app/guides/authentication), [Next cookies](https://nextjs.org/docs/app/api-reference/functions/cookies): Context7와 설치된 Next 16.4.3 문서를 확인했다.

## 최초 인증 구현 검증 결과 (2026-10-30)

- frozen 설치·lint·typecheck·build·test 통과. 경계 검사 1개, API 단위/HTTP 4개, 웹 7개 통과.
- 격리된 임시 PostgreSQL에서 인증/동시성·readiness 통합 테스트 2개 통과. 마이그레이션 적용 후 Entity metadata의 추가 변경 SQL이 없는 것도 확인.
- `pnpm dev` 실행, 실제 Nest 및 Next rewrite에서 가입·내 정보·rotation·로그아웃·재로그인 정상 응답 확인.
- 임시 DB 중단 시 liveness 200, readiness/인증 503. DB 재시작 후 API 재시작 없이 인증 정상 복구.
- Chrome에서 로그인 폼과 최초 비회원 복원을 확인. 브라우저 연결 호스트 장애 및 다른 Chrome 작업과의 충돌로 폼 제출 이후 전체 흐름·화면의 실패/복구 전환은 미검증이다. 해당 흐름은 HTTP 및 SessionClient 자동 테스트로 검증했다.
- 기존 개발/운영 DB에는 마이그레이션을 적용하지 않았다. 로컬 실행 전 AUTH_SECRET·WEB_ORIGIN 설정과 마이그레이션 적용이 필요하다.

## 인증 리뷰 재현 및 보완 (2026-10-31)

기준 main: `6052d03` (PR #4 병합). 수정 전 웹 테스트에서 `/me`·`/refresh` 계정 변경 후 이전 요청이 재시도되는 두 실패와 로그아웃 실패 상태 구분 실패를 확인했다. PostgreSQL insert 실패 테스트에서는 세션 저장 실패 후 계정이 1개 남는 것을 확인했다. 위 세 동작을 수정했고 스키마·의존성·모임 기능은 변경하지 않았다.

- `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` 모두 통과. 경계 검사 1개, API 4개, 웹 17개가 통과했다.
- 격리된 임시 PostgreSQL에서 `pnpm test:integration` 3개 통과. 세션/Refresh 저장 실패 시 전체 롤백, 같은 이메일 재가입, 동시 중복 가입 중 한 건만 성공하는 것을 포함한다.
- `pnpm dev`와 실제 Next rewrite HTTP 요청으로 가입·로그인·Access 만료 후 갱신·로그아웃·재로그인을 확인했다. 실제 SessionClient 두 인스턴스가 쿠키 저장소를 공유하는 검증에서 `/me`·`/refresh` 각각의 계정 변경, 사용자 캐시 정리, 이전 요청 재시도 중단을 확인했다.
- 실제 브라우저 UI 및 다중 탭 Web Locks/BroadcastChannel 연동은 브라우저 연결 호스트 오류(`browser access host is unavailable`)로 실행하지 못했다. 위 HTTP 검증은 다중 탭 쿠키 공유를 모사한 것이며 실제 브라우저 검증을 대체했다고 보지 않는다. 복구 화면의 버튼 구분은 렌더링 회귀 테스트로 확인했다.
- `trust proxy`는 활성화하지 않았다. 배포 전 필요한 설정은 위 IP 제한 설정 절에 기록했다. 기존 개발/운영 DB는 변경하지 않았으며 이번 보완에 추가 환경변수나 마이그레이션은 필요하지 않다.

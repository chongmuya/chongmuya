# 총무야 (chongmuya)

총무야는 개인 행사와 모임을 관리하는 웹앱입니다. 이메일 가입·로그인, 모임 관리, 개인 행사 생성·조회·모임 연결을 제공합니다. 행사는 생성한 계정이 소유하며 모임이나 예약 없이 이용할 수 있습니다.

## 개발 환경

Node.js **26 LTS (26.13.1)**와 pnpm **11.25.0**을 사용합니다. 로컬·CI의 Node 패치 버전은 `.nvmrc`, pnpm 버전은 루트 `packageManager`에 고정합니다. 루트와 각 앱의 `engines.node`는 `26.x`이며 엔진 검사를 유지합니다. PostgreSQL 실행에는 Docker Engine 또는 Docker Desktop이 필요합니다.

- 웹: Next.js App Router, React, TanStack Query, React Hook Form + Zod, Tailwind CSS
- API: NestJS, Passport JWT, TypeORM, PostgreSQL, 네이티브 ESM
- pnpm workspace와 단일 `pnpm-lock.yaml`, Turborepo 빌드·개발 명령

## 처음 실행하기

저장소 루트에서 실행합니다. 기존 `.env`가 있다면 덮어쓰지 말고 필요한 값만 반영하세요.

```bash
node --version # v26.13.1
pnpm --version # 11.25.0
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
pnpm db:up
```

`apps/api/.env`에서 `AUTH_SECRET`을 32자 이상의 임의 값으로 설정하고 `WEB_ORIGIN`과 `DATABASE_URL`을 확인합니다. 예제 DB는 로컬 개발 전용입니다. **대상 DB를 확인한 뒤** 테이블을 준비하고 앱을 시작합니다.

```bash
pnpm --filter @chongmuya/api build
pnpm --filter @chongmuya/api db:migration:show
pnpm --filter @chongmuya/api db:migration:run
pnpm dev
```

install·build·서버 시작은 migration을 자동 적용하지 않습니다. `synchronize`, `migrationsRun`, `dropSchema`는 모두 false입니다. 개발 서버는 `Ctrl+C`, DB는 `pnpm db:down`으로 종료합니다. `db:down`은 데이터를 보존합니다.

| 주소                           | 용도                                                     |
| ------------------------------ | -------------------------------------------------------- |
| <http://localhost:3000>        | 비로그인 공개 홈                                         |
| <http://localhost:3000/start>  | 시작 화면: 가입·로그인·공개 홈 선택                      |
| <http://localhost:3000/auth>   | 이메일·카카오 로그인 (`?mode=signup`은 새 가입으로 이동) |
| <http://localhost:3000/events> | 로그인한 계정의 전체 행사·개인 행사 생성                 |
| <http://localhost:3000/mypage> | 모임 목록·생성·이름 수정, 계정·로그아웃                  |
| <http://localhost:3001/health> | DB와 독립된 liveness                                     |
| <http://localhost:3001/ready>  | 실제 DB 쿼리; 정상 200, 가용성 장애 503                  |
| <http://localhost:3001/docs>   | 개발용 Swagger; 변경 요청은 Origin·CSRF 헤더 필요        |

모임이 없어도 행사명과 선택적 일정으로 개인 행사를 만들 수 있습니다. 생성 시 본인 모임을 선택하거나 개인 행사 상세에서 나중에 연결할 수 있습니다. 연결은 행사 소유자와 기록을 유지하며 다른 사용자에게 권한을 주지 않습니다. 모임 명단 불러오기·연결 해제·다른 모임 이동·소유권 이전은 제공하지 않습니다.

`/events?event=<행사 UUID>`는 모임과 독립된 상세 주소이며 `/events?group=<모임 UUID>`는 본인 행사 목록의 필터입니다. 로그인 후에는 요청한 유효한 내부 경로로 돌아갑니다. 모임 선택은 URL에 두며 브라우저 저장소에 계정 공통 값을 남기지 않습니다.

시작·로그인·가입 간 이동은 유효한 `next`를 유지합니다. 비회원 시작은 공개 홈으로 연결하며 개인 행사 권한을 부여하지 않습니다. 비밀번호 재설정은 `/auth/recovery`, 카카오 연결은 로그인 후 `/mypage`에서 사용합니다. 카카오 설정·추가 가입·복구 링크·배포 순서는 [인증 기준](docs/authentication.md)을 따릅니다.

## 환경변수

| 변수                     | 위치                           | 기본값·조건                                                     |
| ------------------------ | ------------------------------ | --------------------------------------------------------------- |
| `DATABASE_URL`           | API `.env` 또는 실행 환경      | 필수. 호스트·DB 이름이 있는 PostgreSQL URL                      |
| `AUTH_SECRET`            | API `.env` 또는 실행 환경      | 필수. 32자 이상; 운영은 암호학적 난수                           |
| `WEB_ORIGIN`             | API `.env` 또는 실행 환경      | 필수. 경로·끝 슬래시 없는 웹 origin. production은 HTTPS         |
| `API_PORT`               | API `.env` 또는 실행 환경      | 3001; 1~65535                                                   |
| `NODE_ENV`               | API 실행 환경                  | development; test/production 허용                               |
| `API_DOCS_ENABLED`       | API `.env` 또는 실행 환경      | true/false; production 기본 false                               |
| `NEXT_PUBLIC_API_ORIGIN` | 웹 `.env.local` 또는 빌드 환경 | 개발 기본 `http://localhost:3001`; production 빌드·실행 시 필수 |
| `TEST_DATABASE_URL`      | 테스트 실행 환경               | DB 통합 테스트용 격리 PostgreSQL                                |

API는 `.env`보다 지정된 셸 환경변수를 우선하며 Zod로 검증합니다. 오류에는 변수 이름만 표시합니다. 로컬 DB는 `127.0.0.1:15432`에만 열립니다. 브라우저는 `NEXT_PUBLIC_API_ORIGIN`의 `/api/v1/*`와 `/health`를 `credentials: include`로 직접 호출합니다. Next API·health rewrite와 카카오 콜백 중계는 없습니다. 주소는 경로·끝 슬래시 없는 origin이며 공개 API 주소 이외의 비밀값은 NEXT_PUBLIC에 넣지 않습니다. 로컬 웹과 API는 각각 `http://localhost:3000`, `http://localhost:3001`로 통일하고 `127.0.0.1`과 혼용하지 않습니다. API 주소 변경 시 개발 서버를 재시작하고 웹을 다시 빌드·배포합니다. 빌드에 포함된 공개 변수는 실행 시 바꾸는 것만으로 갱신되지 않습니다. 운영 설정이 없으면 빌드를 중단합니다.

HttpOnly 쿠키, CSRF Origin·전용 헤더, Refresh 회전 정책은 [인증 기준](docs/authentication.md)을 따릅니다. 홈의 연결 성공 표시는 liveness이며 DB 정상 여부는 `/ready`로 확인합니다.

## 폴더와 명령

```text
apps/web/   app → features → shared
apps/api/   bootstrap, config, common/http, modules, database
            Entity는 각 업무 모듈, migration은 src/database/migrations, 시드는 src/database/seeds
tools/     ESLint 의존 경계 규칙과 검사
docs/      아키텍처·인증·협업 문서
```

| 명령                                           | 용도                                                |
| ---------------------------------------------- | --------------------------------------------------- |
| `pnpm dev`                                     | 웹·API 개발 서버                                    |
| `pnpm build`                                   | 두 앱 빌드; API TypeScript → ESM                    |
| `pnpm format` / `pnpm format:check`            | 포맷 적용·검사                                      |
| `pnpm lint` / `pnpm typecheck`                 | 린트·의존 경계·타입 검사                            |
| `pnpm test`                                    | 경계·설정·HTTP·세션·폼 테스트                       |
| `pnpm test:integration`                        | 격리 PostgreSQL의 migration·권한·동시성·인증 테스트 |
| `pnpm --filter @chongmuya/web dev`             | 웹만 실행                                           |
| `pnpm --filter @chongmuya/api dev`             | API만 실행                                          |
| `pnpm db:up` / `pnpm db:down` / `pnpm db:logs` | 로컬 DB 실행·종료·로그                              |

의존성은 실제 사용하는 앱에 선언합니다. Turbo는 앱 빌드 산출물을 캐시하며 개발 서버는 캐시하지 않습니다. 웹 NEXT_PUBLIC_API_ORIGIN·환경변수 파일은 빌드 입력에 포함됩니다.

## 데이터와 migration

계정·세션·Refresh 이력, 모임, 행사를 저장합니다. 기존 migration은 수정하지 않고 후속 파일을 추가합니다. 행사 소유자는 필수이며 모임 연결은 선택입니다. `PersonalEvents` migration은 기존 모임 소유자로 행사 소유자를 backfill하고 누락을 검증한 뒤 NOT NULL·FK·인덱스를 적용합니다. 기존 ID·일정·생성 시각과 인증 데이터는 보존합니다.

개인 행사 또는 변경된 행사 버전이 있는 DB는 이전 스키마로 안전하게 되돌릴 수 없으므로 down이 중단됩니다. rollback을 위해 데이터를 지우거나 임의 모임을 만들지 않습니다. 적용 순서·복구 제한은 [아키텍처의 DB 절](docs/architecture.md#postgresqltypeorm)을 참고하세요.

Entity 변경 시 로컬 개발 DB에서 `pnpm --filter @chongmuya/api db:migration:generate src/database/migrations/<이름>`으로 SQL을 생성할 수 있습니다. 검토 후 다시 build하고 명시적으로 적용합니다. CLI는 컴파일한 `dist/database/data-source.js`를 읽으며 `migration:show`도 이력 테이블을 생성할 수 있습니다. 운영 DB에 검증 명령이나 reset/drop을 실행하지 않습니다.

### 매장 시드

로컬 PostgreSQL과 `NODE_ENV=development` 또는 `test`에서 실행합니다. 실제 매장 4곳·공간 11개·메뉴 146개를 추가하며, 기존 값은 덮어쓰지 않습니다. 미확인 가격은 null로 보존합니다.

```sh
pnpm --filter @chongmuya/api build
pnpm --filter @chongmuya/api db:migration:run
pnpm --filter @chongmuya/api db:seed:restaurants
# 가상 데이터만 필요하면 db:seed:restaurants:demo 사용
pnpm --filter @chongmuya/api db:seed:restaurants --contacts-file src/database/seeds/data/restaurant-contacts.private.json
```

연락처 파일은 `apps/api/src/database/seeds/data/restaurant-contacts.private.json`에 `{ "contacts": [...] }` 형식으로 두며 Git·빌드에서 제외됩니다. 항목은 `restaurantKey`(`gaemijiptu`, `bakmulje`, `otaesik-sejong`, `sijang-kondae`), `name`, `phone`(숫자 문자열), `active`(기본 true), `requestConsentAt`(실제 수신 동의 시각, 시간대 포함 ISO 문자열 또는 null), `consentNote`입니다. 파일은 위 옵션을 지정해야 읽으며, 활성·수신 동의가 있는 담당자만 문의 대상으로 사용할 수 있습니다. 파일만으로 기존 연락처를 수정하거나 삭제된 담당자를 재등록하지 않습니다. 등록 이력에는 ID만 남깁니다. 시드는 발송하지 않습니다. 문의 접수 후 발송·답변 동작은 아래 사장님 등록·문의 문자 절을 따릅니다.

## 검증

`.nvmrc`의 Node 버전을 활성화한 뒤 실행합니다. GitHub Actions도 `node-version-file: .nvmrc`로 같은 패치를 사용합니다.

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
# 마이그레이션과 테스트 데이터를 기록하므로 전용 격리 DB만 지정
TEST_DATABASE_URL=<격리된_PostgreSQL_URL> pnpm test:integration
```

통합 테스트는 migration·가입·세션 회전·소유권·동시 연결·장애 복구를 실행하며 실제 테스트 데이터를 씁니다. 개발 중인 계정이나 운영 데이터가 있는 DB를 지정하지 않습니다. GitHub Actions도 임시 PostgreSQL 서비스에서 같은 검증을 수행합니다. DOM·HTTP 테스트와 실제 브라우저의 전체 클릭·모바일 시각 검수는 구분합니다.

## 배포 환경의 Node 버전

Vercel 프로젝트의 Settings → Build and Deployment → Node.js Version을 **26.x**로 맞추고 변경된 커밋을 재배포합니다. `package.json`의 `engines.node`가 프로젝트 설정보다 우선하며, Vercel은 26.x의 마이너·패치 업데이트를 자동 적용하므로 `.nvmrc`의 정확한 패치로 고정되지는 않습니다. 빌드와 Functions의 실제 패치 버전도 다를 수 있습니다. 자세한 정책은 [Vercel Node.js 버전 문서](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)를 참고하세요.

별도 API 호스팅 환경도 Node 26.x와 pnpm 11.25.0을 사용하고, 정확한 패치를 지정하는 환경은 `.nvmrc`에 맞춥니다. 이 저장소에는 앱 Dockerfile이 없으며 `compose.yaml`은 로컬 PostgreSQL만 실행합니다.

## 문서

- [아키텍처](docs/architecture.md): 책임·의존 방향·API·캐시·오류·migration
- [인증 기준](docs/authentication.md): Passport·쿠키·CSRF·세션·개인 자원 접근
- [협업 규칙](docs/CONTRIBUTING.md): 커밋·브랜치·PR과 검증
- [PR 템플릿](.github/pull_request_template.md)

### 사장님 등록·문의 문자

`/owner`에서 사장님 첫 설정, 계정별 등록 초안, 정보·메뉴 수정과 받은 문의를 이용한다. 신규 매장은 공개 대기이며, 기존 운영 매장은 계정 연결 없이도 유효 연락처와 수신 동의가 있으면 문자 문의를 받을 수 있다. `/merchant-reply?target=<id>#token=<비밀값>`은 로그인 없는 단일 문의 답변·수정 링크다. 가능·변경 제안은 예약 확정이 아니며, 접수 후 같은 행사 재문의는 계속 금지한다.

API 빌드 후 새 `OwnerRestaurants`, `MerchantRepliesAndDelivery`, `DeliveryLinkGenerations` migration을 기존 명시적 `db:migration:run`으로 적용한다. Node/pnpm, `pnpm dev`, 브라우저→Nest 통신은 그대로다. `.env.example`의 서버 설정을 `apps/api/.env` 또는 실제 Nest 프로세스 환경에 주입한다. Turbo 개발 실행에도 전달된다. Compose는 기존 로컬 PostgreSQL만 실행하며 별도 워커·Redis는 없다.

- 개발/CI: `MESSAGE_PROVIDER=fake`, `GEOCODING_PROVIDER=fake`. 실제 전달 완료로 표시하지 않는다. 운영에서는 fake를 허용하지 않는다.
- 실제 연동: 이미 발급한 SOLAPI Key/Secret과 등록 발신번호, 이미 Geocoding을 활성화한 Maps Application의 ID/Secret을 서버에 설정한다. 지도 표시용 `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`와 서버 Secret을 구분한다.
- `OWNER_SUPPORT_EMAIL`에는 실제 운영 이메일을 넣는다. 미설정 시 가짜 주소를 보여주지 않는다. 테스트는 `owner@example.test`를 사용한다.
- `MERCHANT_REPLY_TOKEN_ENCRYPTION_KEY`: `openssl rand -hex 32`로 만든 64자리 hex. 원문 토큰은 AES-256-GCM 암호문과 검증 digest로 분리 저장하며 문자 본문·URL은 이력/로그에 저장하지 않는다. 운영 키를 잃으면 명시적 링크 재발급이 필요하다.
- `WEB_ORIGIN`은 고정 링크 origin이며 운영은 HTTPS다. `PROVIDER_TIMEOUT_MS=5000`, 브라우저 제한 10초, 최대 3곳을 병렬로 기다린다. 링크는 기본 7일과 행사 시작 중 빠른 시각까지며 제안 선택 기본 12시간과 다르다.
- 운영자가 SOLAPI 콘솔 등 공식 경로에서 공개 HTTPS `POST /api/v1/webhooks/solapi`와 `SOLAPI_WEBHOOK_SECRET`, `SINGLE-REPORT`를 연결한다. 이 경로만 CSRF 예외이며 원본 본문에 대한 `X-Solapi-Signature`를 검증한다. 연결 전에는 ACCEPTED를 전달 완료로 바꾸지 않는다. 웹훅 본문은 기존 API의 256KB 한도다.
- 발신번호 등록·잔액, 실제 Nest 송신 공인 IP/NAT IP와 SOLAPI 허용 IP의 일치, 키의 send-sms/send-lms/read 권한, 실제 수신번호·동의·공개 상태는 실행 환경에서 별도 확인한다. 키 발급과 Geocoding 활성화를 다시 할 필요는 없다.
- `TRUSTED_PROXY_CIDRS`는 실제 ingress의 IP/CIDR만 명시한다. 기본은 직접 연결 IP이며 임의 X-Forwarded-For를 신뢰하지 않는다. 참석 제한은 차수·IP별 열기/저장 각 600회/15분, 식별 조합별 각 20회, IP·차수·이름별 열기 30회다.

운영 명령은 서버 접근 권한이 있는 실행자가 `pnpm --filter @chongmuya/api merchant:operations --action ...`으로 실행한다. 변경은 기본 dry-run이며 `--execute --actor <실행자> --reason <확인 사유>`가 있어야 적용한다. `--output <새 파일>`은 0600·wx로 결과를 저장한다. 비밀 토큰이나 문자 본문은 출력하지 않는다.

| action              | 추가 인자·효과                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `owner-link`        | `--restaurant <UUID> --account <owner Account UUID>`; 다른 소유자는 덮어쓰지 않음                                                                                                                 |
| `publish`           | `--restaurant <UUID>`; `--unpublish`로 비공개                                                                                                                                                     |
| `normalize-address` | `--restaurant <UUID> --version <현재 버전> --query <검색 주소> --base-address <정확한 선택 결과> --detail-address <층·호수>`; dry-run 확인 후 실행, 중복 충돌 시 중단                             |
| `deliveries`        | 읽기 전용 발송 상태/ID 조회, leaseExpired·현재 generation·보류 사유 표시                                                                                                                          |
| `expire-lease`      | `--delivery <UUID>`; 만료 PROCESSING을 UNKNOWN으로 변경. `--execute`가 있어야 쓰며 실행자·사유 기록                                                                                               |
| `retry`             | `--delivery <UUID>`; PENDING 또는 명확한 SUBMISSION 실패만 현재 동의·번호·공개·링크를 재검사해 처리                                                                                               |
| `reconcile`         | `--delivery <UUID>`; 공급자 ID 또는 번호·시간 범위 조회 후 deliveryId 대조. UNKNOWN이 해소되지 않으면 재발송 금지                                                                                 |
| `record-contact`    | `--restaurant <UUID> --input <0600 JSON>`; `{id:고정 UUID,name,phone,requestConsentAt:실제 동의 시각 또는 null,consentNote}`. 기존 번호를 덮어쓰지 않고 확인한 새 담당자 저장, null 동의는 비활성 |
| `change-recipient`  | `--target ID --contact NEW_CONTACT_ID`; 원래 접수·발송 이력을 보존하고 확인된 새 수신자와 링크로 전환. 반환한 deliveryId를 별도 `retry`로 발송                                                    |
| `regenerate-link`   | `--target <UUID>`; `--execute` 시 새 링크·발송 기록을 함께 저장한 뒤 즉시 발송 시도·결과 반환. 이전 접근 폐기, 문의·발송·답변 이력 보존. PENDING/PROCESSING/UNKNOWN은 먼저 해소                   |
| `record-reply`      | `--target <UUID> --input <0600 JSON>`; `{method:"PHONE" 또는 "SMS",confirmedAt:ISO시각,reply:응답 API 본문}`. 확인 주체·사유와 version/revision 보존                                              |

문의 트랜잭션 커밋 뒤 같은 Nest에서 직접 발송한다. 종료 시 남은 PENDING은 자동 복구하지 않는다. 타임아웃·접수 결과 저장 실패·만료 lease는 조회에 표시되고 명시적 `expire-lease --execute`로 UNKNOWN에 기록한다. 자동 재시도하지 않는다. `reservations:pending`은 PENDING의 수동 점검용 내보내기다. 이미 접수한 문자를 다시 보내는 목록으로 사용하지 말고 위 delivery ID 명령을 사용한다. 실제 시드 CLI는 여전히 development/test의 로컬 DB 전용이며 운영 이관 명령이 아니다.

### 전체 로컬 데모

기존 로컬 PostgreSQL과 `apps/api/.env`의 `DATABASE_URL`, `AUTH_SECRET`, `WEB_ORIGIN=http://localhost:3000`을 사용한다. API와 시드는 **같은 AUTH_SECRET/링크 암호화 키**를 사용해야 한다. `MESSAGE_PROVIDER=fake`, `GEOCODING_PROVIDER=fake`로 실행하며 실제 공급자 키는 필요 없다. 운영 환경의 fake는 시작 시 거절한다. migration CLI는 DB 설정만 검증하므로 문자·지도·메일 설정 오류에 막히지 않는다.

```bash
# 저장소 루트, .nvmrc의 Node와 packageManager의 pnpm 사용
pnpm --filter @chongmuya/api build
pnpm --filter @chongmuya/api db:migration:run
# zsh: 화면/셸 이력에 비밀번호를 남기지 않고 입력 (ASCII 8~16자, 공백 제외)
read -s 'DEMO_SEED_PASSWORD?데모 로그인 비밀번호: '
export DEMO_SEED_PASSWORD
MESSAGE_PROVIDER=fake pnpm --filter @chongmuya/api db:seed:demo
unset DEMO_SEED_PASSWORD
pnpm dev
```

계정은 `organizer.a@example.test`(모임 2개·참석/답변 대기/응답 비교), `organizer.b@example.test`(별도 모임·행사), `organizer.empty@example.test`(빈 총무), `owner.a@example.test`(가상 온기홀), `owner.empty@example.test`(등록 시작)이다. 입력한 비밀번호로 일반 이메일 로그인한다. 인증 시각과 동의는 로컬 합성 fixture이며 Resend/Octomo 인증이나 실제 수신 동의가 아니다. 전화번호 `01000000001`~`05`는 테스트 값일 뿐 실제 미사용 번호라는 보장은 없으며 데모 실발송은 차단한다.

확인 순서: 총무 A 로그인 → `/events`의 참석 관리(1차 열림·2차 마감) → 답변 대기/응답 비교 → 새 행사에서 가상 매장 문의 → 링크 파일의 해당 매장 답변 URL을 별도 브라우저에서 열어 저장 → 총무 문의 재조회 → 사장님 A `/owner/menus?restaurant=<출력 ID>`에서 수정·판매 중단 → 빈 총무/빈 사장님 화면. 참석은 김민수/0012, 최초 번호 연결은 이서연, 중복 조합은 정수빈/7788로 확인한다. QR 방문만으로 응답을 기록하지 않는다.

기본 링크 파일은 저장소 `.local/demo-seed-<set>-<시각>.links.json`이다. 참석 링크와 유효한 데모 답변 링크만 새 `0600` 파일로 저장하고 원문 URL·비밀번호는 로그에 출력하지 않는다. 화면에서 새 문의를 만든 뒤에는 다음 명령으로 **현재 링크를 회전 없이** 내보낸다.

```bash
MESSAGE_PROVIDER=fake pnpm --filter @chongmuya/api db:demo:links
# 만료된 사례를 새로 만들 때만 새 세트 이름 지정; 비밀번호는 위와 같이 입력
MESSAGE_PROVIDER=fake pnpm --filter @chongmuya/api db:seed:demo --set second
# 선택: --output ../../.local/my-demo.links.json (기존 파일 덮어쓰기 금지)
```

재실행은 기존 계정 비밀번호·인증 상태·명단·답변·매장 수정/삭제·소유권 해제를 보존한다. 공용 계정/모임/매장 루트가 삭제된 경우 새로 복원하지 않고 충돌로 보고한다. 새 세트는 기존 계정·모임·매장을 재사용하며 행사 시나리오만 추가한다. 링크/제안 만료는 연장하지 않는다. 매장 소유자/ID/이메일 충돌은 롤백하며 기존 소유권을 가져오지 않는다. 기존 데모 연락처가 `000...`이면 보존되므로 사장님 A 매장 수정에서 계정의 기인증 테스트 번호 `01000000004`로 바꾸고 개발용 수신 동의를 선택한다. 다른 사용자 수정 번호·철회 동의는 시드로 덮어쓰지 않는다. 가상 확인중식당의 미동의 상태도 유지한다.

실제 매장 시드/비공개 연락처 입력은 독립 명령 그대로다. 두 시드 모두 로컬 development/test DB 전용이며 운영 이관 도구가 아니다. 데모는 외부 HTTP 없이 Entity와 공유 codec으로 생성하고 fake ACCEPTED만 기록한다. 실제 휴대폰 전달·SOLAPI/NAVER 운영 검증·제안 수락·예약 확정·결제·정산을 구현/검증한 것으로 보지 않는다.

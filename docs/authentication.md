# 인증과 개발 기준

계정 인증과 모임·행사 소유권은 별개다. 공개 홈은 로그인 없이 볼 수 있으며 개인 행사 화면은 인증을 요구한다. 로그인한 사용자는 모임 없이 행사를 만들고 조회할 수 있다. 마이페이지에서 모임 생성·이름 수정·전환을 제공하고, 행사에 본인 모임을 연결해도 행사 소유자와 접근 범위는 바뀌지 않는다. accounts에 모임 ID나 온보딩 boolean을 두지 않는다.

## 책임

- 웹 `app`: 라우팅·Provider 조립. `features/auth`: 인증 API 조정, 세션 상태, 사용자 Query, 화면. `features/onboarding`: 가입 후 이용 방식 선택·시작 안내. `shared/ui`: 단계 화면 틀·선택 카드·입력·버튼. `shared/http`: 업무를 모르는 HTTP 전송과 안전한 오류. shared → features 역참조 금지.
- Nest `AuthController`: HTTP DTO·쿠키·응답. `JwtAccessStrategy`: 쿠키 JWT 추출, 서명·알고리즘·issuer·audience·만료 검증, 필수 claim 검사, 현재 세션과 계정으로 인증 사용자 구성. `AccessGuard`: 인증 필수 요청, `OptionalAccessGuard`: 최초 복원에서 비회원 허용. `AuthService`: 가입·로그인·토큰 발급·세션 rotation/폐기, 연결 대기와 트랜잭션 범위 관리. `AuthAttemptsRepository`: 전달받은 EntityManager를 사용하는 원자적 시도 제한 조회. DB 오류 분류는 공통 HTTP 필터가 맡고 예상하지 못한 오류는 500으로 유지한다.
- Controller는 Entity를 반환하지 않는다. `AccountDto`는 id/email/accountType, 이름·닉네임·전화번호와 휴대폰/이메일 인증 시각을 노출한다. 기존 계정의 추가 필드는 null이다. 비밀번호·Refresh·JWT를 JSON이나 로그에 넣지 않는다.
- 인증과 자원 권한은 별개다. `/auth/me`는 `@CurrentUser()`로 읽은 검증된 사용자만 반환하고 사용자 ID 입력을 받지 않는다. JWT sub와 세션 accountId 일치를 확인한다. 모임·행사 Service는 인증 계정의 소유권을 각 자원 조회 조건으로 검증한다. 모임 연결만으로 행사 권한을 얻지 않는다.
- 업무 API는 웹/Nest 모두 `/api/v1`. Next rewrite는 동일 경로를 전달한다. 운영 확인용 `/health`, `/ready`, `/docs`와 기존 `/api/health`는 업무 API 밖에 유지한다.

## 패키지 선택

Nest 12.2.0에서 `@nestjs/passport 12.0.0` (Nest 11/12 지원), `@nestjs/jwt 12.0.3` (Nest 8~12 지원), `passport 0.7.0`, `passport-jwt 4.0.1`을 사용한다. API 네이티브 ESM/NodeNext와 `.js` 상대 import를 유지한다. jose는 직접 의존성으로 사용하지 않는다.

## 토큰·쿠키·CSRF

Access JWT는 5분, Refresh 세션은 로그인부터 절대 14일이다. Refresh는 JWT가 아닌 32바이트 난수이며 SHA-256 해시만 DB에 저장한다. 고엔트로피 토큰의 해시와 비밀번호 해시는 목적이 다르다. 비밀번호는 salt 16바이트, scrypt N=32768/r=8/p=3, 64바이트 결과를 버전과 함께 저장하고 constant-time으로 비교한다. 비밀번호는 공백 없는 ASCII 영문·숫자·특수문자 8~16자이며 문자 종류별 필수 조합은 없다. 로그인·가입에 같은 규칙을 적용하고 입력을 자르거나 trim하지 않는다. 이메일은 trim/lowercase 후 최대 254자이며 DB unique 제약으로 중복 가입을 막는다.

Access/Refresh 모두 HttpOnly, SameSite=Lax, Path=/, Domain 생략. production에서는 Secure 및 `__Host-access`/`__Host-refresh`; 로컬 HTTP에서는 `access`/`refresh`다. 삭제 시에도 같은 옵션을 사용한다. production WEB_ORIGIN은 HTTPS만 허용한다. AUTH_SECRET은 최소 32자이고 `openssl rand -hex 32`로 32바이트 난수의 64자리 hex 값을 생성할 수 있다. 서버 인스턴스들은 같은 값을 사용하며 변경 후 재시작한다. 환경 오류에는 변수 이름만 노출한다.

Access와 Refresh는 HttpOnly 쿠키로 전달한다. Next Server Component에서 `await cookies()`로 요청별 Access 쿠키를 읽고 Nest로 전달할 수 있고, 새로고침마다 JS 메모리를 복원할 필요가 없다. Next가 JWT 서명/업무 권한을 중복 판단하지 않는다. 향후 서버 데이터 조회는 필요한 쿠키만 전달하고 `cache: no-store`를 사용해야 한다. Server Component 렌더 중 Refresh rotation은 하지 않는다. Set-Cookie를 브라우저에 전달할 수 있는 브라우저 요청/Route Handler 경계에서 갱신한다. 현재 화면은 Client에서 복원하며 SSR 보호 페이지는 아직 없다.

쿠키 선택은 Passport와 독립이다. 전역 CSRF Guard가 GET/HEAD/OPTIONS 외 요청에 정확한 `Origin === WEB_ORIGIN`과 `X-CSRF-Protection: 1`을 요구하고 cross-site Fetch Metadata를 거부한다. 로그인/가입/복원/갱신/로그아웃 모두 적용한다. Origin 없는 변경 요청도 거부한다. CORS를 열지 않고 동일 출처 Next rewrite를 사용한다. 전용 헤더를 임의 사이트에서 추가하려면 preflight가 필요하므로 허용하지 않는 CORS와 Origin 검증을 함께 유지해야 한다. GET은 상태를 변경하지 않는다. Swagger/CLI POST에도 두 헤더가 필요하다.

## 회원가입과 첫 설정

시작 화면의 ‘처음 가입해요’는 `/auth/signup`으로 이동한다. `/auth?mode=signup`도 safeReturnPath로 정리한 next를 유지한다. 약관 동의 → 가입 정보와 이메일·휴대폰 인증 → 계정·세션 생성 → 가입 완료 순서다. 완료 화면의 다음 버튼은 `/getting-started?next=...`로 이동한다.

가입과 첫 설정은 별개다. 신규 계정의 accountType/nickname은 null이며, 로그인된 본인의 `PATCH /first-setup`으로 이용 유형을 저장한다. 총무(organizer)는 닉네임 입력까지, 사장님(owner)은 유형 선택까지 첫 설정이다. 사장님에게 닉네임을 만들지 않으며 표시에 이름을 사용할 수 있다. 기존 닉네임은 보존한다. 확정된 유형 변경과 기존 닉네임 변경은 이 API에서 허용하지 않는다. 이용 유형은 매장 접근 권한이나 모임·행사 소유권을 부여하지 않는다.

첫 설정 완료 여부는 accountType과 nickname으로 판단한다. 중단한 사용자는 다시 로그인할 때 누락된 단계로 이어지고, 설정한 사용자는 원래 next로 돌아간다. 공개 홈은 그대로 접근할 수 있고 개인 업무 진입점에서 필요한 설정을 안내한다. 로그인 실패로 처리하거나 모든 공개 페이지를 막지 않는다. `/getting-started`의 next는 안전한 내부 경로만 보존하고 중첩 설정 경로는 제거한다.

총무의 정기 모임/일회성 행사 선택은 시작 안내용 UI 상태다. 서버 권한·영구 유형·완료 상태로 저장하지 않는다. 기존 `/mypage` 모임 관리 또는 `/events` 행사로 연결하고 나중에 선택하기는 원래 next로 돌아간다. 모임 생성은 가입·첫 설정 완료 조건이 아니다. 마이페이지의 `/getting-started?guide=1` 링크로 안내만 다시 볼 수 있다. `/onboarding`은 기존 모임 관리 용도를 유지한다. 상세 매장 등록·명단 업로드·카카오 로그인·비밀번호 재설정은 제공하지 않는다.

가입 입력은 `{ email, password, name, phone, emailVerificationId, phoneVerificationId, consents: [{ id, version, accepted }] }`이다. 이메일은 정규화 후 형식·중복과 소유 인증, 휴대폰은 010으로 시작하는 11자리 번호와 Octomo 인증이 필수다. 이름과 총무 닉네임은 별개이며 닉네임·전화번호 고유성 제약은 없다. 이메일·비밀번호만 보내거나 서버 결정 필드를 덧붙인 요청은 거부한다. `GET /signup/terms`의 네 식별자·버전이 정확히 일치해야 하고 serviceTerms/privacyCollection/privacyPolicy는 필수, marketing은 선택이다. 동의와 비동의를 모두 서버 시각과 함께 account_consents에 저장한다.

약관에 성공 데이터가 있으면 배경 재조회 실패로 가입 폼을 제거하지 않는다. 재시도 안내를 함께 표시하고 입력·단계·동의·인증을 유지한다. 실제 버전 또는 필수 여부가 변경된 항목만 동의를 해제하고 약관 단계로 돌아간다. 다른 입력과 인증 상태는 유지하며 버전으로 전체 폼을 remount하지 않는다.

약관은 `utils/signup-terms.ts`의 수정 가능한 한국어 초안(`draft-2026-11-16`)을 제공한다. 본문 화면에 초안임을 표시하며 가입을 차단하지 않는다. 확정 후 본문과 버전을 함께 변경하거나 `SIGNUP_TERMS_JSON`에 네 항목의 `{ id, version, url }` 배열을 설정해 HTTPS 원문으로 연결한다. 운영자·문의처, 보유 기간과 삭제 절차, 위탁·제공 여부 등 실제 운영에 해당하는 내용을 공개 전 확정해야 한다. 초안이 법률 검토를 거친 최종 문서임을 의미하지 않는다.

## 이메일 인증

`ResendMailService`는 메일 발송만 담당하고 Resend SDK는 API에만 설치한다. `EmailVerificationService`가 가입 목적의 코드 발급·확인·취소·소비와 제한을 담당한다. `EMAIL_VERIFICATION_SECRET`으로 요청자 해시·정규화 이메일·요청 ID·signup 용도·코드를 HMAC-SHA256으로 묶고 constant-time 비교한다. DB에는 6자리 코드 원문이나 단순 코드 SHA 해시를 저장하지 않는다.

서버 상수 `EMAIL_LIMITS`는 암호학적 6자리 숫자 코드, 유효기간 10분, 재전송 간격 60초, 요청당 오답 5회를 정한다. 발급은 15분 동안 이메일·요청자 각 5회/IP 30회, 확인은 이메일·요청자 각 20회/IP 100회다. 확인 제한에는 성공·실패 요청이 모두 포함된다. 누적 제한은 별도 커밋된 auth_attempts 행에 있어 코드 재발급이나 검증 롤백으로 초기화되지 않는다.

발급 행의 delivery는 sending/sent/failed로 구분한다. 발송 성공은 소유 인증 성공이 아니다. 동일 발급 건의 통신 재시도는 같은 Resend idempotency key와 본문을 사용하며 각 4초, 최대 2회로 제한한다. 명시적 재전송은 새 ID·코드로 이전 요청을 교체한다. 외부 발송 동안 트랜잭션·행 잠금을 유지하지 않으며 발송 후에도 현재 요청·취소 상태를 재확인한다. 발송 실패 응답의 status=failed를 화면에서 실패로 표시하며 코드 확인을 제공하지 않는다. 키 미설정은 503이다. RESEND_DEBUG=true는 시작 시 거부해 SDK의 원문 디버그 출력이 활성화되지 않게 한다.

서버가 올바른 코드를 확인한 시각을 verifiedAt으로 기록한다. 다른 요청자/이메일, 이전 코드·ID, 만료·취소·소비한 요청은 거부한다. 이메일 수정은 이메일 인증만, 전화번호 수정은 휴대폰 인증만 취소한다. 실제 화면 이탈 시 요청을 중단하고 늦은 응답을 무시한다. 메일 앱·문자 앱을 열어도 화면이 유지되는 동안 입력과 인증 기한은 유지되며, 전체 새로고침 후 비밀번호·인증을 영구 저장소에서 복원하지 않는다.

## 휴대폰 인증과 가입 요청자

`OctomoService`는 [Octomo 공식 API](https://octomo.octoverse.kr/api-docs/) 통신만, `PhoneVerificationService`는 가입 목적의 발급·기한·횟수·소비 규칙을 담당한다. 서버만 OCTOMO_API_KEY를 사용한다. POST `/signup/context`가 32바이트 난수 HttpOnly/SameSite=Strict 요청자 쿠키를 설정하며 DB에는 해시만 남긴다. production 이름은 `__Host-signup-requester`, 로컬은 `signup-requester`이고 30분 유지한다. 쿠키 설정도 CSRF 검사를 통과해야 한다. 유효한 기존 쿠키는 교체하지 않는다. 두 인증이 동시에 시작할 때 SessionClient의 단일 요청과 탭 간 잠금으로 쿠키 초기화를 공유한다.

인증 요청마다 새 UUID와 AUTH_SECRET 기반 HMAC 난수 문구를 만들고 요청자·번호·signup 용도에 묶는다. 문구 원문은 DB에 저장하지 않는다. 재발급은 같은 요청자의 이전 ID를 교체한다. 기한은 발급부터 5분, 재발급 간격은 60초다. 발급 시도는 15분 동안 요청자/번호 각 5회, 직접 연결 IP 30회로 제한한다. 결과 확인은 10초 간격, 요청당 최대 12회이고 자동 무한 polling을 하지 않는다.

모바일에서는 수신 번호 16663538과 본문이 채워진 문자 앱을 열고 직접 전송한다. 데스크톱은 인증 요청 직후 Octomo가 생성한 QR을 바로 보여주며 휴대폰 카메라로 스캔한다. 터치 기기에서는 문자 앱 열기를 우선 표시한다. 번호·본문은 ‘번호·문구 직접 확인’을 펼쳐 확인하고 입력할 수도 있다. ‘인증 결과 확인’을 누르면 Nest가 Octomo의 `/message/exists`에 mobileNum/text/withinMinutes=5를 보내 수신 여부를 확인한다. 클라이언트의 verified 값은 받지 않는다. Octomo는 수신 시각을 반환하지 않으므로 phoneVerifiedAt은 서버가 수신 사실을 처음 확인한 시각이다.

외부 조회 전 짧은 트랜잭션에서 확인 횟수를 예약하고, 외부 응답 뒤 다시 잠가 현재 ID·번호·기한·취소 상태를 확인한다. 외부 API 응답을 기다리는 동안 DB 트랜잭션을 유지하지 않는다. 가입 트랜잭션에서 유효한 인증을 잠그고 한 번 소비한다. 만료·번호 불일치·취소·재발급 전 ID·이미 소비한 결과는 거부한다. 화면 이탈/번호 변경은 요청 취소와 지연 응답 무시를 함께 적용한다. 서버 기한에 단조 증가 경과 시간을 더해 표시하며 임의로 기한을 연장하지 않는다.

비밀번호·이메일 코드·인증 문구·QR·인증 요청 ID는 폼과 현재 화면 메모리에만 둔다. TanStack mutation에는 비밀값을 variables/data로 넣지 않으며 gcTime=0, retry=false를 적용한다. 브라우저 영구 저장소를 사용하지 않는다. 약관만 공개 Query로 조회한다. 개발 전용 `/dev/auth`의 모의 화면은 실제 가입 경로와 분리되며 production에서는 제공하지 않는다.

## 세션 저장과 경쟁 조건

`accounts` → `auth_sessions` → `refresh_tokens` 구조이며 로그인마다 독립 세션을 만든다. 각 토큰의 사용 시각을 남겨 과거 토큰 재사용을 탐지한다. 현재 기기의 로그아웃은 해당 세션만 폐기한다.

가입 즉시 로그인되므로 이메일·휴대폰 인증 결과 소비·신규 계정·약관별 동의 기록·세션·최초 Refresh 해시 삽입과 Access 서명은 한 DB 트랜잭션에서 완료한다. 세션/Refresh 저장 또는 서명이 실패하면 계정까지 롤백하고 쿠키를 보내지 않는다. 비밀번호 해싱은 트랜잭션 밖에서 수행해 DB 연결을 오래 점유하지 않는다. 이메일 중복은 DB unique 제약과 insert 충돌 처리로 409를 반환하며, 동시 가입도 하나의 계정·세션·Refresh만 남긴다. 로그인 시도 제한 기록은 보안상 실패한 가입 트랜잭션과 별개로 유지한다.

갱신은 트랜잭션에서 **세션 행 잠금** → 토큰 재조회 → 기존 토큰 사용 처리 → 새 토큰 해시 삽입 순서다. 사용된 토큰이 다시 들어오면 전체 세션을 폐기하고, 폐기 트랜잭션을 커밋한 뒤 401을 반환한다. 로그아웃도 같은 세션 잠금을 사용하며 과거 토큰으로도 그 세션을 폐기할 수 있다. Access 검증마다 세션 활성 상태를 확인하므로 JWT의 남은 수명과 무관하게 폐기가 반영된다.

재사용은 엄격하게 거부한다. 같은 Refresh를 직접 동시에 보내면 하나만 성공하고 재사용 요청이 세션을 폐기한다. 정상 웹은 single-flight와 탭 간 Web Locks로 이를 예방한다. Web Locks가 없는 브라우저에서는 탭 내 중복 방지만 가능하다. 갱신 결과가 네트워크에서 유실된 뒤 옛 토큰을 다시 쓰는 경우에도 세션 폐기로 이어질 수 있어 재로그인이 필요하다. 일시 장애 자체를 클라이언트가 세션 무효화로 해석하지는 않는다.

시도 제한은 DB upsert로 15분 고정 창 동안 이메일당 10회, 직접 연결 IP당 50회(가입·로그인 합산)를 적용한다. 알 수 없는 계정도 동일 비용의 비밀번호 연산을 수행한다. `trust proxy`를 켜지 않아 임의 X-Forwarded-For로 제한을 우회하지 못한다. 실제 프록시 배포 시 신뢰할 프록시 목록과 IP 집계를 확정해야 한다. 현재 Next 프록시 요청은 같은 IP 제한을 공유하므로 운영 배포 전 조정 항목이다.

만료 세션과 사용된 Refresh 이력은 만료 전 삭제하지 않는다. 운영 전 만료 세션(자식 토큰 cascade)과 오래된 시도 제한 행을 정리하는 보존·청소 작업을 추가해야 한다. 세션 정리 작업은 유효한 Refresh 재사용 감지 이력을 지우면 안 된다.

### 배포 전 IP 제한 설정

배포 경로가 확정되지 않았으므로 `trust proxy`는 기본 false를 유지한다. Next rewrite를 거친 요청은 Nest에서 Next 서버의 소켓 IP로 집계되어 사용자들이 IP 제한을 공유할 수 있다. 헤더를 그대로 읽거나 `trust proxy: true`를 켜서 우회하지 않는다. 배포를 확정할 때 다음 항목을 함께 검증한다.

1. 클라이언트 → CDN/LB → Next → Nest의 실제 경로, 우회 경로, 각 홉의 주소와 변경 범위를 확정한다. Nest 직접 접근은 신뢰한 프록시로 제한한다.
2. 외부 경계에서 클라이언트가 임의로 보낸 X-Forwarded-For/Host/Proto를 제거·덮어쓰고, Next를 포함한 각 홉이 검증된 체인을 어떻게 전달하는지 확인한다. 임의 X-Forwarded-For를 붙여도 사용자 IP를 바꿀 수 없어야 한다.
3. Nest에서 신뢰할 주소/CIDR 범위를 최소한으로 지정하는 안을 배포 구성에 맞게 선택한다. 경로 길이가 달라질 수 있으면 고정 홉 수나 모든 프록시 신뢰를 사용하지 않는다. 실제 경로에서 서로 다른 클라이언트가 서로 다른 제한 키를 갖는지 검증한다.
4. 프록시 우회·헤더 위조·IPv4/IPv6·여러 Next/API 인스턴스·공유 NAT 환경을 검증하고 IP 제한 수치를 조정한다. 이메일 제한과 DB 원자 집계는 유지한다. 이 설정은 실제 배포 구성과 함께 검증한다.

근거: [Express 5 프록시 설정](https://expressjs.com/en/5x/guide/behind-proxies/). 현재 통합 테스트는 위조 X-Forwarded-For가 제한 IP로 채택되지 않는 것까지 확인한다.

## 프론트 생명주기

- 최초 `POST /session/restore`: 유효 Access는 그대로 사용, 없거나 만료되면 Refresh를 회전한다. 세션 없음/무효는 200 `{ authenticated:false, account:null }`. DB/통신 장애는 확인 불가 상태이며 비회원으로 단정하지 않는다.
- 인증 요청: `ACCESS_EXPIRED`만 갱신 대상. 한 Provider의 Promise를 공유하고 같은 출처 탭 간 Web Lock을 사용한다. 잠금을 얻은 뒤 `/me`를 재확인하여 다른 탭이 이미 갱신한 경우 추가 rotation을 피한다. 늦게 도착한 만료 응답은 revision으로 구분한다. 원 요청은 같은 계정일 때만 한 번 재시도한다. `/me` 또는 `/refresh`에서 확인한 계정을 먼저 현재 상태에 반영한다. 계정 ID가 바뀌면 generation을 올리고 사용자 캐시를 정리하므로 이전 계정에서 시작한 모든 대기 요청은 자동 재시도하지 않는다. 새 계정은 로그인 상태로 유지하며, 이전 요청의 종료 오류가 새 세션을 무효화하지 않는다. 갱신 중 로그아웃/다른 복원이 발생했다면 늦은 응답도 반영하지 않는다.
- `SESSION_INVALID`: 사용자 캐시 취소·삭제와 세션 종료. 네트워크/타임아웃/5xx는 로그인 정보를 보존하고 재시도 UI를 제공한다. 403은 권한 실패이며 갱신하지 않는다.
- 로그아웃: generation을 올리고 사용자 캐시를 즉시 정리하며 진행 중 복원/갱신/가입·로그인을 기다린 뒤 서버 폐기 요청을 보낸다. 오래된 요청은 결과를 적용하지 못한다. 실패하면 `logout-failed` 상태로 남아 **로그아웃 다시 시도**만 제공하고 자동 복원을 막는다. 동작하지 않는 연결 재확인 버튼은 표시하지 않는다. 일반 복원 통신 장애는 `unavailable` 상태에서 **연결 재확인**으로 세션 복원을 다시 요청한다. `logging-out`은 진행 표시만 제공한다.
- `user`로 시작하는 Query key는 사용자 전용이다. 해당 Query를 취소·삭제하고 mutation cache도 정리한다. health 같은 공개 Query는 유지한다. 로그인·로그아웃은 BroadcastChannel로 다른 탭의 재확인을 요청한다.
- 인증 상태는 Query cache와 분리하고 Provider 인스턴스에 둔다. 서버 프로세스 전역에 사용자 상태를 두지 않는다. 폼은 React Hook Form과 Zod, 공용 입력·오류 UI를 사용한다.

## API

기본 경로 `/api/v1/auth`, 응답/Swagger는 `Cache-Control: no-store` 인증 응답 계약을 따른다.

| 메서드·경로                             | 정상 결과                                      |
| --------------------------------------- | ---------------------------------------------- |
| GET /signup/terms                       | 200 약관 식별자·버전·본문/URL                  |
| POST /signup/context                    | 204, 가입 요청자 쿠키                          |
| POST /signup/phone-verifications        | 201, 문구·QR·서버 기한                         |
| POST /signup/phone-verifications/check  | 200, pending/verified 및 남은 횟수             |
| POST /signup/phone-verifications/cancel | 204, 해당 인증 취소                            |
| POST /signup/email-verifications        | 201, pending/failed와 서버 기한·재전송 시각    |
| POST /signup/email-verifications/check  | 200, verified와 남은 횟수                      |
| POST /signup/email-verifications/cancel | 204, 해당 인증 취소                            |
| PATCH /first-setup                      | 200 AccountDto, 로그인 본인의 유형/닉네임 저장 |
| POST /signup                            | 201 SessionDto, 쿠키 발급                      |
| POST /login                             | 200 SessionDto, 쿠키 발급                      |
| GET /me                                 | 200 AccountDto, 인증 필수                      |
| POST /session/restore                   | 200 SessionDto, 비회원 정상 허용               |
| POST /refresh                           | 200 SessionDto, rotation                       |
| POST /logout                            | 204, 현재 세션 폐기·쿠키 삭제                  |

안전한 오류 규격은 `ACCESS_EXPIRED`, `SESSION_INVALID`, `INVALID_CREDENTIALS`를 보존한다. 입력 오류 400, CSRF/권한 403, 이메일 충돌 409, 시도 제한 429, DB 장애 503을 구분한다. 원문 DB 오류를 노출하지 않는다.

## 실행과 검증

`apps/api/.env.example`의 AUTH_SECRET/WEB_ORIGIN/OCTOMO_API_KEY와 RESEND_API_KEY/RESEND_FROM/EMAIL_VERIFICATION_SECRET을 로컬 `.env`에 설정한다. Resend 세 변수는 함께 설정하며 발신 주소는 검증된 도메인의 주소 또는 `총무야 <account@auth.example.com>` 형식이다. 전용 EMAIL_VERIFICATION_SECRET은 AUTH_SECRET과 별도로 `openssl rand -hex 32`로 생성하고 서버 인스턴스들이 같은 값을 사용한다. 서버에서만 읽고 NEXT_PUBLIC로 노출하지 않는다. 세 변수가 모두 없으면 기존 로그인은 가능하지만 이메일 인증 발급은 503으로 실패한다. 일부만 설정하거나 잘못된 발신 주소·짧은 비밀키를 넣으면 API 시작을 거부한다. 키는 값이 있으면 공백 없는 비어 있지 않은 문자열인지 Zod로 검증하며 오류에 원문을 넣지 않는다. 키가 없으면 로그인은 동작하지만 휴대폰 인증 발급은 503으로 실패한다. 약관 외부 URL 설정은 선택이다. 환경변수 변경 후 API를 재시작한다. 기존 DB에는 자동으로 테이블을 만들지 않는다. `1794873600000-EmailVerification`은 이메일 인증 테이블만 추가한다. 기존 계정·모임·행사·세션·미인증 시각을 변경하지 않는다. API 빌드 후 **대상 DB를 확인하고** `pnpm --filter @chongmuya/api db:migration:run`을 명시적으로 실행한다. install/build/start에서는 마이그레이션을 적용하지 않는다.

필수 검사: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`. 격리된 테스트 DB를 지정해 `TEST_DATABASE_URL=... pnpm test:integration`을 실행한다. 업무 통합 테스트가 명시적으로 마이그레이션을 적용하며 임의 이메일 계정을 생성한다. 운영 DB를 지정하지 않는다.

통합 테스트는 회원가입/중복/DTO, 로그인 실패, 쿠키/CSRF, Access 만료·위조·세션 소유 불일치, rotation, 재사용 후 세션 전체 폐기, 동시 갱신, 갱신/로그아웃 경쟁, 절대 만료, 시도 제한, Swagger/로그 비밀정보 제외를 검증한다. 웹 테스트는 bootstrap 중복, 단일 갱신/1회 재시도, 장애와 무효 세션 구분, 로그아웃 경쟁·실패 후 재시도, `/me`·`/refresh`의 계정 변경 시 이전 요청 중단, 늦은 응답 무시, 복구 UI별 버튼 렌더링을 검증한다. 가입 원자성 테스트는 테스트 계정에만 작동하는 PostgreSQL 트리거로 세션/Refresh insert 실패를 각각 유발하여 계정까지 롤백되는지 확인하고 트리거를 제거한 뒤 같은 이메일 재가입을 확인한다. 트리거는 테스트 전용이며 finally에서 제거한다.

## 개인 자원 접근과 화면 복귀

- `/api/v1/groups`는 모임 소유권, `/api/v1/events`는 행사 자체의 소유권으로 조회·수정 범위를 제한한다. 상세에 groupId를 요구하지 않는다. 타인 자원과 존재하지 않는 자원은 같은 404다.
- 생성의 ownerId는 인증 계정에서 정한다. groupId를 지정하면 모임 소유권도 확인한다. 일반 행사 PATCH로 ownerId·groupId를 바꾸지 못한다.
- `PUT /events/:eventId/group`은 expectedVersion·groupId를 받는다. 행사 잠금, 행사·모임 소유권, 요청 버전과 미연결 상태를 같은 트랜잭션·EntityManager에서 확인한다. 모임 연결은 다른 사람에게 권한을 주지 않는다.
- `/events`는 전체 내 행사, `/events?event=<id>`는 개인 상세, `/events?group=<id>`는 모임별 내 행사다. 모임 없음과 행사 없음은 정상 상태이며 조회 실패와 구분한다. `/onboarding`도 모임 생성을 강제하지 않는다.
- 비로그인 개인 화면의 로그인 링크는 `/auth?next=<내부 경로>`를 사용한다. safeReturnPath는 지원하는 페이지와 유효한 UUID query만 허용한다. 외부 URL·인증/API 경로는 `/events`로 대체하며 로그인 후 원래 요청한 화면으로 돌아간다. 클라이언트의 화면 보호는 API 권한 검사를 대체하지 않는다.
- 사용자 Query key는 `user / accountId` 범위를 유지하고 상세는 `events / detail / eventId`로 식별한다. 행사 생성·모임 연결은 내 행사·해당 모임 목록과 상세를 갱신한다. 계정 전환·로그아웃·화면 이탈 후 늦은 응답을 반영하지 않는다.

API 입력·응답·캐시·fieldErrors의 정확한 형식과 migration 적용·복구 제한은 [아키텍처](architecture.md)를 따른다. 입력 오류는 허용된 필드에, 업무 오류는 폼 전체에 표시하며 작성한 입력을 유지한다. 서버의 임의 message는 출력하지 않는다.

실제 외부 인증 검증은 Resend 발신 도메인 확인과 발송 가능한 수신 주소를 준비한 뒤 격리 DB를 지정한 개발 서버에서 `/auth/signup`을 열고 약관 동의·정보 입력 → 이메일 코드 발송·입력·확인 → 휴대폰 인증 요청 → 해당 번호의 휴대폰에서 안내된 문자를 직접 전송 → 결과 확인 → 가입 완료 → 이용 유형·총무 닉네임 설정 순으로 진행한다. 가입 후 새로고침 세션 복원과 로그아웃·로그인을 확인한다. 자동 통합 테스트에서는 외부 메일·SMS 공급자는 테스트 대역을 사용하고 실제 HTTP·PostgreSQL 트랜잭션으로 검증한다. 실제 메일과 문자를 보내지 않은 테스트를 실인증 성공으로 취급하지 않는다.

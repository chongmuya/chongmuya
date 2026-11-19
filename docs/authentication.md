# 인증과 개발 기준

계정 인증과 모임·행사 소유권은 별개다. 공개 홈은 로그인 없이 볼 수 있으며 개인 행사 화면은 인증을 요구한다. 로그인한 사용자는 모임 없이 행사를 만들고 조회할 수 있다. 모임 생성은 `/groups/new`, 이름 수정·명단 조회·전환은 마이페이지에서 제공한다. 행사 모임은 생성 시 확정하며 이후 변경하지 않는다. 행사 소유권은 계정에 있다. accounts에 모임 ID나 온보딩 boolean을 두지 않는다.

## 책임

- 웹 `app`: 라우팅·Provider 조립. `features/auth`: 인증 API 조정, 세션 상태, 사용자 Query, 화면. `features/onboarding`: 가입 후 이용 방식 선택·시작 안내. `shared/ui`: 단계 화면 틀·선택 카드·입력·버튼. `shared/http`: 업무를 모르는 HTTP 전송과 안전한 오류. shared → features 역참조 금지.
- Nest `AuthController`: HTTP DTO·쿠키·응답. `JwtAccessStrategy`: 쿠키 JWT 추출, 서명·알고리즘·issuer·audience·만료 검증, 필수 claim 검사, 현재 세션과 계정으로 인증 사용자 구성. `AccessGuard`: 인증 필수 요청, `OptionalAccessGuard`: 최초 복원에서 비회원 허용. `AuthService`: 이메일 가입·로그인·세션 rotation/폐기와 트랜잭션 범위 관리. `SessionIssuerService`는 같은 EntityManager로 최초 세션·Refresh를 저장하고 JWT를 발급한다. `PasswordResetService`는 복구 링크, `KakaoFlowService`는 카카오 로그인·가입·연결, `KakaoOidcService`는 카카오 외부 통신과 OIDC 검증을 담당한다. 요청 횟수는 공용 DB 제한 함수가 원자적으로 기록한다. DB 오류 분류는 공통 HTTP 필터가 맡고 예상하지 못한 오류는 500으로 유지한다.
- Controller는 Entity를 반환하지 않는다. `AccountDto`는 id/email/accountType, 이름·닉네임·전화번호와 휴대폰/이메일 인증 시각을 노출한다. 기존 계정의 추가 필드는 null이다. 비밀번호·Refresh·JWT를 JSON이나 로그에 넣지 않는다.
- 인증과 자원 권한은 별개다. `/auth/me`는 `@CurrentUser()`로 읽은 검증된 사용자만 반환하고 사용자 ID 입력을 받지 않는다. JWT sub와 세션 accountId 일치를 확인한다. 모임·행사 Service는 인증 계정의 소유권을 각 자원 조회 조건으로 검증한다. 모임 소속만으로 행사 권한을 얻지 않는다.
- 브라우저는 NEXT_PUBLIC_API_ORIGIN의 Nest `/api/v1`을 직접 호출한다. 운영 확인용 `/health`, `/ready`, `/docs`는 업무 API 밖에 유지한다. Next API·health rewrite와 콜백 중계 Route Handler는 없다.

## 패키지 선택

Nest 12.2.0에서 `@nestjs/passport 12.0.0` (Nest 11/12 지원), `@nestjs/jwt 12.0.3` (Nest 8~12 지원), `passport 0.7.0`, `passport-jwt 4.0.1`을 사용한다. API 네이티브 ESM/NodeNext와 `.js` 상대 import를 유지한다. jose는 직접 의존성으로 사용하지 않는다.

## 토큰·쿠키·CSRF

Access JWT는 5분, Refresh 세션은 로그인부터 절대 14일이다. Refresh는 JWT가 아닌 32바이트 난수이며 SHA-256 해시만 DB에 저장한다. 고엔트로피 토큰의 해시와 비밀번호 해시는 목적이 다르다. 비밀번호는 salt 16바이트, scrypt N=32768/r=8/p=3, 64바이트 결과를 버전과 함께 저장하고 constant-time으로 비교한다. 비밀번호는 공백 없는 ASCII 영문·숫자·특수문자 8~16자이며 문자 종류별 필수 조합은 없다. 로그인·가입에 같은 규칙을 적용하고 입력을 자르거나 trim하지 않는다. 이메일은 trim/lowercase 후 최대 254자이며 DB unique 제약으로 중복 가입을 막는다.

Access/Refresh 모두 HttpOnly, SameSite=Lax, Path=/, Domain 생략. production에서는 Secure 및 `__Host-access`/`__Host-refresh`; 로컬 HTTP에서는 `access`/`refresh`다. 삭제 시에도 같은 옵션을 사용한다. production WEB_ORIGIN은 HTTPS만 허용한다. AUTH_SECRET은 최소 32자이고 `openssl rand -hex 32`로 32바이트 난수의 64자리 hex 값을 생성할 수 있다. 서버 인스턴스들은 같은 값을 사용하며 변경 후 재시작한다. 환경 오류에는 변수 이름만 노출한다.

Access와 Refresh는 API 호스트의 host-only HttpOnly 쿠키다. 웹과 API는 같은 상위 도메인의 HTTPS 주소를 사용하며 브라우저 요청은 credentials: include로 전송한다. 부모 Domain이나 SameSite=None을 추가하지 않는다. 로컬도 웹/API 모두 localhost를 사용한다. AuthProvider/SessionClient가 클라이언트에서 복원·갱신하며 인증 SSR이나 Next의 쿠키 전달 계층은 없다.

쿠키 선택은 Passport와 독립이다. 전역 CSRF Guard가 GET/HEAD/OPTIONS 외 요청에 정확한 `Origin === WEB_ORIGIN`과 `X-CSRF-Protection: 1`을 요구하고 cross-site Fetch Metadata를 거부한다. 로그인/가입/복원/갱신/로그아웃 모두 적용한다. Origin 없는 변경 요청도 거부한다. Nest CORS는 정확한 WEB_ORIGIN만 허용하며 credentials, Content-Type·X-CSRF-Protection 요청 헤더와 x-request-id 응답 헤더 노출을 설정한다. OPTIONS preflight는 로그인·CSRF 헤더 없이 처리한다. 허용한 웹 origin은 인증 실패·429·500·503 응답도 읽을 수 있다. 다른 origin은 CORS 허용을 받지 못하며 변경 요청은 별도의 Origin/CSRF 검증으로 거부한다. 업무 GET은 상태를 변경하지 않는다. 외부 OAuth GET 콜백만 state·브라우저 바인딩을 검증해 임시 결과를 저장하며, 회원 세션·가입·연결은 허용된 웹 origin에서 API로 보내는 CSRF 보호 POST로 확정한다. Swagger/CLI POST에도 두 헤더가 필요하다.

## 회원가입과 첫 설정

시작 화면의 ‘처음 가입해요’는 `/auth/signup`으로 이동한다. `/auth?mode=signup`도 safeReturnPath로 정리한 next를 유지한다. 약관 동의 → 가입 정보와 이메일·휴대폰 인증 → 계정·세션 생성 → 가입 완료 순서다. 완료 화면의 다음 버튼은 `/getting-started?next=...`로 이동한다.

가입과 첫 설정은 별개다. 신규 계정의 accountType/nickname은 null이며, 로그인된 본인의 `PATCH /first-setup`으로 이용 유형을 저장한다. 유형 선택 뒤 확인창에서 변경 불가 안내를 확인해야 저장한다. 닫기·Escape는 선택을 보존하고 요청 없이 취소하며, 저장 중에는 중복 확인과 닫기를 막는다. 총무(organizer)는 닉네임 입력까지 첫 설정이다. 사장님(owner)도 유형을 확정할 수 있다. 계정 첫 설정과 매장 등록 완료는 별개이며 `/owner`에서 소유 매장과 작성 중 초안을 확인한다. 이미 사장님(owner)인 계정의 로그인·세션·유형은 유지하며 추가 첫 설정을 요구하지 않는다. 사장님에게 닉네임을 만들지 않으며 표시에 이름을 사용할 수 있다. 기존 닉네임은 보존한다. 확정된 유형 변경과 기존 닉네임 변경은 이 API에서 허용하지 않는다. 이용 유형은 매장 접근 권한이나 모임·행사 소유권을 부여하지 않는다.

첫 설정 완료 여부는 accountType과 nickname으로 판단한다. 중단한 사용자는 다시 로그인할 때 누락된 단계로 이어지고, 설정한 사용자는 원래 next로 돌아간다. 공개 홈은 그대로 접근할 수 있고 개인 업무 진입점에서 필요한 설정을 안내한다. 로그인 실패로 처리하거나 모든 공개 페이지를 막지 않는다. `/getting-started`의 next는 안전한 내부 경로만 보존하고 중첩 설정 경로는 제거한다.

총무의 정기 모임/일회성 행사 선택은 시작 안내용 UI 상태다. 서버 권한·영구 유형·완료 상태로 저장하지 않는다. 각 환영 화면에서 `/groups/new` 모임 등록 또는 `/events` 행사로 연결하며 나중에 시작하기는 원래 next로 돌아간다. next가 없는 새 시작은 홈(`/`)으로 돌아온다. 모임 생성과 명단 등록은 모두 선택이다. `/onboarding`은 `/getting-started`로 이동하는 이전 링크다. 사장님은 `/owner/register`에서 등록하고 총무용 명단을 요구하지 않는다. 매장 관리는 세션 계정과 `ownerAccountId`를 확인하며, 문자 답변 링크는 계정과 별개로 해당 문의 대상만 허용한다. 카카오 가입도 동일한 첫 설정으로 이어진다.

`/start`는 가입·로그인과 비로그인 둘러보기 확인창을 제공하고 `/intro`는 현재 제공 기능을 소개한다. 공개 홈의 둘러보기에는 개인 데이터 접근 권한이 없다. `이미 계정이 있어요`에서 카카오를 선택해도 서버 결과가 signup이면 추가 정보·약관·필수 인증을 완료해야 계정이 생성된다. 카카오 아이콘은 기존 이미지의 흰 모서리를 원형으로 잘라 표시한다. 중복 이메일·카카오 인증 오류·비밀번호 변경 완료는 공용 Dialog의 포커스·Escape 처리를 사용하는 알림창으로 안내한다.

## 모임과 기본 명단 등록

첫 설정과 홈의 모임 만들기는 같은 `/groups/new` 화면을 사용한다. 모임 이름은 필수, 유형은 선택(최대 40자)이다. 명단은 직접 입력·붙여넣기·UTF-8 TXT(최대 128KB)로 가져오며 최대 500명이다. 한 줄에 한 명, 이름과 선택적인 전화번호 뒤 4자리를 탭으로 구분한다. 미리보기에서 수정·행 제외·추가할 수 있다. 이름은 최대 100자이고 뒤 4자리는 문자열로 저장해 앞의 0을 보존한다. 새 동명이인은 총무가 확인하고 선택적인 구분 표시(최대 40자)와 함께 별도 ID로 저장하며 자동 병합하지 않는다. 구분 표시는 이름과 별도로 저장한다. 잘못된 행은 수정하거나 명시적으로 제외해야 한다. 원문을 바꾸지 않고 앞뒤로 이동하면 미리보기 편집과 제외 결과를 유지하며, 붙여넣기 후 직접 추가도 하나의 명단으로 저장한다.

명단 없이 만든 모임도 마이페이지의 해당 모임 명단에서 구성원을 추가할 수 있다. 최초 등록과 같은 입력·미리보기를 사용하며 기존 이름과 겹치면 기존 구성원 확인 또는 새 동명이인 등록을 선택한다. 기존 구성원 확인은 추가·수정을 하지 않고, 새 동명이인의 구분 메모는 선택이다. 서버는 모임 소유권을 검사하고 기존 구성원의 ID·정보를 보존한 채 새 행만 추가한다. 동일 requestKey로 재시도해도 한 번만 추가한다.

`POST /api/v1/groups`는 `{ name, groupType?, creationKey?, members?: [{ name, phoneLast4? }], duplicatesConfirmed? }`를 받는다. 웹은 화면의 동일한 등록에 UUID creationKey를 재사용한다. 모임·명단을 같은 트랜잭션에 저장하고 소유자/creationKey 고유 제약으로 동시 재시도를 한 번만 생성한다. 이미 성공한 키로 다른 입력을 보내면 409다. 응답을 받지 못한 경우에는 같은 입력으로 재시도하거나 홈에서 결과를 확인한다. 단계 간 뒤로 가기는 입력·미리보기 수정을 유지한다. 화면 자체를 떠나거나 새로고침하면 저장하지 않은 입력은 사라지며 브라우저 이탈 경고를 제공한다. 개인정보를 브라우저 영구 저장소에 저장하지 않는다.

`GET /api/v1/groups`와 상세 응답은 groupType/memberCount를 포함한다. `GET /api/v1/groups/:id/members`는 인증된 소유자만 조회할 수 있고 다른 계정에는 404를 반환한다. 기본 명단에 구성원을 추가해도 계정이나 조회 권한은 생기지 않는다. 행사 소유자가 모임 행사에서 ‘모임 명단 가져오기’를 선택하면 행사 명단에 복사한다. 홈 상단의 모임 선택창에는 모임 없는 단기 행사도 함께 표시하며, 행사 이름을 선택하면 해당 상세로 이동한다. 저장된 명단은 선택한 모임의 마이페이지에서 확인한다. 캘린더·모임 기록·매장 등록은 준비 중으로 표시한다.

`1795046400000-GroupRoster`는 기존 모임에 nullable 유형·재시도 식별자/해시를 추가하고 group_members를 생성한다. 기존 계정·모임·행사 ID와 데이터는 보존한다. API 빌드 → 대상 DB 확인 → `pnpm --filter @chongmuya/api db:migration:show` → `pnpm --filter @chongmuya/api db:migration:run` → 새 API/웹 실행 순서다. 새 환경변수는 없다. 명단·유형·재시도 데이터가 있으면 down은 거부하며 데이터 보존을 위한 후속 migration으로 수정한다.

Figma의 명단 필수처럼 보이는 화면에는 건너뛰기를 추가하고, 예시 인원·동명이인 경고는 실제 입력으로 계산한다. 비로그인 행사 참여·예약 등 미제공 기능을 사용할 수 있다는 문구는 현재 공개 범위로 보완했다. 비어 있는 소개 프레임은 기존 토큰과 에셋으로 현재 기능을 설명한다. 약관은 아래의 수정 가능한 초안을 사용한다.

## 가입 입력과 약관

가입 입력은 `{ email, password, name, phone, emailVerificationId, phoneVerificationId, consents: [{ id, version, accepted }] }`이다. 이메일은 정규화 후 형식·중복과 소유 인증, 휴대폰은 010으로 시작하는 11자리 번호와 Octomo 인증이 필수다. 이름과 총무 닉네임은 별개이며 닉네임·전화번호 고유성 제약은 없다. 이메일·비밀번호만 보내거나 서버 결정 필드를 덧붙인 요청은 거부한다. `GET /signup/terms`의 네 식별자·버전이 정확히 일치해야 하고 serviceTerms/privacyCollection/privacyPolicy는 필수, marketing은 선택이다. 동의와 비동의를 모두 서버 시각과 함께 account_consents에 저장한다.

약관에 성공 데이터가 있으면 배경 재조회 실패로 가입 폼을 제거하지 않는다. 재시도 안내를 함께 표시하고 입력·단계·동의·인증을 유지한다. 실제 버전 또는 필수 여부가 변경된 항목만 동의를 해제하고 약관 단계로 돌아간다. 다른 입력과 인증 상태는 유지하며 버전으로 전체 폼을 remount하지 않는다.

약관은 `utils/signup-terms.ts`의 수정 가능한 한국어 초안(`draft-2026-11-18`)을 제공한다. 본문 화면에 초안임을 표시하며 가입을 차단하지 않는다. 확정 후 본문과 버전을 함께 변경하거나 `SIGNUP_TERMS_JSON`에 네 항목의 `{ id, version, url }` 배열을 설정해 HTTPS 원문으로 연결한다. 운영자·문의처, 보유 기간과 삭제 절차, 위탁·제공 여부 등 실제 운영에 해당하는 내용을 공개 전 확정해야 한다. 초안이 법률 검토를 거친 최종 문서임을 의미하지 않는다.

## 이메일 인증

`ResendMailService`는 메일 발송만 담당하고 Resend SDK는 API에만 설치한다. `EmailVerificationService`가 가입 목적의 코드 발급·확인·취소·소비와 제한을 담당한다. `EMAIL_VERIFICATION_SECRET`으로 요청자 해시·정규화 이메일·요청 ID·signup 용도·코드를 HMAC-SHA256으로 묶고 constant-time 비교한다. DB에는 6자리 코드 원문이나 단순 코드 SHA 해시를 저장하지 않는다.

서버 상수 `EMAIL_LIMITS`는 암호학적 6자리 숫자 코드, 유효기간 10분, 재전송 간격 60초, 요청당 오답 5회를 정한다. 발급은 15분 동안 이메일·요청자 각 5회/IP 30회, 확인은 이메일·요청자 각 20회/IP 100회다. 확인 제한에는 성공·실패 요청이 모두 포함된다. 누적 제한은 별도 커밋된 auth_attempts 행에 있어 코드 재발급이나 검증 롤백으로 초기화되지 않는다.

발급 행의 delivery는 sending/sent/failed로 구분한다. 발송 성공은 소유 인증 성공이 아니다. 동일 발급 건의 통신 재시도는 같은 Resend idempotency key와 본문을 사용하며 각 4초, 최대 2회로 제한한다. 명시적 재전송은 새 ID·코드로 이전 요청을 교체한다. 외부 발송 동안 트랜잭션·행 잠금을 유지하지 않으며 발송 후에도 현재 요청·취소 상태를 재확인한다. 발송 실패 응답의 status=failed를 화면에서 실패로 표시하며 코드 확인을 제공하지 않는다. 키 미설정은 503이다. RESEND_DEBUG=true는 시작 시 거부해 SDK의 원문 디버그 출력이 활성화되지 않게 한다.

서버가 올바른 코드를 확인한 시각을 verifiedAt으로 기록한다. 다른 요청자/이메일, 이전 코드·ID, 만료·취소·소비한 요청은 거부한다. 이메일 수정은 이메일 인증만, 전화번호 수정은 휴대폰 인증만 취소한다. 실제 화면 이탈 시 요청을 중단하고 늦은 응답을 무시한다. 메일 앱·문자 앱을 열어도 화면이 유지되는 동안 입력과 인증 기한은 유지되며, 전체 새로고침 후 비밀번호·인증을 영구 저장소에서 복원하지 않는다.

## 휴대폰 인증과 가입 요청자

`OctomoService`는 [Octomo 공식 API](https://octomo.octoverse.kr/api-docs/) 통신만, `PhoneVerificationService`는 가입 목적의 발급·기한·횟수·소비 규칙을 담당한다. 서버만 OCTOMO_API_KEY를 사용한다. POST `/signup/context`가 32바이트 난수 HttpOnly/SameSite=Strict 요청자 쿠키를 설정하며 DB에는 해시만 남긴다. production 이름은 `__Host-signup-requester`, 로컬은 `signup-requester`이고 30분 유지한다. 쿠키 설정도 CSRF 검사를 통과해야 한다. 유효한 기존 쿠키는 교체하지 않는다. 두 인증이 동시에 시작할 때 SessionClient의 단일 요청과 탭 간 잠금으로 쿠키 초기화를 공유한다.

인증 요청마다 새 UUID와 AUTH_SECRET 기반 HMAC 난수 문구를 만들고 요청자·번호·signup 용도에 묶는다. 문구 원문은 DB에 저장하지 않는다. 재발급은 같은 요청자의 이전 ID를 교체한다. 기한은 발급부터 5분, 재발급 간격은 60초다. 발급 시도는 15분 동안 요청자/번호 각 5회, 요청 IP 30회로 제한한다. 결과 확인은 10초 간격, 요청당 최대 12회이고 자동 무한 polling을 하지 않는다.

모바일에서는 수신 번호 16663538과 본문이 채워진 문자 앱을 열고 직접 전송한다. 데스크톱은 인증 요청 직후 Octomo가 생성한 QR을 바로 보여주며 휴대폰 카메라로 스캔한다. 터치 기기에서는 문자 앱 열기를 우선 표시한다. 번호·본문은 ‘번호·문구 직접 확인’을 펼쳐 확인하고 입력할 수도 있다. ‘인증 결과 확인’을 누르면 Nest가 Octomo의 `/message/exists`에 mobileNum/text/withinMinutes=5를 보내 수신 여부를 확인한다. 클라이언트의 verified 값은 받지 않는다. Octomo는 수신 시각을 반환하지 않으므로 phoneVerifiedAt은 서버가 수신 사실을 처음 확인한 시각이다.

외부 조회 전 짧은 트랜잭션에서 확인 횟수를 예약하고, 외부 응답 뒤 다시 잠가 현재 ID·번호·기한·취소 상태를 확인한다. 외부 API 응답을 기다리는 동안 DB 트랜잭션을 유지하지 않는다. 가입 트랜잭션에서 유효한 인증을 잠그고 한 번 소비한다. 만료·번호 불일치·취소·재발급 전 ID·이미 소비한 결과는 거부한다. 화면 이탈/번호 변경은 요청 취소와 지연 응답 무시를 함께 적용한다. 서버 기한에 단조 증가 경과 시간을 더해 표시하며 임의로 기한을 연장하지 않는다.

비밀번호·이메일 코드·인증 문구·QR·인증 요청 ID는 폼과 현재 화면 메모리에만 둔다. TanStack mutation에는 비밀값을 variables/data로 넣지 않으며 gcTime=0, retry=false를 적용한다. 브라우저 영구 저장소를 사용하지 않는다. 약관만 공개 Query로 조회한다. 개발 전용 `/dev/auth`의 모의 화면은 실제 가입 경로와 분리되며 production에서는 제공하지 않는다.

## 세션 저장과 경쟁 조건

`accounts` → `auth_sessions` → `refresh_tokens` 구조이며 로그인마다 독립 세션을 만든다. 각 토큰의 사용 시각을 남겨 과거 토큰 재사용을 탐지한다. 현재 기기의 로그아웃은 해당 세션만 폐기한다.

가입 즉시 로그인되므로 이메일·휴대폰 인증 결과 소비·신규 계정·약관별 동의 기록·세션·최초 Refresh 해시 삽입과 Access 서명은 한 DB 트랜잭션에서 완료한다. 세션/Refresh 저장 또는 서명이 실패하면 계정까지 롤백하고 쿠키를 보내지 않는다. 비밀번호 해싱은 트랜잭션 밖에서 수행해 DB 연결을 오래 점유하지 않는다. 이메일 중복은 DB unique 제약과 insert 충돌 처리로 409를 반환하며, 동시 가입도 하나의 계정·세션·Refresh만 남긴다. 로그인 시도 제한 기록은 보안상 실패한 가입 트랜잭션과 별개로 유지한다.

갱신은 트랜잭션에서 **세션 행 잠금** → 토큰 재조회 → 기존 토큰 사용 처리 → 새 토큰 해시 삽입 순서다. 사용된 토큰이 다시 들어오면 전체 세션을 폐기하고, 폐기 트랜잭션을 커밋한 뒤 401을 반환한다. 로그아웃도 같은 세션 잠금을 사용하며 과거 토큰으로도 그 세션을 폐기할 수 있다. Access 검증마다 세션 활성 상태를 확인하므로 JWT의 남은 수명과 무관하게 폐기가 반영된다.

재사용은 엄격하게 거부한다. 같은 Refresh를 직접 동시에 보내면 하나만 성공하고 재사용 요청이 세션을 폐기한다. 정상 웹은 single-flight와 탭 간 Web Locks로 이를 예방한다. Web Locks가 없는 브라우저에서는 탭 내 중복 방지만 가능하다. 갱신 결과가 네트워크에서 유실된 뒤 옛 토큰을 다시 쓰는 경우에도 세션 폐기로 이어질 수 있어 재로그인이 필요하다. 일시 장애 자체를 클라이언트가 세션 무효화로 해석하지는 않는다.

시도 제한은 DB upsert로 15분 고정 창 동안 이메일당 10회, 요청 IP당 50회(가입·로그인 합산)를 적용한다. 알 수 없는 계정도 동일 비용의 비밀번호 연산을 수행한다. IP 기준은 Express의 `request.ip`다.

만료 세션과 사용된 Refresh 이력은 만료 전 삭제하지 않는다. 운영 전 만료 세션(자식 토큰 cascade)과 오래된 시도 제한 행을 정리하는 보존·청소 작업을 추가해야 한다. 세션 정리 작업은 유효한 Refresh 재사용 감지 이력을 지우면 안 된다.

### 배포 전 IP 제한 설정

`TRUST_PROXY_HOPS`는 모든 환경에서 기본 `0`이다. 이때 Express는 소켓 상대 주소를 사용한다. 운영에서는 `https://chongmuya.com`의 브라우저가 `https://api.chongmuya.com`을 호출하고, EC2 호스트의 Nginx가 Docker 내부 Nest API로 전달한다. Cloudflare는 DNS only이며 Docker 포트 전달을 포함해 이 경로의 HTTP 프록시는 Nginx 한 단계다.

1. Nest는 컨테이너의 네트워크 인터페이스에서 3001을 수신한다. Docker는 호스트에 `127.0.0.1:3001:3001`로만 공개하고 EC2 보안 그룹에서 외부 3001 인바운드를 차단한다. 같은 Docker 네트워크의 컨테이너는 API에 직접 접속할 수 있으므로 신뢰하는 컨테이너만 연결한다.
2. Nginx에서 `api.chongmuya.com`에 대해 아래 설정을 적용하고, 다른 Host의 요청은 이 upstream으로 라우팅하지 않는다. Nginx가 소켓 상대 주소, 수락한 호스트와 접속 스킴으로 전달 헤더를 덮어쓴다. 클라이언트의 헤더를 그대로 넘기거나 `$proxy_add_x_forwarded_for`로 체인을 이어 붙이지 않는다.

   ```nginx
   location / {
       proxy_pass http://127.0.0.1:3001;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $remote_addr;
       proxy_set_header X-Forwarded-Host $host;
       proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```

3. API에 `TRUST_PROXY_HOPS=1`을 명시한다. 숫자 한 단계 신뢰는 직접 연결한 상대가 전달한 주소를 채택하므로, 프록시 인증과 우회 접근 차단은 네트워크 구성에 의존한다. **외부 직접 접근 차단과 Nginx의 헤더 덮어쓰기**가 모두 필요하다. 구 `TRUSTED_PROXY_CIDRS`는 실행 환경과 환경변수 파일에서 제거한다.

첫 배포에서는 외부 네트워크에서 호스트의 3001 포트가 차단되는지 확인한다. 서로 다른 공인 IP에서 HTTPS로 API를 호출해 실제 사용자 IP별로 요청 제한이 집계되고, 클라이언트가 전달 헤더를 보내도 결과가 바뀌지 않는지 확인한다. 저장소의 로컬 HTTP 프록시 테스트는 이 배포 확인과 별개다. Cloudflare 프록시를 켜거나 CDN·ALB를 추가하면 경로와 헤더 처리, 신뢰 설정을 다시 검토한다.

공식 문서는 [Express 프록시 설정](https://expressjs.com/en/guide/behind-proxies/), [NestJS 요청 제한](https://docs.nestjs.com/security/rate-limiting), [Docker 포트 공개](https://docs.docker.com/engine/network/port-publishing/)를 참고한다.

## 프론트 생명주기

- 최초 `POST /session/restore`: 유효 Access는 그대로 사용, 없거나 만료되면 Refresh를 회전한다. 세션 없음/무효는 200 `{ authenticated:false, account:null }`. DB/통신 장애는 확인 불가 상태이며 비회원으로 단정하지 않는다.
- 인증 요청: `ACCESS_EXPIRED`만 갱신 대상. 한 Provider의 Promise를 공유하고 같은 출처 탭 간 Web Lock을 사용한다. 잠금을 얻은 뒤 `/me`를 재확인하여 다른 탭이 이미 갱신한 경우 추가 rotation을 피한다. 늦게 도착한 만료 응답은 revision으로 구분한다. 원 요청은 같은 계정일 때만 한 번 재시도한다. `/me` 또는 `/refresh`에서 확인한 계정을 먼저 현재 상태에 반영한다. 계정 ID가 바뀌면 generation을 올리고 사용자 캐시를 정리하므로 이전 계정에서 시작한 모든 대기 요청은 자동 재시도하지 않는다. 새 계정은 로그인 상태로 유지하며, 이전 요청의 종료 오류가 새 세션을 무효화하지 않는다. 갱신 중 로그아웃/다른 복원이 발생했다면 늦은 응답도 반영하지 않는다.
- `SESSION_INVALID`: 사용자 캐시 취소·삭제와 세션 종료. 네트워크/타임아웃/5xx는 로그인 정보를 보존하고 재시도 UI를 제공한다. 403은 권한 실패이며 갱신하지 않는다.
- 로그아웃: generation을 올리고 사용자 캐시를 즉시 정리하며 진행 중 복원/갱신/가입·로그인을 기다린 뒤 서버 폐기 요청을 보낸다. 오래된 요청은 결과를 적용하지 못한다. 실패하면 `logout-failed` 상태로 남아 **로그아웃 다시 시도**만 제공하고 자동 복원을 막는다. 동작하지 않는 연결 재확인 버튼은 표시하지 않는다. 일반 복원 통신 장애는 `unavailable` 상태에서 **연결 재확인**으로 세션 복원을 다시 요청한다. `logging-out`은 진행 표시만 제공한다.
- `user`로 시작하는 Query key는 사용자 전용이다. 해당 Query를 취소·삭제하고 mutation cache도 정리한다. health 같은 공개 Query는 유지한다. 로그인·로그아웃은 BroadcastChannel로 다른 탭의 재확인을 요청한다.
- 첫 설정 저장 성공은 프로필 revision을 증가시킨다. restore/me/refresh는 조회 시작 시의 revision과 비교해 같은 계정의 오래된 프로필로 저장 결과를 덮지 않는다. 로그인·로그아웃·계정 전환의 generation과 토큰 갱신 revision은 별도로 유지하므로 다른 계정·세션 폐기는 반영하고 정상 요청 재시도도 보존한다.
- 인증 상태는 Query cache와 분리하고 Provider 인스턴스에 둔다. 서버 프로세스 전역에 사용자 상태를 두지 않는다. 폼은 React Hook Form과 Zod, 공용 입력·오류 UI를 사용한다.

## 비밀번호 재설정

`/auth/recovery`에서 이메일을 제출하면 “재설정 가능한 계정이면 안내 메일을 보내드려요”라고 안내한다. 존재하는 이메일 비밀번호 계정, 없는 계정, 카카오 전용 계정 모두 `202 { accepted: true }`다. 이메일별 제한·재전송 대기·발송 실패도 같은 응답이다. IP별 과도한 요청은 계정 유무와 무관하게 429다. 발송을 응답 경로에서 분리하고 최소 400ms와 0~99ms 무작위 지연을 적용해 계정 조회/발송 시간 차이를 완화한다. 네트워크·DB 부하까지 일정하게 만드는 보장은 아니다.

토큰은 32바이트 난수이며 DB에는 목적 접두사를 포함한 SHA-256 해시만 저장한다. 링크는 신뢰한 WEB_ORIGIN의 `/auth/reset-password?next=...#token=...`로 만든다. fragment는 HTTP/Referer에 실리지 않으며 화면이 읽은 즉시 history.replaceState로 제거한다. 페이지는 no-store/no-referrer/noindex이고 링크·비밀번호는 화면 메모리에만 둔다. 새로고침하면 원래 메일 링크를 다시 열어야 한다. signup-requester 쿠키가 없어도 사용할 수 있다. 로그인 → 재설정 요청 → 메일 링크 → 완료 후 로그인까지 safeReturnPath로 검증한 next를 유지한다. 발송 API도 next를 별도로 검증하며 외부 URL·인증 경로는 `/events`로 대체한다. URL 정리는 토큰만 제거하고 검증한 next는 보존한다. GET과 POST check는 소비하지 않고 최종 confirm POST만 소비한다.

`RESET_POLICY`의 기한은 15분, 재전송 간격은 60초다. 15분 창에서 이메일 발급 5회/IP 발급 30회, 확인 IP 60회, 저장 IP 20회, 토큰별 확인·저장 각각 10회다. 재발급은 이전 링크를 무효화하고 계정 잠금으로 동시 발급을 직렬화한다. 같은 메일 건의 통신 재시도는 동일 Resend idempotency key를 사용한다. ResendMailService의 기존 from/replyTo·제한된 재시도를 재사용하며 외부 발송 중 DB 잠금은 없다. 발송은 프로세스 내 best effort이므로 발송 직전 프로세스가 종료되면 메일이 도착하지 않을 수 있다. 별도 큐는 없으며 사용자는 대기 후 다시 요청한다. `sending`·`failed` 결과는 재설정 권한이 아니다.

최종 저장은 계정 잠금 이후 토큰을 다시 확인하고 scrypt 비밀번호 변경·토큰 소비·남은 링크 무효화·그 계정의 모든 AuthSession 폐기·연결용 재인증 무효화를 같은 트랜잭션에서 처리한다. 기존 Access도 세션 검증에서 거부된다. 다른 계정의 세션·쿠키는 건드리지 않는다. 완료 후 자동 로그인하지 않으며 새 비밀번호로 로그인한다. 커밋 후 변경 알림은 비밀번호 없이 보내고 실패가 완료 응답을 바꾸지 않는다. passwordHash가 null인 카카오 전용 계정에는 비밀번호를 만들지 않는다.

## 카카오 로그인·가입·연결

로그인 화면의 카카오 버튼은 이메일 폼 검증과 독립적으로 동작한다. 웹에서 API로 CSRF 보호 POST start → 카카오 인가 → Nest GET callback → WEB_ORIGIN의 `/auth/kakao/complete` → 웹에서 API로 CSRF 보호 POST 확정 순서다. GET 콜백은 회원 세션을 발급하지 않으며 임시 쿠키는 host-only/HttpOnly/SameSite=Lax/15분이다. production에서는 Secure와 `__Host-kakao-browser`를 쓴다. 기존 Strict 가입 요청자 쿠키는 바꾸지 않는다. code/state는 프론트 완료 URL로 전달하지 않는다.

API 전용 openid-client 6.9.0을 사용한다. 고정 issuer `https://kauth.kakao.com`의 discovery, client_secret_post, openid account_email scope, S256 PKCE, state·nonce를 사용한다. ID Token을 필수로 요구하고 enableNonRepudiationChecks로 JWKS 서명 검증을 명시적으로 켠다. RS256·iss·aud·exp·nonce·필수 sub/iat를 검증하며 SDK JWKS 캐시와 키 교체를 사용한다. UserInfo는 고정된 공식 endpoint에서 조회하고 sub 일치를 검사한다. 각 외부 요청은 5초 제한이며 일회용 code 교환을 재시도하지 않는다. 카카오 토큰은 브라우저/DB에 저장하지 않는다.

`kakao_attempts`는 브라우저 해시·목적·state 해시·nonce·암호화한 PKCE verifier·만료·일회 소비를 PostgreSQL에 저장한다. verifier 암호화는 AUTH_SECRET에서 목적별로 유도한 키를 사용하며 교환 시작 후 삭제한다. 재시작·다중 인스턴스에서도 같은 DB와 AUTH_SECRET을 사용한다. 새 시작은 기존 시도를 교체하고 이전 콜백·늦은 취소는 새 시도를 바꾸지 못한다. 실패·거부·설정 누락·기한 초과를 안전한 오류로 구분한다. 임시 인증은 일반 회원 세션이나 업무 권한이 아니다. 가입 도중 서버가 발급한 기한이 지나면 진행 화면을 종료하고 새 카카오 인증 시작 버튼을 제공한다. 서버의 만료·무효 오류에도 재시작할 수 있으며 기한을 연장하지 않는다.

이미 연결된 issuer/sub는 이메일 변경과 무관하게 같은 Account로 로그인하며 프로필을 덮어쓰지 않는다. 미연결 사용자는 약관 → 이름·이메일·Octomo 휴대폰 인증 → 계정·세션 생성 → 완료 → 첫 설정으로 간다. 비밀번호·임의 이름·가짜 이메일은 만들지 않는다. 공식 UserInfo의 email_verified=true이고 사용자가 같은 이메일을 사용할 때만 Resend를 생략한다. ID Token의 email만으로 인증하지 않는다. 미제공·미검증·다른 이메일에는 기존 Resend 인증이 필요하다. email_verification_source는 resend/kakao, emailVerifiedAt은 우리 서버가 실제 확인한 시각이다. 기존 미인증/출처 미상 값은 backfill하지 않는다.

같은 이메일의 기존 계정은 자동 연결하거나 새로 만들지 않는다. 가입할 때 사용한 이메일 또는 카카오로 로그인하도록 안내한다. 비밀번호 없는 계정에 재설정을 해결책으로 제시하지 않는다. 이메일 비밀번호 계정은 로그인 화면에서 필요할 때 비밀번호를 재설정할 수 있으며, 로그인 후 `/mypage`의 카카오 연결에서 현재 비밀번호와 연결 동의를 입력하고 카카오 인증을 다시 진행한다. 연결 증명은 link 목적·인증된 accountId·현재 AuthSession·동의·5분 재인증 기한에 묶는다. Refresh는 재인증이 아니다. 최종 연결은 세션과 증명을 다시 잠가 검사하고 한 번 소비한다. 계정 전환·로그아웃·비밀번호 재설정 뒤의 증명은 거부한다. 동일 연결은 중복 기록을 만들지 않으며 다른 계정의 카카오나 기존 연결의 교체는 거부한다. 연결은 현재 계정·업무 데이터·세션 소유자를 바꾸지 않는다.

최초 가입은 외부 식별자 직렬화 잠금과 동일 트랜잭션 안에서 인증 결과·대기 결과 소비, Account·ExternalIdentity·동의·최초 세션 저장을 처리한다. issuer/sub는 DB 고유 키이며 계정당 issuer 하나다. 기존 SessionClient의 generation/revision/profileRevision, Web Locks, BroadcastChannel과 사용자 캐시 정리를 그대로 사용한다. 비밀번호·OAuth 인가 URL·복구 토큰을 Query 변수/데이터·브라우저 영구 저장소에 보관하지 않는다. Nest 요청 로그는 라우트 경로·requestId와 안전한 오류 분류만 기록하고 콜백 query·토큰을 기록하지 않는다. 운영 API ingress/CDN/APM도 `/api/v1/auth/kakao/callback`의 query·body를 기록하지 않도록 설정해야 한다. 프론트 완료·재설정 화면은 no-store/no-referrer 헤더를 유지한다.

### 카카오 설정과 실제 확인

서버 변수 KAKAO_CLIENT_ID(REST API 키), KAKAO_CLIENT_SECRET, KAKAO_REDIRECT_URI를 함께 설정한다. 모두 없으면 카카오만 503이며 기존 기능은 유지된다. 일부 누락·잘못된 주소는 Zod가 변수 이름만 포함해 시작을 거부한다. KAKAO_REDIRECT_URI는 명시적으로 신뢰하는 공개 API 주소의 `/api/v1/auth/kakao/callback`이다. 사용자 정보·query·fragment 없는 HTTP(S) URL이며 production에서는 HTTPS만 허용한다. 요청 Host/Forwarded로 만들지 않고 WEB_ORIGIN과 일치하도록 강제하지 않는다. 세 변수는 서버 전용이며 NEXT_PUBLIC에는 넣지 않는다.

- 개발: WEB_ORIGIN=`http://localhost:3000`, NEXT_PUBLIC_API_ORIGIN=`http://localhost:3001`, KAKAO_REDIRECT_URI=`http://localhost:3001/api/v1/auth/kakao/callback`.
- 운영 예시: WEB_ORIGIN=`https://chongmuya.com`, NEXT_PUBLIC_API_ORIGIN=`https://api.chongmuya.com`, KAKAO_REDIRECT_URI=`https://api.chongmuya.com/api/v1/auth/kakao/callback`. 웹이 www를 쓰면 WEB_ORIGIN만 정확한 웹 origin으로 맞춘다. 두 호스트는 같은 상위 도메인의 HTTPS여야 하며 저장소가 운영 호스트나 콘솔을 변경하지 않는다.
- 카카오 콘솔에서 앱의 웹 도메인, 카카오 로그인, OpenID Connect, Client Secret, 이메일(account_email) 동의 항목과 위 Redirect URI를 설정한다. 현재 코드는 `openid account_email`을 항상 요청한다. account_email 권한을 받을 수 있는 앱 자격(비즈 앱/개인 개발자 비즈 앱 등)을 갖추고 동의 항목을 사용하도록 설정해야 한다. 앱에 허용하지 않은 scope는 카카오 KOE205 등으로 인가 자체가 막히므로 Resend로 우회할 수 없다. 카카오가 콜백으로 invalid_scope를 반환하면 KAKAO_CONFIGURATION으로, 사용자가 인가를 취소한 access_denied는 KAKAO_CANCELLED로 구분한다. 카카오 오류 화면에서 콜백이 오지 않으면 앱 설정을 고친 뒤 새로 시작한다. 정상 OIDC가 끝났지만 선택 동의를 하지 않았거나 UserInfo 이메일이 없거나 검증되지 않은 경우에는 Resend 인증으로 이어진다. [카카오 동의 항목 설정](https://developers.kakao.com/docs/ko/kakaologin/prerequisite), [KOE205 문제 해결](https://developers.kakao.com/docs/ko/kakaologin/trouble-shooting)을 따른다.
- Resend의 RESEND_API_KEY/RESEND_FROM/RESEND_REPLY_TO와 가입용 EMAIL_VERIFICATION_SECRET, Octomo 키는 기존 설정을 사용한다. 실제 키를 확인하거나 출력하지 않는다.

직접 호출로 전환할 때는 API의 WEB_ORIGIN·KAKAO_REDIRECT_URI와 콘솔 Redirect URI를 먼저 맞추고, 프론트 빌드 환경의 NEXT_PUBLIC_API_ORIGIN을 설정한 뒤 웹을 재빌드·배포한다. production에서 API origin이 없으면 빌드를 중단한다. 이 연결 전환은 DB 스키마 변경이 없으며 기존 migration 상태를 유지한다. 기존 웹 호스트 쿠키는 API 호스트로 자동 이전되지 않으므로 전환 시 재로그인이 필요할 수 있다. Domain 확대나 쿠키 복사로 이전하지 않는다.

설정 후 격리 DB에서 (1) 이메일 계정 복구 메일 요청·다른 브라우저에서 링크 열기·비밀번호 변경·기존 세션 거부·새 로그인, (2) 카카오 취소 후 재시도·신규 약관/이메일/휴대폰 인증·첫 설정, (3) 카카오 재로그인, (4) 기존 이메일 중복 안내·기존 로그인·마이페이지 비밀번호/동의·연결·두 방법의 동일 accountId, (5) 연결 중 다른 탭 로그아웃·복구 후 오래된 완료 거부를 확인한다. SMS는 안내된 수신 번호와 문구를 해당 휴대폰에서 직접 전송해야 한다. 자동 테스트의 메일/SMS/OIDC HTTP 대역은 실제 외부 연동 성공을 의미하지 않는다.

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
| POST /password-reset/request            | 202, 계정 유무와 무관한 접수                   |
| POST /password-reset/check              | 200, 토큰 미소비 확인·기한                     |
| POST /password-reset/confirm            | 204, 비밀번호 변경·세션 폐기                   |
| POST /kakao/start                       | 200, 인가 URL·브라우저 쿠키                    |
| GET /kakao/callback                     | 303, 깨끗한 완료 경로                          |
| POST /kakao/status                      | 200, login/signup/existing/link 상태           |
| POST /kakao/cancel                      | 204, 해당 시도 취소                            |
| POST /kakao/login                       | 200 SessionDto·쿠키                            |
| POST /kakao/signup                      | 201 SessionDto·쿠키                            |
| GET /kakao/connection                   | 200, 본인 연결 상태                            |
| POST /kakao/link/start                  | 200, 비밀번호 재인증·동의 후 인가 URL          |
| POST /kakao/link/confirm                | 200, 현재 계정 연결 확정                       |
| POST /logout                            | 204, 현재 세션 폐기·쿠키 삭제                  |

안전한 오류 규격은 `ACCESS_EXPIRED`, `SESSION_INVALID`, `INVALID_CREDENTIALS`를 보존한다. 입력 오류 400, CSRF/권한 403, 이메일 충돌 409, 시도 제한 429, DB 장애 503을 구분한다. 원문 DB 오류를 노출하지 않는다.

## 실행과 검증

`apps/api/.env.example`의 AUTH_SECRET/WEB_ORIGIN/OCTOMO_API_KEY와 RESEND_API_KEY/RESEND_FROM/EMAIL_VERIFICATION_SECRET을 로컬 `.env`에 설정한다. Resend 세 변수는 함께 설정하며 발신 주소는 검증된 도메인의 주소 또는 `총무야 <account@auth.example.com>` 형식이다. 답장 주소는 RESEND_REPLY_TO로 설정하며 생략 시 support@chongmuya.com을 사용한다. Zod로 이메일 형식을 검증하고 ConfigService를 통해 SDK replyTo에 전달한다. RESEND_FROM 발신 주소는 바뀌지 않는다. 전용 EMAIL_VERIFICATION_SECRET은 AUTH_SECRET과 별도로 `openssl rand -hex 32`로 생성하고 서버 인스턴스들이 같은 값을 사용한다. 서버에서만 읽고 NEXT_PUBLIC로 노출하지 않는다. 세 변수가 모두 없으면 기존 로그인은 가능하지만 이메일 인증 발급은 503으로 실패한다. 일부만 설정하거나 잘못된 발신 주소·짧은 비밀키를 넣으면 API 시작을 거부한다. 키는 값이 있으면 공백 없는 비어 있지 않은 문자열인지 Zod로 검증하며 오류에 원문을 넣지 않는다. 키가 없으면 로그인은 동작하지만 휴대폰 인증 발급은 503으로 실패한다. 약관 외부 URL 설정은 선택이다. 환경변수 변경 후 API를 재시작한다. 기존 DB에는 자동으로 테이블을 만들지 않는다. `1794873600000-EmailVerification`은 이메일 인증 테이블만 추가한다. 기존 계정·모임·행사·세션·미인증 시각을 변경하지 않는다. API 빌드 후 **대상 DB를 확인하고** `pnpm --filter @chongmuya/api db:migration:run`을 명시적으로 실행한다. install/build/start에서는 마이그레이션을 적용하지 않는다.

필수 검사: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`. 격리된 테스트 DB를 지정해 `TEST_DATABASE_URL=... pnpm test:integration`을 실행한다. 업무 통합 테스트가 명시적으로 마이그레이션을 적용하며 임의 이메일 계정을 생성한다. 운영 DB를 지정하지 않는다.

통합 테스트는 회원가입/중복/DTO, 로그인 실패, 쿠키/CSRF, Access 만료·위조·세션 소유 불일치, rotation, 재사용 후 세션 전체 폐기, 동시 갱신, 갱신/로그아웃 경쟁, 절대 만료, 시도 제한, Swagger/로그 비밀정보 제외를 검증한다. 웹 테스트는 bootstrap 중복, 단일 갱신/1회 재시도, 장애와 무효 세션 구분, 로그아웃 경쟁·실패 후 재시도, `/me`·`/refresh`의 계정 변경 시 이전 요청 중단, 늦은 응답 무시, 복구 UI별 버튼 렌더링을 검증한다. 가입 원자성 테스트는 테스트 계정에만 작동하는 PostgreSQL 트리거로 세션/Refresh insert 실패를 각각 유발하여 계정까지 롤백되는지 확인하고 트리거를 제거한 뒤 같은 이메일 재가입을 확인한다. 트리거는 테스트 전용이며 finally에서 제거한다.

## 개인 자원 접근과 화면 복귀

- `/api/v1/groups`는 모임 소유권, `/api/v1/events`는 행사 자체의 소유권으로 조회·수정 범위를 제한한다. 상세에 groupId를 요구하지 않는다. 타인 자원과 존재하지 않는 자원은 같은 404다.
- 생성의 ownerId는 인증 계정에서 정한다. groupId를 지정하면 모임 소유권도 확인한다. 일반 행사 PATCH로 ownerId·groupId를 바꾸지 못한다.
- `/events`는 개인 행사 생성, `/events?group=<id>`는 모임 행사 생성, `/events?event=<id>`는 행사 상세 화면이다. 행사 목록은 홈에 표시한다. 모임 없음과 행사 없음은 정상 상태이며 조회 실패와 구분한다. 모임 관리는 `/mypage?view=groups`에서 선택한다.
- 비로그인 개인 화면의 로그인 링크는 `/auth?next=<내부 경로>`를 사용한다. safeReturnPath는 지원하는 페이지와 유효한 UUID query만 허용한다. 외부 URL·인증/API 경로는 `/events`로 대체하며 로그인 후 원래 요청한 화면으로 돌아간다. 클라이언트의 화면 보호는 API 권한 검사를 대체하지 않는다.
- 사용자 Query key는 `user / accountId` 범위를 유지하고 상세는 `events / detail / eventId`로 식별한다. 행사 생성은 내 행사·해당 모임 목록과 상세를 갱신한다. 계정 전환·로그아웃·화면 이탈 후 늦은 응답을 반영하지 않는다.

API 입력·응답·캐시·fieldErrors의 정확한 형식과 migration 적용·복구 제한은 [아키텍처](architecture.md)를 따른다. 입력 오류는 허용된 필드에, 업무 오류는 폼 전체에 표시하며 작성한 입력을 유지한다. 서버의 임의 message는 출력하지 않는다.

실제 외부 인증 검증은 Resend 발신 도메인 확인과 발송 가능한 수신 주소를 준비한 뒤 격리 DB를 지정한 개발 서버에서 `/auth/signup`을 열고 약관 동의·정보 입력 → 이메일 코드 발송·입력·확인 → 휴대폰 인증 요청 → 해당 번호의 휴대폰에서 안내된 문자를 직접 전송 → 결과 확인 → 가입 완료 → 이용 유형·총무 닉네임 설정 순으로 진행한다. 가입 후 새로고침 세션 복원과 로그아웃·로그인을 확인한다. 자동 통합 테스트에서는 외부 메일·SMS 공급자는 테스트 대역을 사용하고 실제 HTTP·PostgreSQL 트랜잭션으로 검증한다. 실제 메일과 문자를 보내지 않은 테스트를 실인증 성공으로 취급하지 않는다.

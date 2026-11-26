# 인증

계정 인증과 업무 자원 권한은 별개다. 모임·행사는 현재 관리자를, 사장님 기능은 계정 유형과 매장 소유권을 서버에서 확인한다. 인수인계와 개인 자료의 경계는 [아키텍처](architecture.md#업무-소유권)를 따른다.

## 세션·쿠키·CSRF

- `JwtAccessStrategy`는 Passport JWT로 서명·알고리즘·issuer·audience·만료·필수 claim과 현재 세션을 검사한다. Controller는 `AccessGuard`와 `@CurrentUser()`를 사용하고 사용자 ID 입력을 인증 근거로 삼지 않는다.
- Access JWT는 5분, Refresh 세션은 로그인부터 절대 14일이다. Refresh는 32바이트 난수이며 SHA-256 해시만 DB에 저장한다. 비밀번호는 salt와 버전이 있는 scrypt 해시로 저장한다.
- 이메일은 trim/lowercase 후 unique를 검사한다. 비밀번호는 공백 없는 ASCII 8~16자이며 trim하지 않는다. 비밀번호·JWT·Refresh를 응답 JSON·로그에 넣지 않는다.
- Access/Refresh 쿠키는 HttpOnly·SameSite=Lax·Path=/·Domain 생략이다. production은 Secure와 `__Host-access`/`__Host-refresh`, 로컬 HTTP는 `access`/`refresh`를 사용한다. 삭제도 같은 옵션을 쓴다.
- 웹과 API는 같은 상위 도메인의 HTTPS 주소를 사용한다. API 호스트의 쿠키는 Next 서버로 전달하지 않고 브라우저가 `credentials: include`로 직접 요청한다. 로컬은 웹/API 모두 `localhost`로 통일한다.
- 변경 요청은 정확한 `Origin === WEB_ORIGIN`과 `X-CSRF-Protection: 1`을 요구하며 cross-site Fetch Metadata를 거부한다. CORS는 해당 origin만 허용한다. OPTIONS는 Guard 전에 처리한다. SOLAPI 웹훅은 별도 서명 검증을 사용하는 예외다.
- OAuth GET callback은 임시 결과만 저장한다. 세션 발급·가입·연결 확정은 허용된 웹에서 보내는 CSRF 보호 POST로 처리한다.

## 세션 경합과 브라우저 복구

`accounts → auth_sessions → refresh_tokens`이며 로그인마다 독립 세션을 만든다. 갱신은 계정·세션 잠금 안에서 기존 Refresh를 사용 처리하고 새 해시를 저장한다. 사용된 Refresh 재사용은 해당 세션 전체를 폐기한 뒤 401을 반환한다. Access도 매 요청 세션 활성 여부를 확인한다. 현재 기기 로그아웃은 해당 세션만 폐기한다.

정상 웹은 SessionClient의 single-flight와 탭 간 Web Locks로 중복 갱신을 줄인다. Web Locks 미지원에서는 탭 내 보호만 가능하다. 갱신 응답 유실 후 옛 Refresh를 재사용해 세션이 폐기되면 재로그인이 필요하다.

| 상황                         | 처리                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| 최초 `POST /session/restore` | 유효 Access 사용 또는 Refresh 회전. 무효/없는 세션은 정상 비회원 결과                  |
| `ACCESS_EXPIRED`             | 잠금 후 `/me` 재확인, 필요한 경우 갱신하고 같은 계정의 원 요청만 1회 재시도            |
| `SESSION_INVALID`            | 사용자 Query 취소·제거, 세션 종료                                                      |
| 통신·DB 장애                 | 인증 확인 불가로 표시하고 입력·기존 상태 유지. 비회원으로 단정하지 않음                |
| 로그아웃 실패                | 자동 복원을 막고 로그아웃 재시도 제공                                                  |
| 계정 전환·로그아웃           | 이전 요청·캐시 폐기, 다른 탭은 현재 쿠키로 다시 확인, 직접 로그아웃하면 `/auth`로 이동 |
| 프로필 저장 후 늦은 조회     | profileRevision으로 과거 응답이 저장 결과를 덮지 못하게 함                             |

Refresh·Access·비밀번호·인증 코드·OAuth URL은 Query 캐시나 브라우저 영구 저장소에 넣지 않는다. 탭 사이에 쿠키가 먼저 변경될 수 있으므로, `X-Expected-Account`를 보낸 보호된 요청과 로그아웃은 서버가 확인한 계정과 다르면 `409 SESSION_CHANGED`를 반환한다. 웹은 현재 세션을 재확인하며 실패한 요청을 재실행하지 않는다. 로그인 복귀 경로는 `safeReturnPath`의 내부 경로·UUID allowlist를 따른다. 복귀 경로 없이 로그인하면 계정 유형과 첫 설정 상태에 맞는 화면으로 이동한다.

## 가입·첫 설정·프로필

이메일 가입은 약관 → 정보·이메일/휴대폰 인증 → 계정·세션 생성 순서다. `EmailVerificationService`와 `PhoneVerificationService`가 발급·제한·검증·소비를 관리하고 Resend/Octomo 어댑터는 외부 통신을 맡는다. 외부 응답을 기다리는 동안 DB 잠금을 유지하지 않는다.

가입 요청자 쿠키는 HttpOnly·SameSite=Strict·30분이며 두 인증을 같은 요청자에 묶는다. 이메일은 HMAC으로 보호한 6자리 코드, 휴대폰은 요청자·번호·목적에 묶은 문구를 사용한다. 메일 발송 성공과 문자 전송 안내만으로 인증 완료를 인정하지 않는다. 만료·취소·번호/이메일 불일치·이미 소비한 증명은 거부한다. 세부 기한·횟수는 [auth 소스](../apps/api/src/modules/auth/)의 정책 상수와 테스트를 기준으로 한다.

인증된 두 증명의 소비, 계정·약관 동의·최초 세션·Refresh 저장은 같은 트랜잭션이다. 실패하면 계정 생성도 롤백한다. 가입 시도 제한은 별도로 보존한다. 약관 배경 조회 실패는 작성 중 폼을 제거하지 않고, 약관 버전 변경은 해당 동의만 다시 받는다.

이메일·카카오 가입으로 생성된 계정은 첫 설정에서 사장님(`owner`) 또는 총무(`organizer`)를 선택하고 확인한다. 유형이 비어 있는 기존 계정도 첫 설정에서 선택한다. 유형을 확정한 총무는 닉네임을 설정하고 사장님은 매장 등록을 시작할 수 있다. 확정한 계정 유형은 변경할 수 없으며, 사장님 기능의 매장 소유권 검사는 별도로 적용한다.

일반 프로필 수정은 첫 설정과 별도 API다. 연락처 변경 증명은 `phone_change` 목적·계정·현재 세션·번호에 묶고 검증 후 원자적으로 소비한다. 계정 번호를 바꿔도 과거 문의·예약·매장 담당자 스냅샷을 바꾸지 않는다.

## 비밀번호 복구·카카오

`/auth/recovery`는 존재하지 않는 계정·카카오 전용 계정도 동일한 접수 응답을 반환한다. 복구 링크는 신뢰한 WEB_ORIGIN의 URL fragment에 토큰을 넣으며 화면에서 읽고 제거한다. 토큰은 15분 유효하고 새 발급은 이전 링크를 무효화한다. 최종 저장 시 계정 잠금 안에서 비밀번호 변경·토큰 소비·남은 링크 무효화·해당 계정 모든 세션 폐기를 함께 처리한다. 완료 후 자동 로그인하지 않으며 카카오 전용 계정에 비밀번호를 만들지 않는다.

카카오는 POST 시작 → 외부 인가 → Nest GET callback → 웹 완료 화면 → POST 확정 순서다. 서버에서 OIDC 서명·issuer·audience·만료·state·nonce·PKCE와 UserInfo의 sub를 검증한다. 카카오 토큰은 브라우저·DB에 저장하지 않는다. 콜백 query는 웹 완료 URL·로그로 전달하지 않는다.

연결된 issuer/sub는 같은 계정으로 로그인한다. 미연결 사용자는 약관·이름·휴대폰 인증을 완료해야 가입되며, 공식 UserInfo의 검증된 이메일을 그대로 사용할 때만 이메일 코드 인증을 생략한다. 같은 이메일의 기존 계정을 자동 연결하지 않는다. 기존 이메일 계정의 연결은 로그인한 세션·현재 비밀번호 재인증·동의·카카오 확인을 요구한다. 로그아웃·계정 전환·비밀번호 재설정 뒤의 오래된 연결 증명은 거부한다.

## 외부 인증 설정

기준 파일은 [API 환경 예제](../apps/api/.env.example)와 [환경 검증](../apps/api/src/config/environment.ts)이다. 아래 값은 API 전용이며 `NEXT_PUBLIC_*`로 노출하지 않는다.

| 설정                                                           | 조건                                                                                                |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`, `WEB_ORIGIN`                                    | 필수. 비밀키 32자 이상, 경로·끝 슬래시 없는 웹 origin. 운영은 HTTPS                                 |
| `RESEND_API_KEY`, `RESEND_FROM`, `EMAIL_VERIFICATION_SECRET`   | 셋을 함께 설정하거나 모두 생략. 메일 발신 도메인 검증 필요. 인증 비밀키는 AUTH_SECRET과 별도로 관리 |
| `RESEND_REPLY_TO`                                              | 선택, 기본 `support@chongmuya.com`                                                                  |
| `OCTOMO_API_KEY`                                               | 휴대폰 인증에 필요. 없으면 발급은 503이며 기존 로그인은 사용 가능                                   |
| `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`, `KAKAO_REDIRECT_URI` | 셋을 함께 설정하거나 모두 생략. 없으면 카카오 기능은 503                                            |

카카오 callback은 API의 `/api/v1/auth/kakao/callback`이다. 로컬 예시는 `http://localhost:3001/api/v1/auth/kakao/callback`이며 운영은 HTTPS다. 요청 Host로 callback을 만들지 않는다. 카카오 콘솔의 Redirect URI·OIDC·Client Secret·`account_email` 동의 설정을 실제 요청과 맞춘다. 인가 단계에서 scope가 거부되면 앱 설정을 수정해야 하며, 정상 인가 후 이메일을 제공받지 못한 경우에는 기존 이메일 인증으로 이어진다.

[가입 문서 목록](../apps/api/src/modules/auth/utils/signup-terms.ts)은 운영·개발·테스트에서 `WEB_ORIGIN` 아래 [현재 약관 원문](../apps/web/app/legal/2026-11-21-v2/page.tsx)에 연결한다. 가입 상세에는 API가 응답한 버전의 원문을 표시한다. 마이페이지와 로그인 화면의 공개 링크에서는 현재 원문을 열람할 수 있다. 가입 API는 이용약관, 개인정보 수집·이용 동의, 마케팅 수신 선택을 제공한다.

개정할 때는 새 버전 페이지를 추가하고 API의 현재 버전을 갱신한다. [이전 페이지](../apps/web/app/legal/2026-11-21/page.tsx)와 동의 이력은 보관한다. 새 원문 URL과 네 문서가 웹에서 열린 뒤 API 버전을 전환한다. 인증 메일·SMS·카카오의 테스트 대역 성공을 실제 공급자 연동 성공으로 취급하지 않는다.

### 개인정보 처리방침의 근거 확인

서울 EC2 배포 경로와 [운영 DB 검증](../apps/api/src/config/database-environment.ts)은 저장소에서 확인할 수 있다. 운영 버킷·복제본·최종 수신함과 공급자 로그의 위치 및 보유기간은 실제 설정과 계약 자료로 확인한다.

| 확인 대상              | 확인된 근거                                                                                                                                                                                                                                                             | 게시 전 추가 확인                                                                                                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Resend                 | [공개 약관의 계약 법인](https://resend.com/static/documents/resend-dpa-signed.pdf)과 [미국 저장·보유 기준](https://resend.com/security/gdpr/). 운영 설정 메모의 Free 플랜 기준으로 메일·발송 로그 30일, 백업 7일, 총무야의 업체 이용 종료 후 잔여 데이터 90일 이내 파기 | 발송 리전과 저장 리전을 구분한다. 특정 메일의 조기 파기가 필요하면 업체의 지원 경로를 사용한다.                                                                                                                          |
| Octomo·SOLAPI          | [Octomo](https://octomo.octoverse.kr/privacy/)의 서비스 데이터는 서울, 요청 로그·문자 원본은 각각 1년. [SOLAPI](https://solapi.com/notices/20261102-104008)의 국내 문자 처리와 발송 이력 1년                                                                            | 계약상 실제 재수탁자와 통신 중계사의 보관 범위를 확인한다.                                                                                                                                                               |
| Vercel                 | 운영 설정 메모의 Hobby 플랜은 [공식 런타임 로그 기준](https://vercel.com/docs/logs/runtime)으로 1시간                                                                                                                                                                   | 웹·보안·CDN 요청에서 수집하는 기록과 그 처리·저장·원격 조회 국가 및 실제 보유기간을 확인한다.                                                                                                                            |
| Cloudflare·최종 수신함 | [Email Routing](https://www.cloudflare.com/products/email-routing/)의 본문 미보관과 [전달 활동 로그](https://developers.cloudflare.com/email-service/observability/logs/)의 별도 처리                                                                                   | 권한 DNS와 메일 전달의 실제 처리·저장·조회 국가, 전달 로그의 파기 시점, 최종 수신함 업체와 보유기간을 확인한다.                                                                                                          |
| 네이버클라우드         | [Maps](https://guide.ncloud-docs.com/docs/maps-overview.md)의 매장 주소 좌표 변환과 브라우저 지도 호출                                                                                                                                                                  | 운영 사용 설정과 지도 호출 시 수집되는 접속 정보 및 로그의 보유·처리 범위를 확인한다.                                                                                                                                    |
| AWS                    | 서울의 API·RDS를 사용하는 배포 경로와 첨부 객체 삭제 요청 코드                                                                                                                                                                                                          | 계약 법인, S3 버킷·복제·백업 국가, RDS 백업·스냅샷의 만료일, S3 버전 관리·이전 버전 만료를 확인한다. [S3 버전 사용 시 삭제 마커 동작](https://docs.aws.amazon.com/AmazonS3/latest/userguide/DeletingObjectVersions.html) |
| 총무야 기록            | 인증·세션 만료는 사용을 중지한다. 첨부 삭제는 서비스 열람을 차단하고 저장소에서 현재 객체 삭제를 시도한다.                                                                                                                                                              | 인증·세션·동의 기록, 예약, 참석·정산, 고객 문의의 종료 기준·보유기간·실제 파기 경로를 확인한다. 자체 백업과 복원 후 재파기도 별도 확인한다.                                                                              |

국외 이전이 확인된 업체의 실제 국가, 항목, 보유기간, 이전 근거·방법과 거부 효과를 공개 문안에 반영한 뒤 게시한다. 설정 확인에는 계약서와 설정 메타데이터를 사용한다.

## 프록시와 운영 보안

`TRUST_PROXY_HOPS` 기본값은 0이다. 저장소의 EC2 Nginx 한 단계 구성에서는 1을 명시하고 API 포트를 호스트 loopback에만 공개한다. Nginx가 전달 헤더를 클라이언트 값 대신 실제 접속 정보로 덮어써야 IP 제한이 맞게 동작한다. 기존 `TRUSTED_PROXY_CIDRS`에 값이 남아 있으면 환경 검증이 실패하므로 제거한다.

설정은 [Nginx 템플릿](../infra/nginx/api.conf)과 [운영 Compose](../infra/compose.prod.yml)를 사용한다. 호스트 템플릿은 앱 배포가 자동 설치하지 않는다. 외부 직접 API 포트 접근 차단·전달 헤더 위조 방지·서로 다른 IP의 제한 집계를 배포 환경에서 확인한다. 프록시 경로가 바뀌면 신뢰 설정도 다시 검토한다. ingress/CDN/APM에도 callback query·인증 body·쿠키를 기록하지 않는다.

공개 참석 API는 링크 조회·본인 확인·응답 저장을 합쳐 접속 IP당 15분에 1,800회로 제한한다. 이 한도를 먼저 검사하고 유효한 링크에만 기존 링크별·신원별 한도를 적용한다. 운영 API는 `RequestLimitExpiry` migration 적용 후 1분마다 만료된 요청 제한 기록을 최대 5,000건씩 정리한다.

만료 전 Refresh 재사용 감지 이력을 삭제하지 않는다. 만료 세션과 인증 증명의 보존 기간과 정리 작업은 별도 운영 대상이다.

API 경로·DTO는 [auth Controller](../apps/api/src/modules/auth/)와 개발 Swagger를 기준으로 확인한다. HTTP 오류·자원 권한·검증 명령은 [아키텍처](architecture.md)와 [협업 규칙](CONTRIBUTING.md)을 따른다.

## 회원 탈퇴

[차단 기준과 운영 절차](operations.md#회원-탈퇴)를 참고한다.

# 운영

매장 JSON 입력·개발 seed는 [매장 데이터](restaurant-data.md), 외부 인증은 [인증](authentication.md)에 둔다.

## 배포와 복구

[배포 워크플로](../.github/workflows/deploy-api.yml)는 이미지와 소스 SHA를 확인하고 [deploy.sh](../infra/deploy.sh)로 EC2에 적용한다. API는 [운영 Compose](../infra/compose.prod.yml), migration·데이터 작업은 [도구 Compose](../infra/compose.tools.yml)를 사용한다. 루트 Compose는 로컬 DB 전용이다.

- API 배포 순서는 설정 확인 → migrator 권한으로 migration → API 교체·readiness 확인 → 성공 릴리스 기록이다. 웹과 API의 계약이 함께 바뀌는 경우 양쪽 버전의 호환성을 확인한다. 가입 약관 전환은 [인증 설정](authentication.md#외부-인증-설정)을 따른다.
- 앱 DML은 Parameter Store `/chongmuya/prod/DATABASE_URL`, migration은 `/chongmuya/deploy/prod/DATABASE_URL`을 사용한다. RDS CA 마운트와 TLS 검증을 유지한다.
- 새 API를 실행하기 전에 해당 이미지의 모든 migration을 적용한다. 현재 예약금·명단·예약 확정 스키마는 [migration 목록](../apps/api/src/database/migrations/)을 기준으로 확인한다.
- [롤백 워크플로](../.github/workflows/rollback-api.yml)는 현재 DB와 호환되는 성공 릴리스에 사용한다. `1795811000000-RemoveFavorites` 적용 이후의 DB에는 구 즐겨찾기 API가 필요로 하는 테이블이 없다. 스키마 변경으로 이전 앱이 호환되지 않으면 후속 릴리스로 복구한다.
- `current`는 마지막 성공 릴리스, `previous`는 이전 성공 릴리스다. 일회성 작업은 현재 성공 릴리스의 이미지·설정을 사용하고 API를 중단하거나 포트를 추가하지 않는다.

[Nginx 템플릿](../infra/nginx/api.conf)은 앱 배포가 호스트에 자동 설치하지 않는다. 파일 크기·timeout·전달 헤더 변경은 호스트 설정에도 별도로 반영해야 한다. 웹의 `NEXT_PUBLIC_API_ORIGIN` 변경은 재빌드가 필요하다.

## 문의·예약 문자

개발/테스트는 fake 공급자를 사용하며 demo 수신자는 실발송 경계에서 차단한다. 운영은 `MESSAGE_PROVIDER=solapi`, `GEOCODING_PROVIDER=naver`와 관련 키·등록 발신번호·운영 문의 이메일을 설정한다. 설정 이름과 필수 조합은 [환경 예제](../apps/api/.env.example)·[검증 코드](../apps/api/src/config/environment.ts)를 따른다.

서버 문자 발송을 중지하려면 Parameter Store `/chongmuya/prod/SMS_SEND_ENABLED`에 `false`를 설정하고 API 컨테이너를 재배포한다. 기본값은 `true`다. 중지 중에는 문의·예약 기록, 앱 알림함, 기존 문자 결과 조회와 웹훅을 계속 처리한다. 사용자가 직접 보내는 휴대폰 인증 문자에는 적용되지 않는다.

중지 중 생성하거나 발송을 시도한 문자는 `HELD`와 `SMS_DISABLED`로 기록한다. 운영 CLI의 발송·재발송에도 같은 설정을 적용한다. 설정을 다시 `true`로 배포해도 중지된 건은 자동 발송 대상이 되지 않는다. 이미 SOLAPI에 접수된 건은 발송 이력에서 확인한다.

`MERCHANT_REPLY_TOKEN_ENCRYPTION_KEY`는 링크 암호화용 64자리 hex이며 기존 링크를 사용하는 동안 유지한다. 문의 답변 링크의 `MERCHANT_REPLY_TTL_HOURS`와 예약 관리 링크의 `RESERVATION_MANAGEMENT_TTL_HOURS`는 별개이며 기본값은 각각 168시간이다. 문의 답변은 행사 시작 시각도 만료 상한으로 사용한다.

SOLAPI의 공개 callback은 `POST /api/v1/webhooks/solapi`이며 `SOLAPI_WEBHOOK_SECRET`과 원문 본문의 `X-Solapi-Signature`로 검증한다. `SINGLE-REPORT` 연결, 등록 발신번호·잔액·송신 IP·권한은 실제 환경에서 확인한다. `ACCEPTED`는 공급자 접수이며 휴대폰 전달 완료가 아니다.

문의·후속 문자 모두 제목과 유형을 생략해 SOLAPI가 유형을 결정한다. EUC-KR 본문과 링크를 합쳐 90바이트 이하면 SMS, 2,000바이트 이하면 LMS다. 둘 다 처리할 수 없는 본문은 `MESSAGE_BODY_INVALID`로 남긴다. 운영 조회는 공급자가 보고한 유형과 과거 기록을 표시한다. 보고가 없으면 유형 미확인으로 두며, fake는 같은 규격으로 계산한다.

후속 문자 대기·접수 실패를 다시 처리하기 전에 발송 사실과 수신자 역할을 검사한다. 새 정책에서 제외된 과거 문자는 `SMS_POLICY_SUPPRESSED`로 보류되며 알림함·업무 이력은 조회할 수 있다. 환불 여부·금액·반환 일정은 기존 연락처로 전화 협의하고, 실제 반환 기록은 별개로 남긴다.

매장 계정과 문의 문자 링크는 매장별 문의에 첫 답변을 한 번 저장한다. 통신 오류 재시도에는 원래 요청 키를 사용한다. 오입력이나 좌석 유지 변경은 당사자 사이에 전화로 확인하고, 정정이 필요하면 기존 `record-reply` 명령으로 확인 시각·방법·사유와 함께 기록한다. 메뉴 마감은 제안 일시와 등록된 매장 정책으로 계산한다.

정상 예약 처리와 문자 발송은 서버가 수행한다. CLI는 필요할 때 실행하는 조회·관리·장애·대리 기록 수단이다. 로컬에서는 API를 빌드한 뒤 다음처럼 실행한다. 세부 옵션은 각 명령의 `--help`로 확인한다.

- 사장님은 매장 등록의 예약금 항목이나 마이페이지에서 기본 계좌를 계정에 등록한다. 계좌는 계정과 연결하며 공개 매장 JSON과 매장 상세에는 포함하지 않는다. 기본 계좌를 바꾸면 이후 발행하는 안내에 적용하고, 이미 발행한 예약별 안내는 보존한다.
- 예약금 여부나 계좌 안내가 미확인이어도 총무는 메뉴를 먼저 전달할 수 있다. 접수된 주문을 유지하고 예약은 안내 대기로 표시한다. 매장이나 운영자가 금액·계좌·입금 기한을 확인한 후 기존 예약금 안내를 발행한다. 운영 초기에는 문자 안내를 기본으로 하고 웹 표시에는 매장 동의를 받는다.
- 예약금 없음이 확인된 건은 메뉴 전달을 마치면 확정한다. 예약금이 있는 건은 메뉴 전달 후 매장이 최신 안내 기준으로 예약금 전액을 확인하고 추가 검토 사항이 없으면 자동 확정한다. 총무의 안내 확인과 송금 신고는 입금 과정에서 사용한다. 총무의 변경·취소 문의 카드는 메뉴를 전달한 뒤 표시한다.
- `ConfirmReceivedReservations` migration은 최신 안내 확인만 남아 있던 전액 입금 건을 확정한다. 기존 건의 문자 발송 이력과 총무의 안내 확인 기록은 보존한다.

```sh
# 최초 문의 문자 / 예약 후속 알림 / 예약 진행 상태 조회
pnpm --filter @chongmuya/api merchant:operations --action deliveries
pnpm --filter @chongmuya/api reservation:operations --action notifications
pnpm --filter @chongmuya/api reservation:completion --action inspect --reservation <예약_UUID>
# 특정 문의 문자 결과 재확인·반영 (재발송 아님)
pnpm --filter @chongmuya/api merchant:operations --action reconcile --delivery <발송_UUID> --actor <실행자> --reason <사유> --execute
# 실제 변경: 기본 확인 후 같은 명령에 --execute를 붙여 적용
pnpm --filter @chongmuya/api merchant:operations --action publish --restaurant <매장_UUID> --actor <실행자> --reason <사유>
pnpm --filter @chongmuya/api merchant:operations --action publish --restaurant <매장_UUID> --actor <실행자> --reason <사유> --execute
```

| 도구                     | 주요 작업                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `merchant:operations`    | `deliveries` 문의 문자 조회, `retry`, `reconcile`, `regenerate-link`, `change-recipient`, `record-reply`, `publish`, `owner-link` |
| `reservation:operations` | `notifications` 후속 알림 조회, `retry-notification`, `reconcile-notification`, `dispatch`, `expire`, `close-unanswered`          |
| `reservation:completion` | `inspect`, 안내·실입금·예외 확인, 변경 제안·양측 합의 적용, 환불 예정 제안·반환 기록, `link` 관리                                 |

조회(`deliveries`, `notifications`, `inspect`)는 실행자·확인 정보나 `--execute`가 필요 없다. 변경 명령은 기본 미리보기이며 `--actor`, `--reason`, 실제 반영 시 `--execute`가 필요하다. completion의 조회 외 작업은 비공개 `--input`과 `--confirmer`, `--method PHONE|SMS`, `--confirmed-at`도 요구한다. 실행자·사유 입력은 로그인 인증이 아니다.

일반 completion 미리보기는 입력 파일·요청 키·현재 버전·확인 정보를 검사하며 전체 업무 변경을 시뮬레이션하지 않는다. 전체 업무 검증은 실제 실행 시 수행하고, `link`는 별도의 검증·롤백 경로를 사용한다. 후속 문자 결과 재확인은 `reservation:operations --action reconcile-notification --delivery <알림_UUID> --actor <실행자> --reason <사유> --execute`로 실행한다. 공급자 조회·결과 반영에도 `--execute`가 필요하다.

`PENDING` 또는 명확한 `SUBMISSION` 실패만 현재 수신자·동의·링크를 재검사한 뒤 재시도한다. `UNKNOWN`·`PROCESSING`은 `reconcile`로 결과를 먼저 확인하며 링크 재발급·수신자 변경으로 우회 발송하지 않는다. 실제 `DELIVERY` 실패도 무조건 재전송하지 않는다. 자동 문자 복구 워커는 없다.

예약 관리 링크 만료는 후속 알림 생성 시 안전 조건에서 새 세대로 갱신한다. 처리 중·불명 발송이나 수신자 부적격이면 보류 사유와 의도를 보존한다. `notifications`의 보류 eventKey 또는 메시지 ID를 확인한 뒤 `link` 입력에 `requestKey`, `expectedVersion`, `operation: "ISSUE"`, `heldEventKey` 또는 `heldMessageId`를 넣어 명시적으로 복구한다. 대체 이력과 기존 발송 기록은 유지한다.

문의 수신자 교체는 먼저 [매장 연락처](restaurant-data.md#부분-수정-json)를 등록·수정한 뒤 필요한 문의에만 `change-recipient`를 적용한다. `regenerate-link` 실행은 즉시 발송을 시도하고, `change-recipient`는 새 발송 대기 기록을 만든 뒤 반환된 deliveryId로 `retry`한다. 과거 문의·전달 스냅샷은 덮어쓰지 않는다.

`deliveries`는 50건씩 마스킹된 조회를 제공한다. `--page` 또는 `--delivery`와 `--output <새 파일>`을 명시한 경우에만 비공개 이력을 내보낸다(0600, 기존 파일 덮어쓰기 금지). 링크 토큰·문자 본문은 출력하지 않는다.

### EC2 일회성 명령

```sh
sudo bash /opt/chongmuya/deployment/current/deploy.sh operations merchant --action deliveries
sudo bash /opt/chongmuya/deployment/current/deploy.sh operations reservations --action notifications
sudo bash /opt/chongmuya/deployment/current/deploy.sh operations completion --action inspect --reservation <예약_UUID>
```

입력 파일이 필요한 예약 대리 명령은 EC2에 0600 파일을 먼저 준비하고, 호스트에는 `OPERATOR_INPUT_FILE`, CLI에는 마운트된 `/run/input.json`을 지정한다. 아래는 미리보기이며 모든 대괄호 자리 값을 실제 확인한 값으로 바꾼다.

```sh
sudo env OPERATOR_INPUT_FILE=/안전한경로/receipt.private.json \
  bash /opt/chongmuya/deployment/current/deploy.sh operations completion \
  --action receipt --reservation <예약-UUID> --input /run/input.json \
  --actor <기록자> --confirmer <실제-확인자> --method PHONE \
  --confirmed-at <확인-ISO-시각> --reason <확인-근거>
```

receipt 입력은 `requestKey`, `expectedVersion`, `guidanceRevision`, `amount`(전체 수령액), `receivedAt`, `corrects`(최초 null/정정 대상 ID), `reason`이다. 응답 유실 시 원본 파일의 키·버전·내용을 바꾸지 않는다. 양측 합의 적용은 `changeId`, `confirmed:true`, `organizerConfirmer`, `merchantConfirmer`, `agreementEvidence`도 필요하다. 이 도구는 은행 송금·환불을 실행하지 않는다.

운영 입력은 일반 파일·0600·최대 32KiB다. 매장 데이터의 1MiB 제한과 구분한다. 호스트 도우미가 node 소유의 임시 복사본을 읽기 전용 마운트하고 종료 시 제거한다. JSON을 SSM 인자·로그·Actions 입력/아티팩트에 넣지 않는다. 이 업무 CLI들은 AppModule의 런타임 설정을 사용하지만 자동 리마인더는 끈다. `data:restaurants`는 DB 설정만 사용한다.

## 회원 탈퇴

사용자는 마이페이지에서 탈퇴 상태를 확인한다. 현재 책임자에게 진행 중 문의나 종료 전 예약이 있으면 탈퇴를 보류한다. 취소가 확정되거나 예약 종료 시각이 지나면 해당 예약의 차단이 해제된다. 양의 이용 시간이 확인되지 않으면 시작일 다음 날 00:00 KST를 종료 시각으로 사용한다. 현재 모임 관리자나 등록 매장 소유자는 운영 검토를 접수할 수 있다. 담당자는 권한 상태를 확인하고, 조건이 해소되면 사용자가 다시 탈퇴를 확인한다. 세부 판정은 [탈퇴 서비스](../apps/api/src/modules/account-withdrawal/account-withdrawal.service.ts)를 기준으로 확인한다.

EC2에서는 현재 성공 릴리스로 접수 건과 카카오 처리 대기 건을 확인한다. `review`는 운영 검토 이력을 남긴다. 로컬에서는 API 빌드 후 같은 인자를 `pnpm --filter @chongmuya/api account:withdrawals` 뒤에 붙인다.

```sh
sudo bash /opt/chongmuya/deployment/current/deploy.sh operations withdrawals list
sudo bash /opt/chongmuya/deployment/current/deploy.sh operations withdrawals review <접수-UUID> --actor <처리자>
sudo bash /opt/chongmuya/deployment/current/deploy.sh operations withdrawals kakao-list
sudo bash /opt/chongmuya/deployment/current/deploy.sh operations withdrawals kakao-retry <내부-계정-UUID>
```

카카오 연결 계정은 총무야 세션을 폐기한 뒤 서버에서 연결 해제를 확인하고 탈퇴를 완료한다. 타임아웃 등으로 결과가 불명확한 대기 건은 현재 연결 상태를 다시 조회한다. 공개 전과 로그인 앱 또는 어드민 키 교체 뒤에는 `KAKAO_ADMIN_KEY` 설정을 확인하고 지정 테스트 계정으로 실제 연결 해제와 탈퇴 완료를 검증한다.

탈퇴 완료 시 계정의 직접 식별 정보와 사장님 기본 예약금 계좌를 지운다. 예약·공동 명단·정산 등 업무 기록에는 당시 정보가 남을 수 있다. 공개 전 접수 담당자와 응답 기한, 기록별 보유기간·접근 권한·파기 방법, 백업 만료와 복원 후 탈퇴 상태 재적용 방법을 확정한다. 적용할 공개 문안은 [개인정보 처리방침](../apps/web/app/legal/2026-11-21-v2/page.tsx)에서 관리한다.

## 비공개 증빙 파일

파일당 최대 **10MiB(10,485,760바이트)**, JPEG/PNG/WebP/PDF/XLS/XLSX를 허용한다. 확장자·MIME·signature와 스프레드시트 컨테이너를 검사한다. HEIC/SVG/HTML·매크로 문서는 지원하지 않는다. OCR·회계 파싱·악성코드 검사 기능은 없다.

| 계층     | 저장소 설정                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------- |
| 브라우저 | SessionClient로 파일 작업에 120초 전달                                                         |
| Nginx    | 업로드 경로 11MiB(multipart 여유 포함), body 90초, proxy send/read 60초; 일반 body 256KiB 유지 |
| API      | 파일 업로드 socket 90초, 파일 자체 10MiB 검사                                                  |
| S3       | 작업별 30초, SDK 자동 재시도 없음                                                              |

`FILES_S3_BUCKET`, `FILES_S3_REGION`(기본 ap-northeast-2)을 설정하고 인스턴스 role/표준 credential chain을 사용한다. 행사별 기본 한도는 `FILES_MAX_COUNT=100`, `FILES_MAX_BYTES=524288000`이다. 버킷 미설정이나 저장소 장애는 성공으로 처리하지 않는다.

버킷은 비공개로 유지하며 API role은 해당 버킷 `events/*`의 PutObject/GetObject/DeleteObject를 사용한다. 브라우저는 API를 통해 업로드·다운로드하므로 S3 브라우저 CORS나 공개 URL을 사용하지 않는다. 버전 관리·보관·비용 정책과 실제 IAM 동작은 운영 환경에서 확인한다.

실패·중단 파일은 같은 ID/내용으로 재시도하거나 명시적으로 삭제한다. 진행 중 작업은 2분 lease로 보호한다. 지출 삭제는 첨부 연결만 해제하며 정상 파일을 기간만으로 삭제하지 않는다. 삭제는 DB 접근 차단 후 객체 삭제를 시도하고 실패하면 같은 객체를 재정리한다. 다운로드는 현재 권한·길이·digest를 확인한 후 attachment/no-store/nosniff로 전달한다.

## 리마인더

기본 `REMINDERS_ENABLED=false`다. true인 API는 매일 09:00 Asia/Seoul에 다음 날 일정을 처리한다. 09:00 이전 시작은 정시까지 기다리고, 이후 시작은 그날 미처리분만 한 번 보완한다. 실패한 배치만 각 실패 후 1분·5분·15분 간격으로 최대 3회 추가 시도하며, 한국 날짜가 바뀌거나 프로세스가 종료되면 중단한다. 한도 초과는 `REMINDER_RETRIES_EXHAUSTED`로 기록한다.

현재 관리자·일정 세대·삭제·수신 설정을 다시 검사하고 고유 fact와 자원 잠금으로 중복을 막는다. 늦게 생성/변경된 일정과 과거 알림은 소급 생성하지 않는다. 전날 리마인더는 알림함에 기록한다. 관리 CLI는 Nest 초기화 전에 해당 프로세스의 자동 리마인더를 끈다.

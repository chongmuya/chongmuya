# 메뉴·예약금·변경취소 예약 관리 (PR2)

매장 선택은 `PREPARING`이다. 메뉴는 기본 필수이며, 안내 미확인을 0원으로 간주하지 않는다. 예약금 없음이 확인되고 유효한 메뉴와 최신 안내 확인이 저장되면 확정된다. 예약금이 있으면 실제 수령액도 충족해야 한다. 총무의 송금 신고는 은행 입금 확인이 아니다. 기한·금액 예외는 사실을 보존하고 사장님 또는 운영자가 확인한 뒤 재진행한다. 조회는 상태를 계산하며 DB를 변경하지 않는다.

## 화면과 원본

총무는 행사 예약 탭, 로그인 사장님은 `/owner/reservations`, 비회원 사장님은 문자로 받은 `/reservation-manage?reservation=…#token=…`에서 처리한다. 초안 수량은 서버 저장이며, 제출된 메뉴는 이름·단위·단가·수량·소계·합계·통화·메뉴판 버전을 보존한다. 메뉴판 변경은 입력을 유지한 명시적 재검토를 요구한다. 이전 문의·선택 응답은 별도 접힌 이력이다.

읽은 Figma 파일은 [총무야](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS)이며 실제 디자인 문맥과 스크린샷을 확인한 노드는 다음과 같다.

| 원본 노드           | 적용 흐름                                      |
| ------------------- | ---------------------------------------------- |
| 48:1062             | 메뉴 수량, 금액, 예약금 안내, 확인 체크와 제출 |
| 568:4380            | 안내 대기와 메뉴 초안                          |
| 50:1510 / 528:4099  | 매장 확인 대기 / 기한·금액 확인 필요           |
| 41:335              | 확정 내역과 참석 관리 이동                     |
| 499:3502            | 사장님의 메뉴·은행 실입금 확인                 |
| 233:2005 / 447:3478 | 변경·취소 100자 문의와 접수                    |
| 447:3503            | 취소와 별도 환불 예정·실제 반환                |

`600:4241`은 원본 도구에서 노드를 찾지 못했다. 비회원 화면은 확인 가능한 사장 예약 상세와 최신 ZIP의 권한 계약으로 구성했다. Figma 자산 URL 다운로드는 HTTP 403이었고, 상태 아이콘의 원본 자산 반영은 미완료다. 확인 완료 아이콘은 기존 shared UI 자산을 재사용했다. 원본 그대로 구현했다고 주장하지 않는다. 상세 폼은 새 서버 계약의 실수령액·정정 사유·양측 합의·환불액을 표시하도록 보완했다. 취소 화면에서 재문의 CTA는 발견되지 않아 만들지 않았다.

읽기 전용으로 [PRD](https://app.notion.com/p/3ec8d571d6de81bb81a7c2ceedc76c74), [기능 명세](https://app.notion.com/p/3ec8d571d6de816fb87ce39531e0d531), [정책](https://app.notion.com/p/3ec8d571d6de810ca37bfa1ba7d5e90c), [화면별 결정](https://app.notion.com/p/3ec8d571d6de816386e1fa2b1154e5f9), [Decision Log](https://app.notion.com/p/3ec8d571d6de81f99af7f417c0b0d228)를 참조했다. 오래된 행사당 영구 1회 문의/D-021·재문의 금지와 후속 문자 제한은 최신 사용자 결정과 ZIP보다 우선하지 않는다. 메뉴 기본 필수, 선택≠확정, 별도 예약 관리 링크, 후속 내구성 알림을 적용했다. 역경매와 PR3~5는 구현하지 않았다.

## 서버 계약

- 총무: `GET /api/v1/reservations/:id`, `POST /:id/:action`의 `menu-draft`, `menu-submit`, `acknowledge`, `transfer`, `change-request`, `change-accept`.
- 로그인 사장님: `GET /api/v1/owner/reservations`, `GET /:id`, `POST /:id/:action`의 `guidance`, `receipt`, `resolve`, `change-propose`, `change-reject`, `refund-plan`, `refund`. 계정 유형과 매장 소유권을 검사한다.
- 비회원: `POST /api/v1/reservation-management/:id/access`로 원본 토큰 교환. `X-Reservation-Access`로 같은 사장 명령만 허용한다. 기존 문의 응답 토큰은 사용할 수 없다. 토큰은 fragment에서 즉시 제거하며 메모리에만 둔다. 원본 링크 만료와 최대 1시간 access 만료를 별도 검증한다.
- 주요 쓰기는 `{command:{requestKey,expectedVersion,…}}` 형식이다. 행사→문의→대상(ID 순)→선택 예약 잠금, 권한 재검증, 동일 트랜잭션 안에서 상태·감사 이력·알림 저장을 수행한다. 동일 요청 키와 digest는 재사용하며 내용이 다르면 충돌한다. 발송은 커밋 이후다.
- 안내 `UNKNOWN/NONE/REQUIRED`, 웹 동의 계좌/SMS 전용, 현재 안내 revision, 총무 확인, 송금 신고, 실제 수령 총액을 구분한다. SMS 전용 계좌는 총무의 현재·제안·확정·과거 이력 DTO에서도 제거한다. 공개 매장 DTO에 계좌를 추가하지 않는다.
- 실입금 기록은 전체 수령 총액이다. 정정은 이전 receipt ID와 사유를 요구하고 과거 스냅샷을 보존한다. 예약금 예정액보다 적은 실제 금액은 확정되지 않는다. 초과·불일치·지연은 별도 확인이 필요하다.
- 변경·취소 요청만으로 계약을 수정하지 않는다. 매장 제안→총무 수락, 또는 양측 합의 증거를 가진 운영 명령으로 적용한다. 일정은 EventsService 공개 명령으로 대표 일정에도 반영한다. 취소 후 환불 예정액과 실제 반환을 분리하고 실제 수령액−기반환액을 넘는 반환을 거부한다. 예정액 미확인 또는 예정액을 넘는 실제 반환도 수령 잔액 안에서는 기록하며, 예정액은 그대로 보존하고 차이·실제 반환 시각을 감사 증거로 남긴다. 예정과 실제가 다르면 확인 필요로 표시한다. 외부 송금·환불은 실행하지 않는다.
- `ReservationFactsService.forEvent(ownerId,eventId,manager)`는 권한을 확인하고 선택/계산 상태, 합의 일정, 확정/취소 시각, 실제 수령·반환·잔여액과 환불 예정액을 제공한다. 이후 정산 등은 Entity 직접 참조 대신 이 계약을 사용한다. 메뉴 예상액을 실제 이용 총액으로 대신하지 않는다.

`reservation_progress`는 현재 projection, `reservation_completion_history`는 명령 digest·이전/현재 사실의 스냅샷·확인자/기록자/방법/시각/사유, `reservation_changes`는 요청/제안/적용, `reservation_management_links`는 선택된 한 예약의 현재 링크 세대를 저장한다. 링크 교체의 이전 연락처·번호·세대·감사 정보는 이력으로 남긴다. 최초 문의 연락처와 기발송 이력은 덮어쓰지 않는다.

## 운영 대리 명령과 전달 복구

API 빌드 후 `pnpm --filter @chongmuya/api reservation:completion --help`. 공개 운영 우회 HTTP API는 없다. 모든 명령은 기본 dry-run이며 원문 입력 파일·계좌·토큰을 출력하지 않는다. 실행자와 실제 확인자, PHONE/SMS, 확인 시각, 사유가 필수다.

```bash
pnpm --filter @chongmuya/api reservation:completion \
  --action receipt --reservation <예약-UUID> --input /안전한/로컬/receipt.json \
  --actor <기록자> --confirmer <실제-사장-확인자> \
  --method PHONE --confirmed-at <확인-ISO-시각> --reason <확인-근거>
```

`receipt.json`은 `requestKey`, `expectedVersion`, `guidanceRevision`, `amount`(전체 수령액), `receivedAt`, `corrects`(최초 null, 정정은 기존 receipt ID), `reason`을 포함한다. 확인된 동일 입력에만 `--execute`를 추가한다. 응답 유실 시 JSON의 requestKey와 내용을 바꾸지 않고 재시도한다. dry-run은 대상·버전·운영 확인자를 검사하고 전체 명령의 업무 검증은 실제 실행 트랜잭션에서 수행한다.

`link` 입력은 `operation: ISSUE|REVOKE`, 필요 시 현재 유효한 `contactId`를 포함한다. 교체는 새 세대를 발급하고 이전 access도 폐기한다. 발송 UNKNOWN/PROCESSING이 있으면 무조건 새 링크를 보내지 않는다. `apply-agreement`는 `changeId`, `confirmed:true` 및 `organizerConfirmer`, `merchantConfirmer`, `agreementEvidence`를 추가로 요구한다. `inspect`는 안전한 상태·버전·금액·변경 ID만 출력한다.

기존 `reservation:operations`의 `notifications`, `retry-notification`, `reconcile-notification`, `dispatch`를 사용한다. HTTP 403/429 등 명백한 접수 실패는 SUBMISSION으로 기록하며 원인 해결 후 명시적으로 재시도한다. UNKNOWN/PROCESSING 무조건 재전송 금지와 실제 DELIVERY 실패 구분을 유지한다. fake 공급자는 실문자 전달 검증이 아니다.

## 설정과 적용 순서

새 환경변수는 없다. 기존 API `AUTH_SECRET`, `MERCHANT_REPLY_TOKEN_ENCRYPTION_KEY`, `MERCHANT_REPLY_TTL_HOURS`, `WEB_ORIGIN`, 문자 공급자 설정을 재사용한다. 암호화 키 설정은 기존 링크와 함께 유지해야 한다. 웹은 기존 `NEXT_PUBLIC_API_ORIGIN`을 사용한다. CORS 허용 헤더에 `X-Reservation-Access`가 추가된다.

향후 사용자 승인 배포 시: 백업/호환성 확인→`1795752000000-NotificationRecipientSnapshot`→`1795755600000-ReservationCompletion` migration→API→웹 순서다. 이번 작업에서는 배포하지 않는다. 기존 PREPARING 선택과 당시 응답은 변경하지 않으며 조회 시 초기 준비 상태를 계산한다. 기존 선택 건의 전용 링크는 운영자가 명시적으로 발급한다. 원본 연락처를 과거 발송 snapshot으로 추정해 채우지 않는다. 증거가 생긴 뒤 down은 거부하며 forward recovery를 사용한다.

## 검증 범위와 남은 확인

Node 26.13.1 / pnpm 11.25.0, 격리 PostgreSQL 및 fake provider에서 검증한다. 첫 독립 수정 커밋은 PR1 6건 회귀(수신자 교체, 403/429·UNKNOWN, 조회 만료, 행사 충돌 복구, 명단 재검토, 한국어/접근성 오류)를 포함한다. PR2는 실제 HTTP·DB 권한, 메뉴/안내 revision, 응답 유실·동시 요청, 실입금/취소 경합, 링크 폐기/교체, 변경 합의, 부분·중복 환불, 비파괴 migration과 스키마 일치를 검증한다.

브라우저는 Chromium headless와 실제 개발 웹/API, 격리 DB를 사용했다. 320/402/1280px의 초안 재진입, 예약금 없는 확정, 안내 대기, 별도 비회원 링크, 문자 전용 계좌 비노출, 신고 대기→은행 확인→확정, 변경취소 접수/제안/수락, 일부 환불, 새로고침/뒤로가기를 확인했다. 원본 노드 부재와 자산 403, 실기기 및 실제 SMS·은행 대사·운영 네트워크는 별도 확인이 필요하다. 자동/실제 송금·환불은 제품 범위가 아니다.

검증한 개발 화면: [메뉴 초안](images/pr2/menu.png), [확정](images/pr2/confirmed.png), [취소·환불 대기](images/pr2/refund-pending.png). 이미지의 데이터는 격리 demo/fake 시나리오이며 실사용 예약이 아니다.

## 독립 검수 후 보완

응답 유실·5xx처럼 저장 여부가 미확인인 명령은 원본 requestKey·expectedVersion·입력을 고정한다. 최신 조회 버전만으로 새 요청을 만들지 않으며 “원래 요청 결과 다시 확인”으로 정확히 재시도한다. 서버의 명시적 거절이 확인된 충돌만 입력을 보존한 재적용을 허용한다. 성공 확인 후 별개의 정상 작업에는 새 키를 부여한다.

총무의 변경 수락 미리보기는 일정·인원·메뉴뿐 아니라 최소 주문 금액/수량, 별도 이용료, 메뉴/입금 기한, 공간/착석/이용 시간, 계좌 안내 경로와 변경취소 조건의 기존/제안 값을 모두 표시한다. 카탈로그 재검토 후 품절/미가격인 품목은 수량을 유지해 보여 주고, “선택 해제”로 명시적으로 0으로 정리할 수 있다.

[실제 환불 저장 후 응답 유실 화면](images/pr2/refund-unresolved.png): 테스트에서 HTTP 200 응답만 끊고 조회 버전이 올라가는 상황을 만들었다. 원본 요청 재확인은 금액을 다시 더하지 않았고, 이후 명시적인 새 반환은 한 번 반영됐다. 이는 격리 DB의 반환 사실 기록 검증이며 은행 송금은 실행하지 않았다.

후속 백엔드 검수에서는 순수 CHANGE에 환불 예정액을 입력·수락하지 않도록 했다. 취소의 예정액과 실제 반환 계약은 유지한다. 변경 적용 트랜잭션에서도 시작 시각의 미래 여부와 메뉴 기한을 재검사하여, 제안 이후 시간이 지난 계약은 새 제안으로 다시 확인한다.

취소 이후 뒤늦게 확인된 은행 수령 사실은 기존 PHONE/SMS 운영 감사 명령으로만 기록·정정한다. 기존 사장님 로그인/링크 권한을 넓히지 않으며 확인자·방법·시각·기록자를 보존한다. 예약은 취소 상태를 유지하고 자동 확정하지 않는다. 전체 수령액을 이미 반환한 금액보다 작게 정정할 수 없으며, 새로 확인된 잔액 안에서 기존 실제 반환 기록 명령을 사용할 수 있다. 이 경로의 권한·감사·잔액·상태 불변 조건은 격리 PostgreSQL 통합 테스트로 검증했다.

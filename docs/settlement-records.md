# PR3 지출·정산·증빙·행사 기록

PR2 Draft #36의 검증 head `59be38557fa2798983c329d9b6b8059193b86aae`를 기반으로 한다. PR3 base는 `fix/pr2-reservation-preparation`이며 병합·배포를 수행하지 않는다. 사용자 ZIP의 `00-README.md`, `03-settlement-records.md`와 최신 결정이 오래된 선행 병합 안내보다 우선한다. ZIP은 저장소에 포함하지 않는다.

## 계산과 보존

전체 이용 금액 T는 예약금을 포함한 실제 전체 지출 하나다. 정산 대상 A = T − (예약금 제외 시 D, 포함 시 0) − 이 지출의 회비·지원금 S. 음수는 거절한다. 금액과 행사 합계는 정수 0~2,000,000,000원이며 T는 양수다. 양수 A의 부담자가 없거나 나머지 담당자가 필요한데 미지정이면 초안이다. A=0은 계좌와 입금 요청 없이 완료 가능하다. 균등 몫 `floor(A/n)`과 나머지 전부를 지정인 한 명에게 배정한다. 지정인은 균등 부담자 외 사람도 가능하다.

`ReservationFactsService.forEvent`의 실제 수령−실제 반환만 예약금 참고로 제시한다. 선택 적용은 예약 ID와 금액을 저장하며 동일 예약의 유효 지출 적용 합이 현재 잔액을 초과하면 거절한다. 단순 직접 입력의 자금 출처를 판별했다고 주장하지 않는다. 이후 예약 반환으로 참고 잔액이 바뀌어도 저장 지출을 자동 변경하지 않는다. 총무는 적용 내역과 최신 실제 잔액을 비교해 수정한다.

행사 잠금 → 정산 상태/파일 순서로 권한·명단 버전·중복 키·금액을 같은 transaction에서 검증한다. `event_settlements`는 작은 행사 단위 상태, `settlement_commands`는 요청 키와 원본 상태 감사 snapshot을 보존한다. 일반 version과 calculationVersion은 분리되어 메모·입금·정산문·파일 조회는 계산 버전을 바꾸지 않는다. 코드 보호 한도는 행사당 활성 지출 200개, 지출당 선택 1,000명이다. 더 큰 배포 요구가 생기면 부하와 UX를 검증하여 조정한다.

입금 확인은 현재 미확인 잔액만 기록한다. 실제 반환과 잘못 기록한 체크의 정정을 구분하며 원본 이력은 삭제하지 않는다. 정정 후 순확인액이 음수가 되는 요청은 거절한다. 지출 감소로 초과확인액이 생기면 실제 반환/정정 확인 전까지 완료가 아니다. 실제 송금 API는 없다. 정산 데이터 없음은 EMPTY, 0원 전액지원 지출은 COMPLETE다.

정산문은 생성 당시 계산/지출/표시 명단/계좌/기한/문구를 보존한다. 수정은 새 생성본이다. 금액은 자유 텍스트로 고치지 않는다. 계산 변경 시 이전 문구에 재생성 필요를 표시한다. 공유 문구에는 뒤4자리를 넣지 않는다. 계좌 기본값은 명시적인 저장 체크 시에만 계정별 저장하며 과거 계좌는 덮어쓰지 않는다. 목록은 계좌·원문을 반환하지 않고 권한 확인된 상세만 반환한다. 복사·시스템 공유 결과는 수신/열람 증거가 아니다.

## 공개 경계와 API

- `EventsService.settlementFacts`는 현재 행사 접근 권한, 차수/명단/최종 참석 응답의 최소 공개 계약이다. `recordPage`는 소유 행사 20개 단위 필터·검색과 한 차수 이상 참석한 고유 인원을 일괄 집계한다.
- `ReservationFactsService`에 원래 문의 대상의 매장명 snapshot을 추가했다. 현재 매장 이름으로 과거 표시를 덮어쓰지 않는다.
- settlements → files 공개 `FilesService.link`는 같은 manager에서 이미 검증한 행사·지출의 파일 연결만 바꾼다. files는 정산 Entity를 읽지 않는다. 모든 접근 권한은 최초 작성자가 아니라 현재 `EventsService.assertOwned`를 따른다.
- GET/POST `/api/v1/events/:eventId/settlement`, GET `.../settlement/notices/:id`.
- GET `/api/v1/records?groupId=&search=&after=&before=&offset=`. 20개 페이지이며 날짜 미정·예약 없는 개인 행사도 포함한다. 지난 날짜를 정산 완료로 해석하지 않는다.
- GET `.../files`, POST `.../files/:id/upload` (multipart `file`), GET `.../files/:id/download`, POST `.../files/:id/delete` (`expectedVersion`). UUID 업로드 ID와 내용 digest가 같은 재시도는 한 파일이다.

웹은 기존 SessionClient·TanStack Query와 계정/행사 query key를 쓴다. 응답을 확인하지 못한 쓰기는 원본 expectedVersion/입력/requestKey로 재시도하며 최신 조회만으로 새 요청을 만들지 않는다. 명확한 충돌에서만 최신 내용 확인 후 명시적으로 재적용한다. 명단 변경은 과거 표시 정보를 최신 version에 붙이지 않고 선택 해제 후 재확인한다. 연결 지출 삭제는 파일 자체 삭제가 아니며 파일은 행사 자료에 남는다.

## 비공개 파일 저장소와 수동 운영

파일당 10MB는 **10,485,760바이트**로 통일한다. JPEG/PNG/WebP/PDF/XLS/XLSX만 허용한다. 확장자·MIME·signature를 교차 확인하고 XLS/XLSX 컨테이너의 workbook 구조와 매크로 여부를 검사한다. ZIP은 해제 전 엔트리 수/총 해제 크기 상한(1,000개/50MiB), 암호화/ZIP64 제한을 검사한다. 전체 ZIP을 해제하지 않으며 workbook/Content Types 두 XML만 각각 실제 출력 1MiB 제한으로 확인한다. 자동 OCR/회계 파싱은 없다. SVG/HTML/HEIC는 지원하지 않으며 HEIC는 변환 안내한다. 파일을 신뢰 가능한 문서로 보증하거나 악성코드 검사 완료라고 표시하지 않는다.

직접 multipart 전송은 10MiB/1파일 제한, 요청 socket 30초 timeout이다. S3 I/O는 행사 잠금 밖에서 실행하고 SDK 요청은 30초 timeout/자동 재시도 없음이다. 정상 첨부 목록은 READY만 완료로 표시하고 UPLOADING/FAILED/DELETING/DELETE_FAILED는 구분한다. 업로드 직후부터 행사 자료로 명시적으로 보관하므로 지출 작성 취소에 따른 숨은 임시 파일은 없다. 실패/중단 업로드는 목록에서 확인하고 같은 파일 재시도 또는 명시적 삭제로 정리한다. 진행 중 업로드 lease 2분 이전에는 삭제/다른 실행을 막는다. 2분 이후 중단된 업로드 정리와 재시도가 가능하다. 정상 자료는 경과 기간만으로 삭제하지 않는다.

삭제는 먼저 DB에서 접근을 차단한 뒤 object 삭제 결과를 기록한다. 실패 시 UI의 삭제 재시도가 같은 object를 정리한다. 지출 삭제 시 파일 연결만 해제한다. 원본은 인증된 서버를 통해 `Content-Disposition: attachment`, `no-store`, `nosniff`로 내려주며 public URL이나 signed URL을 클라이언트 캐시에 남기지 않는다. 이미지 미리보기 역시 인증된 바이트를 받아 일시 blob URL을 쓰고 화면 이탈 시 폐기한다.

설정은 API 배포 환경의 `FILES_S3_BUCKET`, `FILES_S3_REGION` (기본 ap-northeast-2), `FILES_MAX_COUNT` (기본 100), `FILES_MAX_BYTES` (기본 524,288,000)이다. 한도는 운영 기본값이며 확정된 무제한 저장 정책이 아니다. S3 SDK 표준 credential chain/인스턴스 role을 사용한다. 키/버킷 없음과 공급자 실패는 503이며 성공으로 위장하지 않는다. 로컬·테스트 어댑터는 테스트 코드에서 명시적으로 교체하며 운영 환경변수로 활성화할 수 없다.

사용자/운영 담당자가 이후 별도로 준비·확인할 사항:

1. 비공개 버킷의 Block Public Access, 암호화, 비용/보관·백업 정책. 이 PR은 버킷/IAM/운영 인프라를 생성하거나 수정하지 않는다.
2. API role에 지정 버킷의 `events/*` prefix에 한정한 `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` 권한. 버전 관리 버킷의 삭제 마커/이전 버전 보관 정책은 별도 확인한다. ACL/public-read 권한은 필요 없다.
3. 직접 API 업로드이므로 S3 browser CORS는 필요 없다. 기존 API CORS WEB_ORIGIN과 프록시 body size/timeout이 10MiB multipart+overhead/30초 이상을 허용해야 한다. 정확한 크기 초과는 API에서 거절한다.
4. 승인된 개발/스테이징 버킷에서 실제 업로드·다운로드·삭제·권한 거절·공급자 장애/재시도와 IAM 동작을 수동 검증한다. 실제 S3 검증은 이번 작업에서 수행하지 않는다.
5. 명시적 배포 시 DB 백업 확인 → `1795759200000-SettlementRecords` forward migration → API → 웹 순서다. 자동 migration/startup schema 변경은 없다. 기존 예약·정산 사실을 지우는 down은 제공하지 않는다. 애플리케이션을 되돌려도 신규 테이블과 감사 이력은 보존한다.

[AWS SDK S3 공식 문서](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/GetObjectCommand/)의 서버 읽기 계약을 사용한다. Context7 도구는 이 환경에 없어 공식 문서로 확인했다.

## 디자인·정책 대조와 검증

실제 Figma 스크린샷과 구조를 읽은 노드: `48:1158`, `137:4263`, `573:4767`, `308:9902`, `574:5253`, `237:1597`, `237:1769`, `528:5245`, `331:10808`, `331:10906`, `333:11088`, `333:11199`, `528:4402`, `353:5523`, `539:6349`, `373:11409`, `427:4389`. 상위 `233:1578`, `237:3219`도 확인했다. [Figma 원본](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/). 화면 순서·카드·탭·입력·복사/공유·기록 흐름을 따르되 과거 샘플 숫자/입금자명 혼동은 재현하지 않는다. 원본 SVG 다운로드는 403으로 실패하여 아이콘 동일성은 검증하지 못했다. 현재 shared UI의 접근성 대비 색상을 유지한다.

읽은 지정 Notion은 [정책](https://app.notion.com/p/3ec8d571d6de810ca37bfa1ba7d5e90c), [기능 명세](https://app.notion.com/p/3ec8d571d6de816fb87ce39531e0d531), [Decision Log](https://app.notion.com/p/3ec8d571d6de81f99af7f417c0b0d228)다. 오래된 총액/현장 결제액 선택기와 후속 구현 표기 대신 최신 ZIP의 단일 전체 이용금액과 이번 PR3 범위를 적용했다. Figma/Notion 원본은 수정하지 않았다.

검증 결과는 PR 본문에 최종 SHA 기준으로 기록한다. 실제 은행/송금·문자/메일·운영 S3·운영 DB·배포는 실행하지 않는다. Chromium은 실제 렌더링 검증이고 iOS Safari/Android 실기기·시스템 공유 앱 전달은 사용자 확인 대상으로 구분한다.

추가 인수 시나리오는 인터뷰 원문·참여자·실연락처 없이 합성 개인/모임 행사로 검증한다. 1차와 2차의 부담자 구성을 분리하고 선입금 포함/제외+지원금을 적용한 뒤, 최초 정산문 발행→입금 확인→2차 참석 재확인→지출 금액 정정을 연결한다. 참석 변경은 저장 지출의 부담자 snapshot을 바꾸지 않으며, 이전 정산문 문자열과 원래 입금 사실을 보존하고 화면에는 추가 확인 차액을 표시한다. 실제 파일럿 정산 사례라고 주장하지 않는다.

최종 로컬 검증: Node 26.13.1 / pnpm 11.25.0에서 frozen-lockfile 설치, format:check, lint, typecheck, build 통과. `pnpm test`는 경계 8/API 29/웹 109건, 새 격리 PostgreSQL의 전체 통합은 59건 통과했다. 마지막 파일 연결 version 보완 후 정산/파일 관련 5건을 새 격리 DB에서 다시 통과했다. 스키마 diff 없음, 타 행사·계정 거절, 금액/명단 snapshot·응답 유실·동시 수정·계획과 실제 수령 구분, 지연 업로드 후 삭제 tombstone과 재정리까지 포함한다. 이전 검증의 새 Entity 목록·제약 이름 차이와 한글 multipart 파일명 문제는 수정 후 재검증했다.

실제 Chromium에서는 320/402/1280px 개인·모임 합성 시나리오와 원본 응답 유실 후 탭 이동·동일 반환 재시도·다음 별개 반환·한국어 composition 이벤트를 확인했다. [지출](images/pr3/expense.png), [차수별 정산](images/pr3/people.png), [정산문](images/pr3/notice.png), [행사 기록](images/pr3/record.png), [모임 기록](images/pr3/group-records.png)은 합성 데이터의 실제 브라우저 캡처다. 시스템 공유 미지원은 복사 안내를 확인했으며 실기기 공유 앱 수신은 검증하지 않았다.

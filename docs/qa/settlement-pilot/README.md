# 총무야 파일럿 화면 QA

기준은 `31fdbe8d20cfa27fee0bbe1213ddd07aeb9de915`이며 수정본은 [Draft #62](https://github.com/chongmuya/chongmuya/pull/62)입니다. Figma 원본은 읽기 전용으로 조회했습니다. [정산](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=233-1578), [모임 기록](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=237-3219), [총무 첫 흐름](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=427-4322), [마이페이지](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=296-8990), [탈퇴](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=691-4699).

앱의 실제 라우트를 기준/수정 로컬 서버에서 열고 Chromium 402×946과 1280×946에서 가짜 API 응답으로 상태를 맞췄습니다. 표의 증거 링크는 기준/수정본 캡처입니다. 데스크톱 시트는 같은 중앙 앱 영역만 잘라 보여줍니다. 원본 렌더는 프레임 링크에서 확인할 수 있습니다. 다운로드 403과 일시 호출 제한이 있었으나 읽기 도구의 인라인 응답을 받아 원본 렌더를 확보했습니다.

Figma 40개 프레임·참고 인스턴스를 확인했습니다. 스크린샷과 지정 동작을 함께 확인한 사례는 기준본 144개, 수정본 144개입니다. 캡처가 검증되지 않은 조합은 시트에 공란 대신 명시했습니다. 시각의 ‘통과’는 사용 중인 구조·진입이 일치한다는 뜻이며 픽셀 동일성을 보증하지 않습니다.

| 약칭 | 실제 앱 경로                                                                      |
| ---- | --------------------------------------------------------------------------------- |
| S    | `/events?event={eventId}&view=settlement` (빈 상태 직접 등록은 `&action=expense`) |
| D    | `/events?event={eventId}&view=record`                                             |
| L    | `/events?view=records&group={groupId}`                                            |
| M    | `/mypage`, 계정 설정 `/mypage?view=account`                                       |
| A    | `/mypage?view=groups&group={groupId}`                                             |
| X    | `/group-access?kind={invitation 또는 handover}&id={id}#token`                     |
| G    | `/getting-started?guide=1`                                                        |
| N    | `/groups/new`                                                                     |
| H    | `/`                                                                               |

| Figma                                                                                                       | 앱 경로·상태                            | 시각                                                     | 기능                                                | 전후 렌더                                     | 조치                                             |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------- | ------------------------------------------------ |
| [48:1158 정산 지출 있음](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=48-1158)              | S · 지출 목록과 상세 금액               | 불일치 · 합계/지출 카드와 편집 버튼 배치 차이            | 통과 · 등록/편집/삭제 진입                          | [시트 1-1](mo1-1.jpg)                         | 유지 · 삭제는 이력과 파일을 보존하는 확인 경로   |
| [539:5827 지출 등록 전](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=539-5827)              | S · 지출 0건                            | 불일치 · 빈 일러스트·단독 주 버튼 대신 탭과 빈 안내      | 통과 · 등록 진입, 정산문 생성 차단                  | [시트 1-1](mo1-1.jpg)                         | 빈 상태 표현 디자인 검토                         |
| [237:1597 개인별 정산](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=237-1597)               | S → 개인별 정산 · 일부 입금             | 불일치 · 체크 아이콘 대신 금액/상태 표와 반환·이력       | 통과 · 입금 기록·반환, 키보드 탭 이동               | [시트 1-1](mo1-1.jpg) · [시트 1-2](mo1-2.jpg) | 실제 금액과 이력 진입 유지, 방향키/tabpanel 수정 |
| [237:1769 정산문 쓰기 빈 상태](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=237-1769)       | S → 정산문 쓰기 · 지출 있음, 정산문 0건 | 불일치 · 빈 카드의 아이콘·버튼 순서 차이                 | 통과 · 새 정산문 진입                               | [시트 1-2](mo1-2.jpg)                         | 빈 상태 레이아웃 확인                            |
| [333:11088 정산문 기록](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=333-11088)             | S → 정산문 쓰기 · 원문 1건              | 불일치 · 목록 직접 공유 대신 상세 진입 후 제공           | 통과 · 기존 정산문 열기                             | [시트 1-2](mo1-2.jpg)                         | 상세에서 현재 검토 상태 확인 후 공유 유지        |
| [333:11199 이전 정산문](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=333-11199)             | S → 정산문 쓰기 → 기존 문서             | 불일치 · 제목/계산 이력 안내와 복귀·수정본 액션이 추가됨 | 통과 · 원문 읽기, 수정 원문 보존 및 검토 상태 차단  | [시트 2-1](mo2-1.jpg)                         | 수정본 만들기·권한 오류 상태 반영                |
| [137:4263 지출 등록](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=137-4263)                 | S → 지출 등록 · 선택 전                 | 불일치 · 독립 시트 대신 인라인 폼, 가격·차수 배치 다름   | 통과 · 등록 폼과 닫기                               | [시트 1-2](mo1-2.jpg)                         | 실제 예약금 정보 및 입력 검증 유지               |
| [573:4767 지출 등록, 부담자 선택 후](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=573-4767) | S → 지출 등록 → 이 차수 참석자 적용     | 불일치 · 부담자 행과 액션이 인라인                       | 통과 · 부담자 선택 반영                             | [시트 1-2](mo1-2.jpg)                         | 무관한 정산 정책 수정 없이 기능 보존             |
| [308:9902 지출 수정](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=308-9902)                 | S → 지출 수정 · 기존 영수증 있음        | 불일치 · 파일 관리 카드·버튼 형태가 다름                 | 통과 · 기존 값, 지출 저장, 닫을 때 미저장 입력 폐기 | [시트 1-2](mo1-2.jpg) · [시트 1-3](mo1-3.jpg) | 연결 파일·지출 버전 경계 유지                    |
| [574:5253 비용 나눌 사람](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=574-5253)            | S → 지출 폼의 부담자 목록               | 불일치 · 독립 창·차수 칩 대신 인라인 검색/선택           | 통과 · 현재 차수에서 부담자 반영                    | [시트 1-2](mo1-2.jpg)                         | 별도 창을 중복 구현하지 않음                     |
| [331:10808 일부 입금 후 정산문](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=331-10808)     | S → 정산문 폼 → 입금 미확인             | 불일치 · 대상 표/계좌 배치와 순서 차이                   | 통과 · 미확인 두 명으로 좁힘                        | [시트 2-1](mo2-1.jpg)                         | 직접 입금 사실 기준 유지                         |
| [528:5245 최초 정산문](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=528-5245)               | S → 정산문 폼 · 입금 0명                | 불일치 · 계좌 선택/문구와 대상 영역 차이                 | 통과 · 작성 폼과 범위 제어                          | [시트 2-1](mo2-1.jpg)                         | 저장된 은행 기본값·현재 총무만 재사용            |
| [331:10906 정산문 생성 완료](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=331-10906)        | S → 생성 → 본문·복사/공유               | 불일치 · 생성 메타, 수정본 진입 추가                     | 통과 · 생성, 공유 중 잠금, 오류 복구, 검토 차단     | [시트 2-1](mo2-1.jpg)                         | 상태 스펙 보완 · 수정본은 원문 별도 보존         |
| [528:4402 정산 마감일 이후](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=528-4402)          | S · 확인 기한 경과·미확인 2명           | 불일치 · 미확인 잔액/계산 재확인 문구와 행 높이 차이     | 통과 · 기한 안내 열림·Escape 닫기                   | [시트 2-2](mo2-2.jpg)                         | 기한 경과를 실제 미입금으로 표시하지 않음        |
| [573:4877 부담자 없음 경고](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=573-4877)          | S · 부담자 0명인 지출 폼                | 제외 · 참고 인스턴스, 로그아웃 버튼이 섞인 시안          | 통과 · 현재 폼에서 부담자 미지정 시 초안 저장 제공  | [시트 1-3](mo1-3.jpg)                         | 별도 경고 모달 추가 보류                         |
| [353:5523 자료 있음](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=353-5523)                 | D · 영수증 파일 1개 및 미리보기         | 불일치 · 원본의 업로드 카드/썸네일과 앱 제어 배치 차이   | 통과 · 미리보기/닫기, 다운로드·업로드·삭제/취소     | [시트 3-1](mo3-1.jpg)                         | 비공개 파일 API, 권한 및 이력 보존               |
| [539:6349 자료 등록 전](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=539-6349)              | D · 파일 0개                            | 불일치 · 빈 일러스트/설명과 여백                         | 통과 · 빈 목록, 로딩·오류·권한                      | [시트 3-1](mo3-1.jpg) · [시트 3-2](mo3-2.jpg) | 파일 로딩 상태 추가                              |
| [373:11409 모임 기록 목록](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=373-11409)          | L · 행사/영수증 있음                    | 불일치 · 요약/필터와 파일 카드 구성이 다름               | 통과 · 기록 열기, 브라우저 뒤로, 오류에서 재조회    | [시트 3-2](mo3-2.jpg)                         | 실제 파일 조작은 권한 확인 가능한 상세로 유지    |
| [539:6412 기록 없음](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=539-6412)                 | L · 행사 0건                            | 불일치 · 검색 유지 및 빈 카피가 다름                     | 통과 · 빈 목록, 로딩                                | [시트 3-2](mo3-2.jpg) · [시트 3-3](mo3-3.jpg) | 빈 일러스트와 검색 노출 방향 검토                |
| [427:4389 기록 상세](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=427-4389)                 | D · 선택 행사와 지출/파일/메모          | 불일치 · 헤더·탭·메모와 파일 순서 차이                   | 통과 · 목록에서 진입, 영수증 접근                   | [시트 3-1](mo3-1.jpg) · [시트 3-2](mo3-2.jpg) | 기록의 최신 정산·권한 제어 유지                  |
| [251:5276 총무 닉네임](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=251-5276)               | G · 닉네임 없는 총무                    | 통과 · 닉네임 입력과 다음 버튼 구조                      | 통과 · 첫 설정 폼 진입                              | [시트 4-1](mo4-1.jpg)                         | 새 정책 필요 없음                                |
| [269:2318 총무 이용 방식](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=269-2318)            | G · 정기 모임/일회 행사 선택            | 불일치 · 앱에 건너뛰기와 계속하기 추가                   | 통과 · 선택 전 계속 버튼 비활성, 각각 환영 진입     | [시트 4-1](mo4-1.jpg)                         | 기존 사용자 경로 보존                            |
| [287:6425 가입 완료 및 일회 행사](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=287-6425)    | G → 일회 행사 선택                      | 통과 · 환영과 행사 등록 진입 구조                        | 통과 · 행사 등록 버튼 표시                          | [시트 4-1](mo4-1.jpg)                         | 행사 폼은 이 검수 범위 밖                        |
| [287:6450 가입 완료 및 정기 모임](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=287-6450)    | G → 정기 모임 선택                      | 통과 · 환영과 모임 등록 진입 구조                        | 통과 · 모임 등록 버튼 표시                          | [시트 4-1](mo4-1.jpg)                         | 모임 최초 생성은 별도 경로 N                     |
| [287:6317 총무 모임 등록](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=287-6317)            | N · 미등록 모임                         | 불일치 · 폼 안내 및 버튼 채움 차이                       | 통과 · 다음 단계, 나가기 취소                       | [시트 4-1](mo4-1.jpg)                         | 관리 이름 필수, 유형 선택 정책 유지              |
| [287:6517 최초 모임 명단 입력](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=287-6517)       | N → 다음 · 입력 전                      | 불일치 · 앱에 수동 추가와 명단 없이 생성 제공            | 통과 · 입력 폼·명단 검토 진입                       | [시트 4-1](mo4-1.jpg) · [시트 4-2](mo4-2.jpg) | 최초 모임 등록 내 기능만 검사                    |
| [289:6587 최초 모임 명단 확인](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=289-6587)       | N → 이름 입력 → 명단 확인               | 불일치 · 확인 행과 추가/편집 조작 배치 차이              | 통과 · 이름 파싱과 미리보기 진입                    | [시트 4-2](mo4-2.jpg)                         | 행사 참석 폼과 별개                              |
| [289:6844 모임 등록 완료](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=289-6844)            | N → 등록 성공                           | 불일치 · 디자인 모달 대비 앱 전용 완료 화면              | 통과 · 모임을 한 번 저장하고 완료 표시              | [시트 4-2](mo4-2.jpg)                         | 완료 화면 위계 디자인 확인                       |
| [285:5786 모임 있음, 행사 없음](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=285-5786)      | H · 모임 1, 행사 0                      | 통과 · 모임 헤더와 행사 진입 구조 기준                   | 통과 · 기존 모임 표시                               | [시트 4-2](mo4-2.jpg)                         | 홈은 타 담당 범위, 진입점만 확인                 |
| [289:6867 모임 없음, 행사 없음](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=289-6867)      | H · 모임/행사 0                         | 통과 · 모임 만들기 진입과 첫 행사 상태                   | 통과 · 모임 생성 링크 표시                          | [시트 4-2](mo4-2.jpg)                         | 홈은 타 담당 범위, 진입점만 확인                 |
| [292:6995 홈 모임 만들기 제안](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=292-6995)       | H → 모임 만들기 버튼                    | 미구현 · 별도 제안 모달, 앱은 N으로 직접 이동            | 보류 · 안내 모달을 되살릴 정책 근거 없음            | [시트 4-2](mo4-2.jpg) · [시트 4-1](mo4-1.jpg) | 기존 등록 진입 유지                              |
| [233:1583 마이페이지, 모임 있음](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=233-1583)     | M · 모임 1                              | 불일치 · 파일럿 메뉴 조합과 탈퇴 진입 차이               | 통과 · 모임 관리 링크 표시                          | [시트 5-1](mo5-1.jpg)                         | 관리/탈퇴 분리, 탈퇴 정책 보류                   |
| [568:4706 마이페이지, 모임 없음](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=568-4706)     | M · 모임 0                              | 불일치 · 현재 모임 없음 안내와 모임 추가 버튼 위치 차이  | 통과 · 생성 가능, 기존 모임 관리 미표시             | [시트 5-1](mo5-1.jpg)                         | 빈 상태 표현 확인                                |
| [296:8553 모임 관리](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=296-8553)                 | A · 총무 권한 및 기존 대기 요청 유무    | 불일치 · 기본 정보/권한 섹션, 초대·대기 요청 추가        | 통과 · 권한·오류·뒤로 및 저장, 기존 요청 취소       | [시트 5-1](mo5-1.jpg) · [시트 5-2](mo5-2.jpg) | 보류 배지와 기존 요청 상태 디자인 반영           |
| [350:5436 로그아웃 경고](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=350-5436)             | M → 계정 설정 · 로그인 상태             | 불일치 · 현행 계정의 로그아웃 버튼, 원본은 모달          | 보류 · 이번 탈퇴 QA에서 로그아웃 실행 미검수        | [시트 5-2](mo5-2.jpg)                         | 별개 계정 기능으로 참고                          |
| [477:3515 인수인계 제안 외곽](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=477-3515)        | A/X · 대기 요청 또는 수신 링크          | 제외 · 477:3519를 감싼 동일 외곽                         | 보류 · 신규 생성/수락, 기존 취소만 가능             | [시트 5-2](mo5-2.jpg)                         | 원본 이중 계산 제외                              |
| [477:3519 인수인계 제안](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=477-3519)             | A/X · 대기 요청 또는 수신 링크          | 보류 · 원본 신규 생성 시안, 현행은 기존 요청 미리보기    | 통과 · 기존 취소 가능, 생성/수락 진입 차단          | [시트 5-2](mo5-2.jpg)                         | 기존 요청만 있는 보류 상태를 프레임에 추가       |
| [687:4706 회원 탈퇴 안내](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=687-4706)            | M → 계정 설정 · 대체 화면               | 미구현 · 안내·사유 UI 없음                               | 미구현 · 탈퇴 URL/메뉴/API 구현 확인 안 됨          | [시트 5-2](mo5-2.jpg) · [시트 5-1](mo5-1.jpg) | 진행 행사·기록·계정 삭제 정책 결정 필요          |
| [692:4900 회원 탈퇴 경고](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=692-4900)            | M → 계정 설정 · 대체 화면               | 미구현 · 탈퇴 확인 UI 없음                               | 미구현 · 탈퇴 요청 실행 없음                        | [시트 5-2](mo5-2.jpg)                         | 확정 전 삭제 플로우 보류                         |
| [692:4863 탈퇴 완료](https://www.figma.com/design/VlhXK42QbSbn4eZxI00MNS/?node-id=692-4863)                 | M → 계정 설정 · 대체 화면               | 제외 · 탈퇴 완료 모달 인스턴스, 선행 단계 미구현         | 미구현 · 완료 응답의 앱 진입 없음                   | [시트 5-2](mo5-2.jpg)                         | 탈퇴 구현 결정 후 상태 재검토                    |
| 참가자 반환·정정                                                                                            | S → 개인별 정산 → 반환/이력             | 보류 · 별도 원본 프레임 미특정                           | 통과 · 실제 반환 전송, 0원 거부/포커스, 이력 표시   | [시트 1-3](mo1-3.jpg) · [시트 1-1](mo1-1.jpg) | 매장 반환 경로와 분리, 로컬 검증 개선            |
| 일반 멤버 초대                                                                                              | A → 참여 초대, X · 유효 링크            | 보류 · 원본 완성 프레임 미특정                           | 통과 · 수동 초대 링크 생성, 일반 멤버 수락          | [시트 5-2](mo5-2.jpg)                         | 인수인계 수락과 분리                             |
| 접근·조회 복구                                                                                              | S/L/D/A · 403, 503, 지연, 비로그인      | 보류 · 해당 오류 변형 원본 미특정                        | 통과 · 할당 기능에서 접근 차단·재조회               | [시트 3-3](mo3-3.jpg) · [시트 3-2](mo3-2.jpg) | API 접근 경계 유지                               |

## 브라우저 재현 상태

아래의 통과는 해당 캡처와 검사 조건을 확인했다는 뜻입니다. 기준본에서 의도한 회귀를 재현한 경우(키보드 탭·0원 반환·파일 로딩·재조회·공유 중복·기존 인수인계)도 포함합니다.

| 상태                               | 기준 402 | 수정 402 | 기준 1280 | 수정 1280 |
| ---------------------------------- | -------- | -------- | --------- | --------- |
| [expenses](mo1-1.jpg)              | 확인     | 확인     | 확인      | 확인      |
| [expense-delete](mo1-1.jpg)        | 확인     | 확인     | 확인      | 확인      |
| [empty](mo1-1.jpg)                 | 확인     | 확인     | 확인      | 확인      |
| [expense-deeplink](mo1-1.jpg)      | 확인     | 확인     | 확인      | 확인      |
| [people](mo1-1.jpg)                | 확인     | 확인     | 확인      | 확인      |
| [receipt](mo1-1.jpg)               | 확인     | 확인     | 확인      | 확인      |
| [return](mo1-1.jpg)                | 확인     | 확인     | 확인      | 확인      |
| [tab-keyboard](mo1-2.jpg)          | 확인     | 확인     | 확인      | 확인      |
| [notice-empty](mo1-2.jpg)          | 확인     | 확인     | 확인      | 확인      |
| [notice-list](mo1-2.jpg)           | 확인     | 확인     | 확인      | 확인      |
| [expense-new](mo1-2.jpg)           | 확인     | 확인     | 확인      | 확인      |
| [expense-close](mo1-2.jpg)         | 확인     | 확인     | 확인      | 확인      |
| [payers](mo1-2.jpg)                | 확인     | 확인     | 확인      | 확인      |
| [expense-edit](mo1-2.jpg)          | 확인     | 확인     | 확인      | 확인      |
| [expense-save](mo1-3.jpg)          | 확인     | 확인     | 확인      | 확인      |
| [expense-draft](mo1-3.jpg)         | 확인     | 확인     | 확인      | 확인      |
| [return-form](mo1-3.jpg)           | 확인     | 확인     | 확인      | 확인      |
| [return-invalid](mo1-3.jpg)        | 확인     | 확인     | 확인      | 확인      |
| [return-correction](mo1-3.jpg)     | 확인     | 확인     | 확인      | 확인      |
| [notice-old](mo2-1.jpg)            | 확인     | 확인     | 확인      | 확인      |
| [notice-error](mo2-1.jpg)          | 확인     | 확인     | 확인      | 확인      |
| [review](mo2-1.jpg)                | 확인     | 확인     | 확인      | 확인      |
| [notice-unconfirmed](mo2-1.jpg)    | 확인     | 확인     | 확인      | 확인      |
| [notice-form](mo2-1.jpg)           | 확인     | 확인     | 확인      | 확인      |
| [notice-created](mo2-1.jpg)        | 확인     | 확인     | 확인      | 확인      |
| [notice-sharing](mo2-1.jpg)        | 확인     | 확인     | 확인      | 확인      |
| [deadline](mo2-2.jpg)              | 확인     | 확인     | 확인      | 확인      |
| [deadline-close](mo2-2.jpg)        | 확인     | 확인     | 확인      | 확인      |
| [record](mo3-1.jpg)                | 확인     | 확인     | 확인      | 확인      |
| [file-preview](mo3-1.jpg)          | 확인     | 확인     | 확인      | 확인      |
| [file-close](mo3-1.jpg)            | 확인     | 확인     | 확인      | 확인      |
| [file-download](mo3-1.jpg)         | 확인     | 확인     | 확인      | 확인      |
| [file-upload](mo3-1.jpg)           | 확인     | 확인     | 확인      | 확인      |
| [file-delete](mo3-1.jpg)           | 확인     | 확인     | 확인      | 확인      |
| [file-empty](mo3-1.jpg)            | 확인     | 확인     | 확인      | 확인      |
| [file-loading](mo3-2.jpg)          | 확인     | 확인     | 확인      | 확인      |
| [file-error](mo3-2.jpg)            | 확인     | 확인     | 확인      | 확인      |
| [file-denied](mo3-2.jpg)           | 확인     | 확인     | 확인      | 확인      |
| [records](mo3-2.jpg)               | 확인     | 확인     | 확인      | 확인      |
| [records-open](mo3-2.jpg)          | 확인     | 확인     | 확인      | 확인      |
| [records-error](mo3-2.jpg)         | 확인     | 확인     | 확인      | 확인      |
| [records-empty](mo3-2.jpg)         | 확인     | 확인     | 확인      | 확인      |
| [records-loading](mo3-3.jpg)       | 확인     | 확인     | 확인      | 확인      |
| [settle-denied](mo3-3.jpg)         | 확인     | 확인     | 확인      | 확인      |
| [settle-error](mo3-3.jpg)          | 확인     | 확인     | 확인      | 확인      |
| [settle-loading](mo3-3.jpg)        | 확인     | 확인     | 확인      | 확인      |
| [anonymous](mo3-3.jpg)             | 확인     | 확인     | 확인      | 확인      |
| [nickname](mo4-1.jpg)              | 확인     | 확인     | 확인      | 확인      |
| [usage](mo4-1.jpg)                 | 확인     | 확인     | 확인      | 확인      |
| [welcome-event](mo4-1.jpg)         | 확인     | 확인     | 확인      | 확인      |
| [welcome-group](mo4-1.jpg)         | 확인     | 확인     | 확인      | 확인      |
| [registration](mo4-1.jpg)          | 확인     | 확인     | 확인      | 확인      |
| [registration-exit](mo4-1.jpg)     | 확인     | 확인     | 확인      | 확인      |
| [registration-list](mo4-1.jpg)     | 확인     | 확인     | 확인      | 확인      |
| [registration-preview](mo4-2.jpg)  | 확인     | 확인     | 확인      | 확인      |
| [registration-complete](mo4-2.jpg) | 확인     | 확인     | 확인      | 확인      |
| [home](mo4-2.jpg)                  | 확인     | 확인     | 확인      | 확인      |
| [home-empty](mo4-2.jpg)            | 확인     | 확인     | 확인      | 확인      |
| [my](mo5-1.jpg)                    | 확인     | 확인     | 확인      | 확인      |
| [no-group](mo5-1.jpg)              | 확인     | 확인     | 확인      | 확인      |
| [groups](mo5-1.jpg)                | 확인     | 확인     | 확인      | 확인      |
| [groups-loading](mo5-1.jpg)        | 확인     | 확인     | 확인      | 확인      |
| [groups-error](mo5-1.jpg)          | 확인     | 확인     | 확인      | 확인      |
| [groups-denied](mo5-1.jpg)         | 확인     | 확인     | 확인      | 확인      |
| [groups-back](mo5-1.jpg)           | 확인     | 확인     | 확인      | 확인      |
| [groups-save](mo5-2.jpg)           | 확인     | 확인     | 확인      | 확인      |
| [groups-pending](mo5-2.jpg)        | 확인     | 확인     | 확인      | 확인      |
| [groups-cancel](mo5-2.jpg)         | 확인     | 확인     | 확인      | 확인      |
| [account](mo5-2.jpg)               | 확인     | 확인     | 확인      | 확인      |
| [handover](mo5-2.jpg)              | 확인     | 확인     | 확인      | 확인      |
| [invite-send](mo5-2.jpg)           | 확인     | 확인     | 확인      | 확인      |
| [invite-accept](mo5-2.jpg)         | 확인     | 확인     | 확인      | 확인      |

## 사람이 확인할 항목

- iOS/Android 실기기의 시스템 공유 시트와 브라우저 클립보드 권한. Chromium은 가짜 공유 구현을 사용했습니다.
- Figma 시각 차이 가운데 정책과 접근성에 영향을 주는 상태. 특히 정산문 검토·수정본, 로그인 계정 초대, 기존 인수인계, 회원 탈퇴에서 승인할 표현과 적용 범위를 확인해야 합니다.
- 탈퇴 안내와 확인은 앱에 진입점이 없었습니다. 운영 데이터 삭제 정책, 처리 범위, 복구 가능 여부가 확정되어야 구현할 수 있습니다.
- 영수증 원본 검사와 금액·이력 연산은 기존 격리 PostgreSQL 통합 체크와 별개입니다. 이 자료의 브라우저 검증은 로컬 합성 자료를 사용했습니다.

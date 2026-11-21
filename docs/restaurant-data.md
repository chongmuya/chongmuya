# 매장 데이터 관리

개발 데이터는 가짜 fixture와 기존 demo 시나리오를 함께 만들고, 운영 데이터는 명시적으로 전달한 비공개 파일로 등록·수정한다. HTTP 서버·문자·이메일·스케줄러를 시작하지 않는다. 실제 운영 파일 원본은 별도로 보존하고, 작업용 복사본은 `apps/api/src/database/seeds/data/restaurants.production.private.json`에 둘 수 있다. 이 파일은 Git·Docker build context·컴파일 산출물에 포함하지 않고 `--file`로 지정할 때만 읽는다. 같은 폴더의 `restaurants.local.json`만 개발 fixture로 Git에 포함한다.

## 명령

| 실행 위치   | 명령                                                                                                                   | 역할                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 저장소 루트 | `pnpm db:seed`                                                                                                         | API 컴파일 후 가짜 매장·계정·모임·행사·문의 생성. 재실행 시 기존 수정 보존        |
| 저장소 루트 | `pnpm db:reset`                                                                                                        | 허용된 로컬 DB의 public 스키마 데이터 삭제 → migration → 개발 seed                |
| 저장소 루트 | `pnpm --filter @chongmuya/api db:demo:links`                                                                           | 기존 개발용 참석·매장 답변 링크 조회                                              |
| 저장소 루트 | `pnpm --filter @chongmuya/api data:restaurants show`                                                                   | 최대 100개 매장의 ID·version 조회                                                 |
| 저장소 루트 | `pnpm --filter @chongmuya/api data:restaurants show --key <고정키>`                                                    | 해당 매장의 ID/version·공간/메뉴/연락처 ID와 정책 표시 확인. `--id <UUID>`도 지원 |
| 저장소 루트 | `pnpm --filter @chongmuya/api data:restaurants import --file <경로> --actor <실행자> --reason <사유>`                  | 통합 JSON의 신규 매장 등록 미리보기                                               |
| 저장소 루트 | `pnpm --filter @chongmuya/api data:restaurants update --file <경로> --actor <실행자> --reason <사유>`                  | version을 확인하는 지정 항목 수정 미리보기                                        |
| 저장소 루트 | `pnpm --filter @chongmuya/api data:restaurants menus --id <UUID>`                                                      | 현재 메뉴 ID·가격·매장 version 조회                                               |
| 저장소 루트 | `pnpm --filter @chongmuya/api data:restaurants menu-prices --id <UUID> --file <경로> --actor <실행자> --reason <사유>` | 근거를 남기는 지정 메뉴 가격 수정 미리보기                                        |

import/update/menu-prices는 `--execute`가 있어야 반영한다. actor/reason은 실행 단위로 한 번 입력한다. 입력 파일은 일반 파일·권한 0600·최대 1MiB여야 한다. 번호·동의 메모·SQL·DB URL은 출력하지 않는다. 실패 시 허용 코드와 안전한 필드 위치만 출력한다. 기본 미리보기는 읽기 전용 트랜잭션이며, 실제 실행 시 상태와 version을 다시 확인한다. 실행 전체는 한 트랜잭션이다.

## 로컬 준비

[README의 로컬 시작 절차](../README.md#로컬-시작)로 API 환경변수, DB, migration과 개발 seed를 준비한다.

demo 계정의 최초 비밀번호는 `Demo1234!`다. `DEMO_SEED_PASSWORD`로 최초 생성 비밀번호를 바꿀 수 있으며 기존 비밀번호는 재실행해도 유지한다. 외부 인증 없이 다음 이메일로 일반 로그인할 수 있다.

| 계정                           | 시나리오                      |
| ------------------------------ | ----------------------------- |
| `organizer.a@example.test`     | 모임·참석·문의·예약·정산 점검 |
| `organizer.b@example.test`     | 별도 총무의 모임·행사         |
| `organizer.empty@example.test` | 빈 총무 화면                  |
| `owner.a@example.test`         | 소유 매장 정보·메뉴·문의 관리 |
| `owner.empty@example.test`     | 사장님 등록 시작              |

`예약금 입금 확인 대기` 행사는 메뉴 전달과 송금 신고를 마친 상태다. 총무는 변경 거절 화면에서 기존 예약으로 진행할 수 있고, 사장님 A는 예약금 20,000원을 확인해 예약을 확정할 수 있다. `지난 모임 정산 기록`은 참석자 3명의 간식비 10,000원, 총무 부담 1원, 발행된 정산문을 포함한다.

개발 시드의 인증·동의는 합성 자료이며 실제 메일·문자 전송을 하지 않는다. 로컬 API도 fake 문자·지도 공급자를 사용한다. 대화형 터미널은 demo 행사·참석·매장 답변 링크를 표시하고 비대화형 실행은 비밀 링크를 출력하지 않는다. 파일이 필요하면 `db:demo:links --output ../../.local/demo.links.json`으로 새 0600 파일에 저장한다.

일반 개발 seed/reset은 loopback 호스트, `chongmuya` DB 계정, 포트 `15432`, DB 이름 `chongmuya`만 허용한다. NODE_ENV가 production이면 거부한다. 자동 테스트는 NODE_ENV=test, 동일 계정·loopback과 `chongmuya_test` 또는 `chongmuya_test_*` 이름의 격리 DB만 허용한다. NODE_ENV만 바꿔 원격/운영 DB를 초기화할 수 없다. `synchronize`, `migrationsRun`, `dropSchema`는 false다.

`apps/api/src/database/seeds/data/restaurants.local.json`을 수정한 후 새 fixture로 처음부터 개발하려면 다음 명령을 사용한다. **로컬의 기존 계정·행사·문의 등 public 스키마 데이터가 모두 삭제된다.** 단순 재실행은 기존 행을 덮어쓰지 않는다.

```sh
pnpm db:up
pnpm db:reset
pnpm dev
```

기존 demo 매장 4개와 공간·메뉴·연락처·계정·문의의 ID 규칙을 유지한다. 파일의 `isDemo` 입력은 허용하지 않고 개발 진입점이 true를 설정한다. `00000000000`은 개발 fixture에서만 허용한다. 첫 매장은 기존 시나리오대로 가상 사장 계정의 테스트 번호와 연결한다. 실제 전송은 없다. 기존 demo 링크·세트 옵션은 유지한다.

```sh
pnpm db:seed --set second
pnpm --filter @chongmuya/api db:demo:links
```

재실행은 기존 계정·명단·매장 수정과 삭제·동의 철회·소유권 해제를 보존하며 링크 만료를 연장하지 않는다. 새 `--set`은 공용 계정·매장을 재사용하고 행사 시나리오만 추가한다. 특정 세트만 다시 만들려면 `pnpm db:seed --set second --recreate`를 사용한다. 이 명령은 해당 세트의 행사·참석·문의 수정을 삭제한다. 예약 선택·제안 거절·예약 진행 기록, 정산 변경 기록, 증빙 파일이 생긴 세트는 보존하며 새 세트를 안내한다.

기존 로컬 fixture를 수정할 때도 `data:restaurants update`와 [부분 수정 JSON](#부분-수정-json)을 사용한다. 예를 들어 `show --id c0210000-0000-4000-8000-000000000001`로 대상 매장의 version과 공간·메뉴 ID를 조회한다. 개발용 000 번호는 로컬 fixture에만 둔다.

## 초기 등록 JSON

루트는 `{ "restaurants": [...] }`다. 매장에는 `key`, `name`, `address`, `region`, `category`, `latitude`, `longitude`, `maxCapacity`, `photoPath`, `operatingHours`, `facilities`, `bookingPolicy`, `depositPolicy`, `menuPolicy`, `cancellationPolicy`, `published`, `verifiedAt`, `spaces`, `menus`를 사용한다. 미확인 값은 null로 명시한다. `spacePhotos`는 생략하면 빈 배열이며 항목은 `path`, `description`, `position`이다.

- 공간: `key`, `label`, `kind`(HALL/ROOM/FLOOR/WHOLE), `availability`(AVAILABLE/UNAVAILABLE/UNKNOWN), `togetherSeating`(YES/NO/UNKNOWN), `capacity`, `minGuests`, `minSpend`, `separateFee`, `conditions`.
- 메뉴: `key`, `name`, `kind`(REGULAR/SET), `price`, `unit`, `available`. `position`은 선택적으로 읽고 검증하지만 초기 저장 순서는 파일의 배열 순서(0부터)를 사용한다.
- `contact`는 생략/null 또는 `{ "phone": "문자열", "requestConsentAt": null, "consentNote": null }`. phone은 필수, 나머지는 생략하면 null이다. ASCII 공백·하이픈만 제거하고 기존 휴대폰 규칙으로 검사한다. 숫자 타입·다른 기호·운영 000 번호는 거부한다.
- `publicPhone`은 선택적인 고객용 대표번호다. null 또는 빈 문자열은 미확인을 뜻하며 지역번호·휴대폰·0507·대표번호의 숫자와 ASCII 공백·하이픈을 받는다. `contact.phone`과 독립적으로 등록·수정하고, 생략한 기존 번호는 보존한다. 문의 문자 수신용 번호에서 자동으로 복사하지 않는다.
- 알 수 없는 필드와 서버 필드(`isDemo`, `ownerAccountId`, `version`, 정규화 값 등)는 거부한다. 가격 null과 0원을 구분하며 설명 문장에서 금액·기한을 추정하지 않는다.

연락처 ID는 코드에서 정한다. 새 이름은 매장명을 사용하고 기존 담당자 이름은 보존한다. active/isPrimary는 동의 여부와 명시적 수정으로 결정하며 입력받지 않는다. 번호만으로 동의를 만들지 않고 제공된 과거 동의 시각도 바꾸지 않는다. 새 번호에는 별도의 동의가 필요하다. 연락처 테이블과 과거 문의·링크·발송 스냅샷은 유지한다.

import는 기존 UUIDv5 namespace와 `key`, `매장key/공간key`, `매장key/메뉴key`를 사용한다. 기존 실제 매장 4개의 key·ID와 하위 ID는 그대로다. 표시 이름이 바뀌어도 key를 변경하지 않는다. 같은 ID의 매장이 있으면 **매장 전체를 건너뛴다**. 옛 파일로 메뉴·공간·삭제된 연락처·철회 동의를 복원하지 않는다. 이름으로 기존 매장을 연결하지 않으며, 다른 ID의 같은 이름·주소는 대상 확인 오류다.

## 부분 수정 JSON

루트는 동일한 `restaurants` 배열이며 각 항목은 `id` 또는 `key` 중 하나, `expectedVersion`, `changes`다. 조회 후 확보한 version을 사용하고, 성공 또는 충돌 후에는 다시 조회한다. 같은 파일의 재실행은 옛 version 충돌로 거부되어 중복 적용되지 않는다.

```json
{
  "restaurants": [
    {
      "key": "example-restaurant",
      "expectedVersion": 3,
      "changes": {
        "facilities": null,
        "menus": [
          {
            "action": "update",
            "key": "daily-meal",
            "changes": { "price": 12000 }
          }
        ]
      }
    }
  ]
}
```

생략 필드는 유지하고 null은 nullable 필드만 명시적으로 비운다. 공간·메뉴 배열은 전체 저장이 아니다. 기존 항목 수정은 `action:update` + `id` 또는 `key` + `changes`, 추가는 `action:add` + `key` + 완전한 `data`를 사용한다. 메뉴 비활성화는 `available:false`, 공간은 `availability:UNAVAILABLE`을 명시한다. 누락한 항목은 보존하고 행을 삭제 후 재생성하지 않는다. 일반 조회에서 받은 자원 ID도 사용할 수 있다.

초기 import 자원을 매장 ID로 찾아 수정할 때는 `example-restaurant/daily-meal`처럼 전체 고정 key를 지정한다. 사장님이 직접 등록해 초기 key가 없는 매장에도 매장 ID + 간단한 자원 key로 추가·수정할 수 있다. 이때 key는 매장 ID에 속한 별도 식별자로 고정되므로, 다음 수정도 동일한 매장 ID + key 또는 조회한 자원 ID를 사용한다. 매장 ID와 초기 import key 사이를 바꾸며 새 key를 만들지 않는다.

changes는 초기 등록의 표시 필드를 지원한다. 주소 변경은 latitude와 longitude도 함께 전달해야 하며, 더 이상 맞지 않는 구조화 주소는 비운다. 이름·주소 변경도 기존 중복 제약을 따른다. 서버 소유권·정규화 필드·잠금 version은 changes에 넣지 않는다.

기존 주소의 표준화 검토가 필요한 경우에는 별도 [주소 정규화 도구](../apps/api/scripts/normalize-restaurant-address.mjs)를 사용한다. `pnpm --filter @chongmuya/api exec node scripts/normalize-restaurant-address.mjs --list`로 대상을 확인하고, 수정은 매장 ID·현재 version·검색 결과·actor/reason을 명시한 dry-run 이후 `--execute`로 반영한다. 이 도구는 런타임 설정과 주소 공급자를 사용한다.

일괄 수정은 파일 순서대로 앞선 항목의 변경 예정 이름·주소를 반영한다. 미리보기와 실행 모두 DB의 동일한 정규화 기준으로 중복을 검사한다. 두 매장을 같은 이름·주소로 바꾸는 배치는 거부하고, 앞선 수정이 비운 조합은 뒤 항목이 사용할 수 있다. 실행 중 한 항목이라도 실패하면 전체를 롤백한다.

정책은 `policies`에 저장한다. 최초 설명 필드 5개는 catalogPolicies로 `sourceDescriptions`에 보관한다. update의 `policies`는 `hours`, `holidays`, `advance`, `minimumOrder`, `menuDeadline`, `guestDeadline`, `usage`, `deposit` 중 변경할 단위를 기존 구조 그대로 받는다. 해당 단위의 내부 필드는 모두 제공한다. `weeklyHours`는 요일 7개와 note를 받으며 null은 요일 설정만 제거한다. 기존 사장님 수정·descriptionOverrides·다른 정책은 보존한다. 사장님 구조화 값이나 요일 설정이 이미 표시를 결정하는 설명 필드에 원문만 덮어쓰려 하면 `POLICY_DESCRIPTION_OVERRIDDEN`으로 거부한다. 이 경우 표시되는 `policies` 값을 수정한다. 내부 sourceDescriptions/descriptionOverrides 자체를 입력하지 않는다.

기존 매장에 연락처만 보완하거나 번호를 바꾸는 형식은 같다.

```json
{
  "restaurants": [
    {
      "key": "example-restaurant",
      "expectedVersion": 4,
      "changes": {
        "contact": {
          "phone": "010-0000-0001",
          "requestConsentAt": "2026-01-01T00:00:00+09:00",
          "consentNote": "예시: 확인한 수신 동의의 근거"
        }
      }
    }
  ]
}
```

위 번호는 문법 설명용이며 실행할 실제 동의 자료로 사용하지 않는다. 동의가 없다면 시각을 null로 둔다. 번호 변경은 다른 연락처 행을 사용하고 기존 현재 수신자는 비활성화한다. 동일 번호의 담당자 이름은 유지한다. `contact:null`은 현재 수신자만 비활성화한다. 이미 비활성인 연락처를 옛 동의 시각으로 되살리지 않는다. 새 동의가 있다면 새 시각의 사실과 현재 version을 사용한다. 이미 보낸 문의의 수신자를 바꿔야 하는 별도 업무는 기존 `merchant:operations --action change-recipient`를 사용한다. 데이터 명령은 문의 스냅샷이나 발송 상태를 바꾸거나 실제 발송하지 않는다.

```sh
chmod 600 /안전한경로/update.private.json
pnpm --filter @chongmuya/api data:restaurants show --key example-restaurant
pnpm --filter @chongmuya/api data:restaurants update --file /안전한경로/update.private.json --actor operator --reason '확인한 변경 반영'
pnpm --filter @chongmuya/api data:restaurants update --file /안전한경로/update.private.json --actor operator --reason '확인한 변경 반영' --execute
```

## 메뉴 가격만 수정

메뉴 ID와 현재 version을 `data:restaurants menus --id <매장-UUID>`로 조회한 뒤 다음 형식의 비공개 파일을 준비한다. 아래 UUID는 형식 예시다.

```json
{
  "expectedVersion": 3,
  "evidence": "확인한 메뉴판 가격",
  "items": [{ "id": "c0230000-0000-4000-8000-000000000001", "price": 12000 }]
}
```

`data:restaurants menu-prices --id <매장-UUID> --file <경로> --actor <실행자> --reason <사유>`로 미리보기하고 `--execute`로 반영한다. 지정한 메뉴 가격만 수정하며 실제 변경이 있으면 매장 version을 한 번 올린다. 이전·새 가격과 evidence를 기록하고 과거 주문 금액은 바꾸지 않는다. 이 명령은 정수 가격만 받는다. 미확인 가격 null로 되돌리거나 이름·판매 여부 등을 바꾸려면 일반 update를 사용한다.

## EC2: 파일 준비와 일회성 실행

이 코드·CLI·Compose를 포함하는 **첫 배포는 필요하다**. 이후 JSON 내용 변경은 현재 성공한 릴리스 이미지로 실행하므로 재빌드·재배포가 필요 없다. 기존 배포/롤백/migration 순서는 변경하지 않는다.

먼저 승인된 안전한 파일 전송 방법으로 JSON을 EC2의 별도 경로에 준비하고 파일 권한을 0600으로 설정한다. Git·Docker build context·GitHub Actions 입력/출력/아티팩트·SSM SendCommand 인자/로그에 JSON 내용을 넣지 않는다. 파일 준비와 아래 실행은 별개 단계다. 원본 파일은 실행 후에도 유지한다.

```sh
# EC2에서 파일이 준비된 뒤 실행. 실제 경로·실행자·사유를 지정한다.
sudo env RESTAURANT_INPUT_FILE=/안전한경로/restaurants.production.private.json \
  bash /opt/chongmuya/deployment/current/deploy.sh data-restaurants import \
  --actor operator --reason '확인된 매장 최초 등록'
# 위 결과 확인 후 같은 명령 끝에 --execute

sudo bash /opt/chongmuya/deployment/current/deploy.sh data-restaurants show --key example-restaurant
sudo bash /opt/chongmuya/deployment/current/deploy.sh data-restaurants menus --id <매장-UUID>
sudo env RESTAURANT_INPUT_FILE=/안전한경로/update.private.json \
  bash /opt/chongmuya/deployment/current/deploy.sh data-restaurants update \
  --actor operator --reason '담당 연락처 보완' --execute
```

호스트 실행은 `RESTAURANT_INPUT_FILE`을 사용하며 `--file`은 컨테이너 내부 경로로 코드가 지정한다. `compose.tools.yml`의 `restaurant-data`가 현재 성공 릴리스의 이미지, app DB 설정, 기존 RDS CA와 verify-full TLS를 사용한다. Parameter Store `/chongmuya/prod/DATABASE_URL` 하나만 읽으며 migrator/마스터 계정은 거부한다. 미적용 migration이 있으면 데이터 작업을 거부한다.

root 복사 도우미가 원본 권한·1MiB 상한을 확인하고 임시 복사본만 node 소유 0600으로 만든다. 컨테이너에는 읽기 전용으로 마운트한다. 정상·실패·신호 종료 후 임시 입력·환경변수 파일을 지운다. 기존 API를 중단하거나 포트를 열지 않는다. 작은 장애 복구 입력의 32KB 제한은 유지한다.

호스트도 `menu-prices --id <매장-UUID>`를 지원하며 가격 파일은 동일한 `RESTAURANT_INPUT_FILE`로 전달한다. 새 명령을 포함한 릴리스가 배포되어 있어야 한다. 문의 문자·예약 링크 복구는 [운영](operations.md)의 별도 업무 도구를 사용한다.

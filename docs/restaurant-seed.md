# 매장 시드

`apps/api/src/database/seeds`에 실행 진입점(`run-seed.ts`), 매장 시드(`restaurants.seed.ts`), 가상 시드(`restaurants-demo.seed.ts`), 데이터(`data/`)를 둔다. 공개 `restaurants.json`만 빌드에 포함한다.

## 실행

로컬 PostgreSQL의 `DATABASE_URL`과 `NODE_ENV=development` 또는 `test`를 사용한다. URL 쿼리 옵션·운영 환경은 허용하지 않는다. migration은 기존 API 환경 설정으로 별도 적용한다.

```sh
pnpm --filter @chongmuya/api build
pnpm --filter @chongmuya/api db:migration:run
pnpm --filter @chongmuya/api db:seed:restaurants

# 가상 매장만 필요한 경우
pnpm --filter @chongmuya/api db:seed:restaurants:demo

# 실제 담당자 입력이 필요한 경우
pnpm --filter @chongmuya/api db:seed:restaurants --contacts-file src/database/seeds/data/restaurant-contacts.private.json
```

실제 연락처 파일은 공개 데이터 옆 `data/restaurant-contacts.private.json`에 두고 Git·빌드에서 제외한다. 파일 옵션을 지정하지 않으면 읽지 않는다. 형식은 `{ "contacts": [...] }`이며 각 항목은 `restaurantKey`, `name`, `phone`(숫자 문자열), 선택적 `active`(기본 true), `requestConsentAt`(시간대 포함 시각 또는 null), `consentNote`(문자열 또는 null)이다. 시드는 계정 생성·연락·문자 발송을 하지 않는다.

## 데이터와 재실행

- 매장 4곳·공간 11개·메뉴 146개이며 가격 미확인 30개는 null이다. 조사 출처와 원문은 공개 JSON에 보존한다. 지그재그는 제외한다.
- 개미집투 최대 80명·전체 대관 최소 70명, 오태식 ROOM 20명이다. 미확인 비용은 null이며 무료로 취급하지 않는다.
- 예약금·취소/환불은 `매장과 협의가 필요해요.`, 공통 이미지는 `/images/restaurant-placeholder.png`다.
- 고정 key에서 ID를 생성하고 없는 행만 추가한다. 재실행해도 운영자가 수정한 값·철회한 동의·기존 문의 참조를 덮어쓰지 않는다. 문의 이력에 남은 담당자를 삭제했어도 다시 생성하지 않는다. JSON 수정으로 기존 행이 갱신되지는 않는다.
- 시드·migration은 설치·빌드·서버 시작에 자동 실행하지 않는다. ROOM 기록이 생긴 뒤 해당 migration의 rollback은 중단한다.

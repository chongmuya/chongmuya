# 협업 규칙

설치·실행은 [README](../README.md), 코드 경계는 [아키텍처](architecture.md), PR 입력 양식은 [템플릿](../.github/pull_request_template.md)을 따른다.

## 브랜치와 커밋

- 최신 `main`에서 짧게 사용하는 작업 브랜치를 만든다. 이름은 `타입/영문-kebab-case`로 작성한다. 예: `fix/reservation-status`, `docs/current-code-cleanup`.
- 다른 작업자의 미커밋 변경을 덮어쓰거나 공유 브랜치 이력을 임의로 재작성하지 않는다.
- 커밋·PR 제목은 `type(scope): 한국어 설명`이다. scope는 변경 위치에 맞게 `web`, `api`, `repo` 또는 업무 영역을 사용한다.
- 타입은 `feat`, `fix`, `refactor`, `docs`, `test`, `build`, `ci`, `perf`, `style`, `chore` 중 목적에 맞게 선택한다. `style`은 코드 서식 변경이며 화면 기능·디자인 변경을 뜻하지 않는다.
- 한 커밋·PR은 함께 설명하고 되돌릴 수 있는 하나의 목적을 가진다. 호환성을 깨면 `!`와 본문의 `BREAKING CHANGE:`로 영향과 대응 방법을 설명한다.

```text
fix(reservations): 일괄 수정 미리보기의 중복 검사 보완
```

## PR과 병합

- 진행 중에는 Draft, 검증·자기 검토를 마쳤으면 Ready for review로 전환한다.
- 본문은 **변경 내용 / 확인 방법 / 관련 이슈**로 작성한다. 문제와 결과, 실제 검증과 미실행 사유를 적는다. 화면·설정 변경에는 필요한 자료·적용 방법을 함께 적는다.
- 제목과 본문은 최종 변경 범위를 설명한다. 임시 커밋 목록·작업 일지·해당하지 않는 체크리스트를 붙이지 않는다.
- 실제로 해결한 이슈만 `Closes #번호`, 단순 참고는 `관련: #번호`, 없으면 `없음`으로 적는다.
- 가능하면 작성자 외 1명의 리뷰를 받는다. 기본 병합은 **Squash and merge**이며, 병합 후 사용이 끝난 작업 브랜치를 정리한다.
- GitHub의 브랜치 보호·필수 체크 설정은 저장소 코드와 별개다. 설정 여부를 추정하지 않는다.

## 검증

- `.nvmrc`와 `packageManager` 버전을 사용한다. frozen install로 로컬 Git hook도 준비된다. pre-commit은 스테이징된 파일을 포맷하고 부분 스테이징을 보호한다.
- 앱·의존성·빌드 변경: `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`.
- DB 변경: 전용 격리 DB의 `TEST_DATABASE_URL`로 `pnpm test:integration`을 추가한다.
- 웹/API 연결 변경: `pnpm dev`에서 직접 호출·CORS와 성공·실패·복구 화면을 확인한다.
- 문서 변경: 포맷, 내부 링크, 명령·설정과 현재 코드의 일치 여부를 확인한다. 앱 빌드·DB 테스트를 반복하지 않는다.
- 리뷰 전 diff를 읽고 비밀값·환경 파일·불필요한 생성물이 없는지 확인한다. 자동 테스트와 실브라우저·실공급자 검증을 구분한다.

## 문서 유지

README는 시작 방법과 문서 진입점, 각 문서는 해당 주제의 현재 기준만 담는다. 코드의 전체 API·폴더·버전 목록을 반복하거나 과거 검수 기록을 계속 덧붙이지 않는다. 명령·정책이 바뀌면 기존 설명을 고치고, 제거한 문서의 링크도 함께 정리한다.

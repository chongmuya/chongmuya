# API 첫 운영 배포

웹은 Vercel `https://chongmuya.com`, API는 EC2의 호스트 Nginx → Docker Compose → RDS다. Cloudflare는 **DNS only**, 단일 Nginx만 거치며 API 포트는 호스트 loopback에만 연다. 이 문서의 명령은 운영자가 실행한다. 이미지 발행은 수동 GitHub Actions, 배포는 SSM 터미널이며 교체 중 짧은 중단이 있다.

## 1. 한 번 준비할 것

EC2는 Linux amd64, Docker Engine, **Compose 2.30.0 이상**, AWS CLI v2, Bash, GNU coreutils, `flock`, curl, tar, Nginx, Certbot이 필요하다. EC2 보안 그룹은 필요한 80/443만 공개하고 3001은 열지 않는다. RDS 5432는 EC2 보안 그룹에서만 허용한다. 기존 설치·CA 경로와 Cloudflare 프록시 상태는 운영자가 확인한다. 이 코드 작업에서 AWS 실설정을 조회하거나 변경하지 않았다.

기존 ECR/EC2 Role/Parameter Store를 재사용한다. 실제 계정 ID·ECR 이름·Role ARN은 GitHub **repository variables** `AWS_ACCOUNT_ID`, `ECR_REPOSITORY`, `API_PUBLISH_ROLE_ARN`에 넣는다. 리전은 `ap-northeast-2`다.

- GitHub OIDC Role: `sts:AssumeRoleWithWebIdentity`, audience `sts.amazonaws.com`. 현재 저장소는 immutable subject를 사용한다. 확인한 정확한 subject는 `repo:chongmuya@348108103/chongmuya@1433880681:ref:refs/heads/main`이다. 일반적인 `repo:chongmuya/chongmuya:ref:refs/heads/main` 예시를 그대로 쓰지 않는다. 이번 workflow에는 GitHub environment가 없으며 이를 추가하면 trust의 subject도 다시 맞춘다.
- Push Role: `ecr:GetAuthorizationToken`은 `*`; 해당 repository ARN에 `ecr:BatchCheckLayerAvailability`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`, `ecr:PutImage`, `ecr:DescribeImages`, `ecr:BatchGetImage`, `ecr:GetDownloadUrlForLayer`. EC2·SSM·앱 비밀 조회 권한은 주지 않는다.
- EC2 instance Role: SSM 접속용 `AmazonSSMManagedInstanceCore`, `ecr:GetAuthorizationToken` 및 해당 repository의 `BatchGetImage`, `GetDownloadUrlForLayer`, `BatchCheckLayerAvailability`; 해당 계정의 `arn:aws:ssm:ap-northeast-2:<계정 ID>:parameter/chongmuya/prod/*`에 `ssm:GetParametersByPath`. SecureString이 고객 관리 KMS 키를 사용한다면 그 키에 `kms:Decrypt`와 키 정책 허용도 필요하다. SSM 터미널을 여는 사용자 권한과 instance Role은 별개다.

Parameter Store `/chongmuya/prod/<변수명>`에 아래 값을 준비한다. 비밀은 SecureString으로 저장한다. 스크립트는 AWS CLI의 모든 페이지를 읽고 앱 schema를 재사용해 검증한다. 오류에 값은 표시하지 않는다.

| 변수               | 운영값                                               |
| ------------------ | ---------------------------------------------------- |
| NODE_ENV           | production                                           |
| WEB_ORIGIN         | https://chongmuya.com                                |
| API_PORT           | 3001                                                 |
| API_DOCS_ENABLED   | false                                                |
| TRUST_PROXY_HOPS   | 1                                                    |
| MESSAGE_PROVIDER   | solapi                                               |
| GEOCODING_PROVIDER | naver                                                |
| KAKAO_REDIRECT_URI | https://api.chongmuya.com/api/v1/auth/kakao/callback |

필수 비밀/설정: `DATABASE_URL`, `AUTH_SECRET`, `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`, `SOLAPI_SENDER_NUMBER`, `SOLAPI_WEBHOOK_SECRET`, `NAVER_MAP_CLIENT_ID`, `NAVER_MAP_CLIENT_SECRET`, `MERCHANT_REPLY_TOKEN_ENCRYPTION_KEY`, `OWNER_SUPPORT_EMAIL`. 기존 키를 배포마다 재생성하지 않는다. 문의 링크 암호화 키는 기존 64자리 hex를 유지한다. `TRUSTED_PROXY_CIDRS`는 제거한다.

카카오는 `KAKAO_CLIENT_ID`·`KAKAO_CLIENT_SECRET`·`KAKAO_REDIRECT_URI`를 함께 설정한다. 메일은 `RESEND_API_KEY`·`RESEND_FROM`·`EMAIL_VERIFICATION_SECRET`를 함께 설정하고 실제 회신 주소 `RESEND_REPLY_TO`도 확인한다. 가입 검증에는 `OCTOMO_API_KEY`, 실제 약관 4종의 `SIGNUP_TERMS_JSON`도 필요하다. 정확한 형식은 루트 `.env.example`을 따른다. 공급자 설정을 넣었다는 사실은 발신번호·잔액·허용 IP·외부 등록까지 검증했다는 뜻이 아니다.

모든 값은 **한 줄**로 저장한다(JSON은 compact JSON). 공백·따옴표·`$`·`#`는 값 그대로 넣고 shell용 따옴표로 감싸지 않는다. Compose `env_file.format: raw`가 보존하며 `source`/`eval`은 사용하지 않는다. `api.env`·DB 전용 `db.env`는 release마다 원자적으로 생성되는 0600 파일이다. 컨테이너 환경과 Docker 접근 권한도 비밀 접근 권한이다.

DB URL은 사용자명과 비밀번호를 각각 URL 인코딩해 저장한다. URL 전체를 출력하거나 명령 인자로 붙이지 않는다.

```text
postgresql://<URL_ENCODED_DB_USER>:<URL_ENCODED_PASSWORD>@chongmuya-prod.cp6awyiq6zpo.ap-northeast-2.rds.amazonaws.com:5432/chongmuya?sslmode=verify-full&sslrootcert=/run/certs/rds-global-bundle.pem
```

AWS 공식 CA를 기존 설치와 대조해 준비한다. CA는 공개 파일이므로 컨테이너 UID 1000도 읽을 수 있게 0644로 둔다.

```bash
sudo install -d -m 0755 /opt/chongmuya/certs
curl --fail --silent --show-error https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o /tmp/rds-global-bundle.pem
sudo install -m 0644 /tmp/rds-global-bundle.pem /opt/chongmuya/certs/rds-global-bundle.pem
```

API와 migration 모두 이 파일을 `/run/certs/rds-global-bundle.pem:ro`로 마운트한다. 실제 위치가 다르면 첫 실행의 `RDS_CA_FILE`로 지정한다. RDS DNS 이름의 인증서 체인·호스트명을 검증하고 별도 `ssl` 객체나 `PGSSL*`는 주입하지 않는다. API SQL 제한은 기존 2초, migration만 statement 60초·lock 5초다. DDL 시간을 허용하되 오래 잠금을 기다리지 않도록 했으며 실패 시 원인을 확인한다. synchronize/migrationsRun/dropSchema는 모두 false다.

## 2. 이미지 발행과 배포 파일 가져오기

변경이 main에 들어가고 **동일 main SHA의 CI가 성공한 뒤**, Actions → **Publish API** → Run workflow → main을 실행한다. workflow는 그 실행 SHA를 checkout하고 CI 성공을 확인한 뒤 Linux amd64 이미지를 전체 SHA 태그로 push한다. Summary의 `Commit`과 `Image ...@sha256:...`를 사용한다. 앱 비밀은 빌드에 넣지 않는다. 같은 SHA를 다시 실행하면 기존 digest를 재사용한다. ECR SHA 태그는 IMMUTABLE로 설정하고 current/previous 이미지를 수명 정책으로 삭제하지 않는다. 초기에는 공격적인 image prune을 사용하지 않는다. 비밀이 없는 `deployment-<SHA>` Actions artifact에 Compose·스크립트·Nginx·source-sha·image·안내를 함께 제공한다.

배포 묶음은 Actions artifact에서 받을 수 있다. SSM 터미널에서는 공개 저장소의 **같은 SHA**로도 동일한 파일을 가져올 수 있다. 아래 두 값은 Actions Summary에서 복사한다. 실행 시 이미지의 source SHA label과 비교하므로 최신 main 파일을 섞지 않는다.

```bash
SHA='<전체 commit SHA>'
IMAGE='<ECR repository URI>@sha256:<digest>'
sudo install -d -m 0755 "/opt/chongmuya/source/$SHA"
curl --fail --location --silent --show-error "https://github.com/chongmuya/chongmuya/archive/$SHA.tar.gz" -o /tmp/chongmuya-source.tar.gz
sudo tar -xzf /tmp/chongmuya-source.tar.gz --strip-components=1 -C "/opt/chongmuya/source/$SHA"
printf '%s\n' "$SHA" | sudo tee "/opt/chongmuya/source/$SHA/infra/source-sha" >/dev/null
sudo bash "/opt/chongmuya/source/$SHA/infra/deploy.sh" deploy "$IMAGE"
# CA가 다른 경로에 이미 설치된 경우만:
# sudo RDS_CA_FILE=/실제/경로/bundle.pem bash "/opt/chongmuya/source/$SHA/infra/deploy.sh" deploy "$IMAGE"
```

EC2 Role로 pull → 환경·CA·런타임 검사 → **같은 digest의 DB 전용 migration** → API 교체 → `/ready`를 최대 120초 기다린다. 처음 세 단계가 실패하면 기존 API를 교체하지 않는다. migration에는 `DATABASE_URL`과 CA만 전달하며 공급자 키가 필요 없다. 성공 시 `/opt/chongmuya/current`가 release를, `/opt/chongmuya/previous`가 직전 정상 release를 가리킨다. 릴리스별 source SHA·ECR digest·실제 image ID·Compose hash/파일·0600 환경 snapshot·migration 전후 목록·시각/단계/결과를 보존한다. 교체 직전 실제 컨테이너와 내부 readiness도 확인한다. 성공한 이미지는 로컬 `chongmuya-api-release:<release-id>` 태그로 보관한다. deploy·rollback·식당 시드는 동일한 flock을 사용한다. `journal`에 시작 단계가 남고 완료 기록이 없으면 강제 종료 가능성이 있으므로 실제 image ID와 `/ready`를 확인한다.

## 3. Nginx와 첫 HTTPS 인증서

`api.chongmuya.com` DNS를 EC2에 연결하고 **Cloudflare DNS only**를 확인한다. 프록시를 켜면 현재 한 홉 신뢰 모델과 실제 IP가 달라지므로 이 구성 그대로 사용하지 않는다. 기존 Nginx default server와 충돌하는 설정이 있으면 검토해 조정한다. 다른 사이트 설정을 일괄 삭제하지 않는다.

처음에는 인증서 파일을 요구하지 않는 HTTP 설정을 사용한다. 아래 `SHA`는 앞 단계 값이다.

```bash
sudo install -d -m 0755 /var/www/certbot
sudo install -m 0644 "/opt/chongmuya/source/$SHA/infra/nginx/api.http.conf" /etc/nginx/conf.d/chongmuya-api.conf
sudo nginx -t
sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/certbot -d api.chongmuya.com
sudo install -m 0644 "/opt/chongmuya/source/$SHA/infra/nginx/api.conf" /etc/nginx/conf.d/chongmuya-api.conf
sudo nginx -t
sudo systemctl reload nginx
sudo certbot renew --dry-run
```

Certbot의 실제 운영 이메일을 입력하고 설치 방식에 맞는 자동 갱신 timer/cron이 활성인지 확인한다. `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx`에 실행 권한을 가진 `#!/bin/sh` 스크립트로 `nginx -t && systemctl reload nginx`를 넣어 갱신된 인증서를 적용한다. 앱 업데이트 때 인증서를 다시 발급하지 않는다.

Nginx는 Host·Forwarded-Host를 검증한 host로, Forwarded-Proto를 실제 scheme으로, Forwarded-For를 `$remote_addr`로 **덮어쓴다**. API는 `TRUST_PROXY_HOPS=1`이다. Origin·쿠키·SOLAPI 서명 헤더와 원본 body를 변경하지 않으며 본문 한도는 256KB다.

access log는 query·쿠키·인증 헤더·Referer 없이 경로·상태·request ID만 기록한다. Nginx error log는 callback의 code/state를 포함한 원 요청 URI를 출력할 수 있어 이 API server에서는 `/dev/null`로 보낸다. 장애는 sanitized access status/upstream status와 Nest 구조화 request ID 로그로 확인한다. 기존 추가 log 설정에서 원문 요청을 중복 기록하지 않는지도 확인한다.

## 4. 첫 공개 확인과 이후 업데이트

- Vercel `NEXT_PUBLIC_API_ORIGIN=https://api.chongmuya.com`을 설정하고 **재빌드**한다. API secret은 Vercel 공개 변수에 넣지 않는다.
- HTTPS `/health` 200, `/ready` 200을 확인한다. `/ready`는 DB 검사이며 SOLAPI·NAVER 발송/검색 성공을 뜻하지 않는다.
- EC2에서 `ss -lnt`로 3001이 127.0.0.1에만 바인딩됐는지 보고, EC2 외부에서 공인 IP:3001 접속이 차단되는지 확인한다. API를 인터넷에 직접 열지 않는다.
- 외부 테스트 요청에 임의 `X-Forwarded-For`·`X-Forwarded-Proto`를 넣어도 인증 cookie가 Secure이고 실제 연결 IP로 제한되는지 확인한다. 필요하면 Nginx에 임시 `$remote_addr`·`$upstream_http_x_request_id`만 기록해 Nest 제한 기록과 대조한 뒤 제거한다. query/header 원문을 켜지 않는다.
- 브라우저에서 이메일 로그인·새로고침 세션 복원·로그아웃·CORS/CSRF, 카카오 callback, Resend/Octomo 가입 인증과 실제 약관을 확인한다. 인증 쿠키는 API host-only·Secure·HttpOnly다.
- NAVER 지도 등록 도메인에 실제 웹 origin을 확인한다. SOLAPI 발신번호·잔액·현재 EC2/NAT 송신 공인 IP 허용 목록을 확인하고 웹훅 `https://api.chongmuya.com/api/v1/webhooks/solapi`와 검증 secret을 연결한다. 실제 공급자 호출과 실발송 검증은 운영자가 허용된 수신자로 실행할 단계다.

이후 업데이트도 새 SHA의 CI → Publish API → 그 SHA의 파일 다운로드 → 새 digest로 `deploy.sh` 순서다. 기존 환경 키를 유지하고 release 파일을 수정해 재사용하지 않는다. 스크립트는 Nginx·DNS·RDS 리소스·Vercel을 변경하지 않는다.

### 첫 식당 데이터

API 시작·일반 배포·rollback은 시드를 실행하지 않는다. 첫 배포로 migration을 적용한 후 아래 명령을 따로 실행한다. 현재 정상 release와 같은 digest·DB 설정·CA를 사용한다.

```bash
sudo bash "/opt/chongmuya/source/$SHA/infra/deploy.sh" seed-restaurants
# 대상 DB host/name, fixture 키, 생성 예정/기존 보존 수를 확인한 뒤:
sudo bash "/opt/chongmuya/source/$SHA/infra/deploy.sh" seed-restaurants --execute
```

기본 dry-run은 읽기 전용이며 미적용 migration이 있으면 거절한다. 실제 조사 식당 공개 정보·공간·메뉴만 추가한다(현재 4곳/11공간/146메뉴; JSON이 기준). 두 번째 실행은 기존 변경·비공개·소유권·문의 참조를 보존하고 누락 행만 추가한다. 충돌 시 전체 transaction을 취소한다. fixture 삭제가 운영 데이터를 삭제하지 않는다.

DB 전용 진입점은 `db:seed:restaurants:production` (`node dist/database/seeds/run-production-restaurants.js [--execute]`)이다. API·문자·메일·지도 공급자를 부팅하지 않는다. 운영에서는 잠금을 공유하는 위 스크립트로 실행한다. 일반 `compose up`에는 migration/seed가 포함되지 않는다. 기존 로컬 명령 `db:seed:restaurants`·`db:seed:demo`의 운영 차단은 유지하고, 운영 이미지에는 데모 진입점·가상 계정 fixture가 없다.

연락처·동의·계정은 생성하지 않는다. 연락처 없는 식당은 공개 목록에 보여도 문의 불가가 정상이다. 실제 담당자 번호/동의는 기존 `merchant:operations --action record-contact --input ...`, 계정 연결은 `owner-link`로 따로 처리한다. 신규 매장 등록 경로도 계속 사용할 수 있다. 시드 후 공개 식당 목록·로그인/쿠키·기존 참석 링크를 확인한다.

## 5. 실패 복구와 운영 명령

실패는 비정상 종료하며 단계와 journal 위치를 표시한다. pull/설정/migration 실패는 기존 API를 교체하지 않는다. 교체 실패 시 **새 migration 0건 + 교체 직전 정상인 기록된 release + 동일한 현재 설정**인 경우에만 직전 API로 한 번 복구한다. 복구 성공도 원 deploy는 실패다. 복구 실패·중단 기록은 남으며 무한 재시도하지 않는다. Compose의 unhealthy 자체가 자동 rollback/재시작을 해 주는 것은 아니다.

수동 rollback은 기록된 release ID를 지정한다. 먼저 확인 명령으로 이미지/현재 설정 검증까지 진행한 후, 실제 DB schema와 이전 API 호환성·DB 대상·암호화/인증 키 변경을 확인한다. 확인 플래그 없이는 API를 바꾸지 않는다.

```bash
RELEASE_ID='복구할-정상-release-id'
sudo bash "/opt/chongmuya/source/$SHA/infra/deploy.sh" rollback "$RELEASE_ID"
# 호환성 검토 후 실제 API 교체:
sudo bash "/opt/chongmuya/source/$SHA/infra/deploy.sh" rollback "$RELEASE_ID" --confirm-compatibility
```

rollback은 선택한 이미지·당시 Compose와 **최신 Parameter Store 설정**으로 새 release를 만든다. 옛 DB 비밀번호/폐기된 키를 자동 복원하지 않는다. 현재 API가 unhealthy/없어도 실행되며, 정상 기록이 없는 첫 배포의 복구 요청은 명확히 거절한다. 로컬에 해당 digest가 있으면 ECR 장애 때도 이미지를 재사용하되 최신 설정 조회는 필요하다. build·migration·seed·문자 발송 없이 API만 `--no-deps`로 교체한다. 내부 `/ready` 200과 요청한 실제 image ID를 모두 확인한 뒤 current/previous를 원자적으로 바꾼다. 외부 HTTPS 확인은 별도이며 DNS/Nginx 오류만으로 정상 API를 반복 rollback하지 않는다.

이미지 rollback은 DB 복원이 아니다. `RestaurantCatalogModel1795564800000.down()`은 거절하며 일부 보정 migration은 down이 비어 있다. `migration:revert`를 자동 호출하지 않는다. 새 migration은 직전 API와의 호환성을 검토하고 파괴적 변경을 별도 배포 단계로 나눈다. 성공 release와 당시 배포 묶음은 복구용으로 보관하고 비밀이 든 releases 디렉터리를 Git·Actions artifact·일반 로그에 넣지 않는다.

운영 CLI는 같은 API 이미지와 런타임 환경을 사용한다. 기본 조회·dry-run부터 확인하고 변경할 때만 기존 `--execute`를 사용한다.

```bash
sudo docker compose -p chongmuya --env-file /opt/chongmuya/current/compose.env -f /opt/chongmuya/current/compose.prod.yml run --rm --no-deps api node scripts/merchant-operations.mjs --action deliveries --status FAILED
sudo docker compose -p chongmuya --env-file /opt/chongmuya/current/compose.env -f /opt/chongmuya/current/compose.prod.yml run --rm --no-deps api node scripts/merchant-operations.mjs --help
```

비공개 입력 파일이 필요하면 파일을 `chown 1000:1000`, `chmod 0600`으로 준비하고 `run`의 service 이름 앞에 `--volume /보호된/입력파일:/run/input.json:ro`를 추가한다. 컨테이너는 UID/GID 1000이며 운영 CLI의 `--input /run/input.json`을 쓴다. 파일을 이미지에 COPY하거나 stdout에 출력하지 않는다.

## 6. 백업·운영 확인

운영자의 AWS 읽기 권한으로 RDS의 자동 백업 보존 기간(0이 아닌지), LatestRestorableTime, 콘솔 Automated backups의 복원 가능 시작/끝 시각을 확인한다. 예:

```bash
aws rds describe-db-instances --region ap-northeast-2 --query "DBInstances[?Endpoint.Address=='chongmuya-prod.cp6awyiq6zpo.ap-northeast-2.rds.amazonaws.com'].[DBInstanceIdentifier,BackupRetentionPeriod,LatestRestorableTime]" --output table
```

운영 데이터가 있는 위험한 DB 변경 전에는 snapshot과 복원 절차를 확인한다. 매 배포마다 자동 snapshot을 만들지는 않는다. PITR은 새 DB 인스턴스를 만들므로 복원 시점 이후 데이터 손실 범위, 새 endpoint·보안 그룹·parameter group·TLS·Parameter Store·API 연결을 따로 확인한다. Seoul RDS의 새 DNS 이름도 verify-full로 검증하며, DB명/CA 경로는 동일 계약을 유지한다. 실제 백업 설정 확인·snapshot·복원 실행은 이 코드 작업에 포함되지 않았다.

배포 중 중단된 문자는 `deliveries` 조회 → `reconcile` 결과 확인 → 확실히 미접수인 건만 `retry` 순서로 처리한다. PENDING/PROCESSING/UNKNOWN을 일괄 재발송하지 않는다. 헬스체크·배포·시드는 문자를 보내지 않는다. 별도 큐/워커는 추가하지 않았다.

컨테이너 로그는 10MB×3으로 제한한다. 호스트 Nginx의 logrotate가 `api-access.log`를 포함하는지, `df -h`와 `docker system df`로 디스크 여유를 확인한다. 장애 시 release journal의 실패 단계, sanitized Nginx status와 Nest request ID를 대조한다. 첫 공개 전 외부 HTTPS 가용성 점검과 EC2 status check·RDS 가용성/저장 공간 알림의 수신자를 정한다. CloudWatch 상세 수집·대시보드·SSM 완전 자동화는 별도 후속 작업이다.

## 로컬 배포 검증

```bash
docker build --platform linux/amd64 --label "org.opencontainers.image.revision=$(git rev-parse HEAD)" -f apps/api/Dockerfile -t chongmuya-api:deployment-test .
node --test infra/deployment.test.mjs
bash -n infra/deploy.sh
```

테스트는 임시 TLS DB와 실제 Docker/Compose로 migration·운영 시드·raw 환경값·종료·두 image ID 사이의 배포/rollback·동시 실행 거절을 확인한다. AWS/ECR 호출은 로컬 대역이며 새 migration 보고/복구 명령 실패는 명시적 장애 주입이다. 외부 서비스에 접속하지 않는다. 실제 RDS·ECR push·SSM·HTTPS 인증서 발급·외부 공급자는 별도 운영 확인이다.

근거: [Compose raw env_file](https://docs.docker.com/reference/compose-file/services/#env_file), [RDS PostgreSQL TLS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html), [node-postgres SSL](https://node-postgres.com/features/ssl), [GitHub AWS OIDC](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws), [RDS PITR](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIT.html), [ECR 태그 불변성](https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-tag-mutability.html).

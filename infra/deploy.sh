#!/usr/bin/env bash
set -euo pipefail
umask 077

die() { echo "$*" >&2; exit 1; }
root=${DEPLOY_ROOT:-/opt/chongmuya}
ca=${RDS_CA_FILE:-$root/certs/rds-global-bundle.pem}
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
action=${1:-}; target=${2:-}; confirmed=${3:-}
case "$action" in
  deploy) [[ $# == 2 ]] || die 'Usage: deploy.sh deploy ECR_IMAGE@sha256:DIGEST' ;;
  rollback) [[ $# == 2 || ( $# == 3 && $confirmed == --confirm-compatibility ) ]] || die 'Usage: deploy.sh rollback RELEASE_ID [--confirm-compatibility]' ;;
  seed-restaurants) [[ $# == 1 || ( $# == 2 && $target == --execute ) ]] || die 'Usage: deploy.sh seed-restaurants [--execute]' ;;
  *) die 'Commands: deploy DIGEST | rollback RELEASE_ID [--confirm-compatibility] | seed-restaurants [--execute]' ;;
esac
[[ $root =~ ^/[a-zA-Z0-9_./-]+$ && $root != / ]] || die 'DEPLOY_ROOT must be an absolute path without special characters.'
mkdir -p "$root/releases"
root=$(realpath -e "$root")
exec 9>"$root/deploy.lock"
flock -n 9 || die 'Another deployment, rollback or seed is running.'
version=$(docker compose version --short)
[[ $(printf '%s\n' 2.30.0 "${version#v}" | sort -V | head -n1) == 2.30.0 ]] || die 'Docker Compose >= 2.30.0 is required.'

compose() { local dir=$1; shift; docker compose --project-name chongmuya --env-file "$dir/compose.env" -f "$dir/compose.prod.yml" "$@"; }
container() {
  local id
  id=$(docker ps -aq --filter label=com.docker.compose.project=chongmuya --filter label=com.docker.compose.service=api) || return 1
  [[ -n $id && $id != *$'\n'* ]] || return 1
  printf '%s\n' "$id"
}
verify() {
  local id actual state
  id=$(container) || return 1
  actual=$(docker inspect -f '{{.Image}}' "$id") || return 1
  state=$(docker inspect -f '{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$id") || return 1
  [[ $actual == "$1" && $state == running/healthy ]] || return 1
  docker exec "$id" node --input-type=module -e "const r=await fetch('http://127.0.0.1:3001/ready',{signal:AbortSignal.timeout(2000)});process.exit(r.status===200?0:1)" || return 1
}
aws_role() {
  # Only the EC2 instance role, never a developer profile or inherited access key.
  env -i PATH="$PATH" AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null \
    AWS_EC2_METADATA_DISABLED=false AWS_PAGER='' aws --region ap-northeast-2 \
    --cli-connect-timeout 10 --cli-read-timeout 30 "$@"
}
current=$(readlink -f "$root/current" 2>/dev/null || true)
if [[ $action == seed-restaurants ]]; then
  [[ -f $current/successful ]] || die 'No successful release to seed. Deploy first.'
  result=$(mktemp "$current/seed-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
  args=(); [[ $target != --execute ]] || args=(--execute)
  echo "Seed result: $result"
  status=0
  compose "$current" run --rm --no-deps -T seed-restaurants node dist/database/seeds/run-production-restaurants.js "${args[@]}" | tee "$result" || status=$?
  printf '%s SEED result=%s exit=%s\n' "$(date -u +%FT%TZ)" "${result##*/}" "$status" >> "$current/journal"
  exit "$status"
fi

rollback_from=
if [[ $action == rollback ]]; then
  [[ $target =~ ^[a-zA-Z0-9_-]+$ ]] || die 'Use a recorded release ID, not a path.'
  rollback_from=$root/releases/$target
  [[ -f $rollback_from/successful ]] || die 'No successful rollback target. A first deployment has no previous release.'
  image=$(cat "$rollback_from/image")
else image=$target; fi
[[ $image =~ ^[0-9]{12}\.dkr\.ecr\.ap-northeast-2\.amazonaws\.com/[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$ ]] || die 'A Seoul ECR image digest is required.'
release=$(mktemp -d "$root/releases/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
stage=prepare; replacing=0; recovery_safe=0
printf '%s\n' "$image" > "$release/image"
printf '%s\n' "$action" > "$release/action"
printf '%s\n' 'NOT_RUN (check public HTTPS separately)' > "$release/external-https"
record() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >> "$release/journal"; }
phase() { stage=$1; record "START $stage"; }
recover_once() {
  compose "$current" up -d --no-deps --no-build --pull never --wait --wait-timeout 120 api </dev/null || return 1
  verify "$(cat "$current/image-id")" || return 1
}
finish() {
  local status=$1
  trap - EXIT
  set +e
  rm -rf -- "$release/docker-login"
  rm -f -- "$release/parameters.json"
  if (( status != 0 )); then
    record "FAILED $stage exit=$status"
    if (( replacing && recovery_safe )); then
      record 'RECOVERY_ATTEMPT (no migrations or changed settings)'
      if recover_once; then record RECOVERY_SUCCEEDED; else record RECOVERY_FAILED; fi
    fi
    echo "Operation failed at $stage. Record: $release/journal" >&2
    if [[ -f $current/successful ]]; then
      printf 'After schema/settings review: sudo bash %q rollback %q --confirm-compatibility\n' "$source_dir/deploy.sh" "${current##*/}" >&2
    else echo 'No previous successful release. Correct the failure and deploy again.' >&2; fi
  fi
  exit "$status"
}
trap 'finish "$?"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
record "BEGIN $action release=${release##*/}"
if [[ $action == deploy ]]; then
  [[ -f $source_dir/source-sha ]] || die 'Use a deployment bundle with source-sha.'
  requested_sha=$(cat "$source_dir/source-sha")
else requested_sha=$(cat "$rollback_from/source-sha"); fi
[[ $requested_sha =~ ^[a-f0-9]{40}$ ]] || die 'Invalid source SHA in deployment bundle.'
printf '%s\n' "$requested_sha" > "$release/source-sha"

phase pull
# Manual rollback can use the retained local digest during an ECR outage.
if [[ $action == deploy ]] || ! docker image inspect "$image" >/dev/null 2>&1; then
  mkdir "$release/docker-login"
  export DOCKER_CONFIG=$release/docker-login
  aws_role ecr get-login-password | docker login --username AWS --password-stdin "${image%%/*}" >/dev/null 2>&1
  docker pull --platform linux/amd64 "$image"
fi
expected=$(docker image inspect -f '{{.Id}}' "$image")
sha=$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")
[[ $expected =~ ^sha256:[a-f0-9]{64}$ && $sha =~ ^[a-f0-9]{40}$ ]] || die 'Image ID or source SHA label is missing.'
printf '%s\n' "$expected" > "$release/image-id"
[[ $sha == "$requested_sha" ]] || die 'Image and deployment source SHA differ.'
if [[ $action == deploy ]]; then
  cp "$source_dir/compose.prod.yml" "$release/compose.prod.yml"
else
  [[ $(cat "$rollback_from/source-sha") == "$sha" && $(cat "$rollback_from/image-id") == "$expected" ]] || die 'Recorded rollback image does not match.'
  cp "$rollback_from/compose.prod.yml" "$release/compose.prod.yml"
  checksum=$(sha256sum "$release/compose.prod.yml")
  [[ ${checksum%% *} == "$(cat "$rollback_from/compose-hash")" ]] || die 'Recorded Compose was changed.'
  printf '%s\n' "$target" > "$release/rollback-from"
fi
checksum=$(sha256sum "$release/compose.prod.yml")
printf '%s\n' "${checksum%% *}" > "$release/compose-hash"

phase configuration
[[ -f $ca && -r $ca ]] || die 'RDS CA file is missing.'
ca=$(realpath -e "$ca")
[[ $ca =~ ^/[a-zA-Z0-9_./-]+$ ]] || die 'CA path must not contain special characters.'
# AWS CLI v2 collects every page. Keep raw values out of shell evaluation/logs.
aws_role ssm get-parameters-by-path --path /chongmuya/prod/ --with-decryption --no-recursive --output json > "$release/parameters.json"
docker run --rm -i --platform linux/amd64 --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=$release,dst=/release" \
  --mount "type=bind,src=$ca,dst=/run/certs/rds-global-bundle.pem,readonly" \
  "$image" node scripts/deployment-config.mjs prepare /release < "$release/parameters.json"
rm -- "$release/parameters.json"
printf 'API_IMAGE=%s\nRELEASE_DIR=%s\nRDS_CA_FILE=%s\n' "$image" "$release" "$ca" > "$release/compose.env"
compose "$release" config --quiet
compose "$release" run --rm --no-deps -T api node scripts/deployment-config.mjs check
if [[ $action == rollback ]]; then
  # A rollback always uses fresh secrets and requires a schema/settings review.
  if ! cmp -s "$rollback_from/api.env" "$release/api.env"; then
    record 'SETTINGS_CHANGED (latest SSM settings retained)'
    echo 'Settings differ from the target release. Latest SSM settings will be used.'
  fi
  [[ $confirmed == --confirm-compatibility ]] || die 'Review current DB schema, DB target and key compatibility; rerun with --confirm-compatibility.'
  record 'SCHEMA_SETTINGS_CONFIRMED; MIGRATION_AND_SEED_NOT_RUN'
fi

phase before
id=$(docker ps -aq --filter label=com.docker.compose.project=chongmuya --filter label=com.docker.compose.service=api)
[[ $id != *$'\n'* ]] || die 'Multiple API containers found; refusing replacement.'
if [[ -n $id ]]; then
  actual=$(docker inspect -f '{{.Image}}' "$id")
  printf 'container=%s\nimage=%s\n' "$id" "$actual" > "$release/before"
  if verify "$actual"; then
    record 'BEFORE healthy'
    if [[ -f $current/successful && $(cat "$current/image-id") == "$actual" ]] &&
      cmp -s "$current/api.env" "$release/api.env"; then recovery_safe=1; fi
  else record 'BEFORE unhealthy'; fi
else record 'BEFORE absent'; fi
if [[ $action == deploy ]]; then
  phase migration
  compose "$release" run --rm --no-deps -T migrate > "$release/migrations.jsonl"
  # An unknown outcome or any new migration forbids automatic image recovery.
  if ! tail -n1 "$release/migrations.jsonl" | grep -q '"appliedCount":0}$'; then recovery_safe=0; fi
else recovery_safe=0; fi

phase ready
replacing=1
compose "$release" up -d --no-deps --no-build --pull never --wait --wait-timeout 120 api </dev/null
verify "$expected"
# A bookkeeping failure after readiness must not trigger an unrecorded rollback.
replacing=0
phase record
docker image tag "$expected" "chongmuya-api-release:${release##*/}"
touch "$release/successful"
if [[ -f $current/successful && $current != "$release" ]]; then
  ln -sfn "$current" "$root/previous.new"; mv -Tf "$root/previous.new" "$root/previous"
fi
ln -sfn "$release" "$root/current.new"; mv -Tf "$root/current.new" "$root/current"
record "SUCCEEDED $action internal-ready=200 image=$expected"
echo "API ready. Release ID: ${release##*/}"

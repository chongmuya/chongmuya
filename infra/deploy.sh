#!/usr/bin/env bash
set -euo pipefail
umask 077

die() { echo "$*" >&2; exit 1; }
root=${DEPLOY_ROOT:-/opt/chongmuya}
ca=${RDS_CA_FILE:-$root/certs/rds-global-bundle.pem}
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
action=${1:-}; target=${2:-}
case "$action" in
  deploy) [[ $# == 2 ]] || die 'Usage: deploy.sh deploy ECR_IMAGE@sha256:DIGEST' ;;
  rollback) [[ $# == 3 && $3 == --confirm-compatibility ]] || die 'Usage: deploy.sh rollback RELEASE_ID --confirm-compatibility (review DB schema first)' ;;
  data-restaurants)
    [[ $# -ge 2 && ( $target == import || $target == update || $target == show ) ]] || die 'Usage: deploy.sh data-restaurants import|update|show [options]'
    data_args=("${@:2}") ;;
  operations) operation_args=("${@:2}") ;;
  *) die 'Commands: deploy | rollback | data-restaurants | operations' ;;
esac
[[ $root =~ ^/[a-zA-Z0-9_./-]+$ && $root != / ]] || die 'Invalid DEPLOY_ROOT.'
mkdir -p "$root"
root=$(realpath -e "$root")
exec 9>"$root/deploy.lock"
flock -n 9 || die 'Another deployment, rollback or operation is running. Inspect it before retrying.'
version=$(docker compose version --short)
[[ $(printf '%s\n' 2.30.0 "${version#v}" | sort -V | head -n1) == 2.30.0 ]] || die 'Docker Compose >= 2.30.0 is required.'
# Separate from #32 releases: never delete or rewrite the legacy installation.
state=$root/deployment
mkdir -p "$state/releases" "$state/runtime"
# The lock also covers child processes. Remove abandoned temporary secrets only
# after acquiring it; legacy release snapshots are outside this directory.
for stale in "$state"/.work-*; do [[ ! -d $stale ]] || rm -rf -- "$stale"; done
work=$(mktemp -d "$state/.work-XXXXXX")
stage=prepare; candidate=
current=$(readlink -f "$state/current" 2>/dev/null || true)
report() { printf '%s\n' "$*" | tee -a "$state/last-operation"; }
: > "$state/last-operation"
phase() { stage=$1; report "STAGE=$stage"; }
finish() {
  local code=$?
  trap - EXIT
  rm -rf -- "$work"
  # A failed replacement keeps one active candidate for diagnosis, no secret snapshot.
  if [[ -n $candidate && $candidate != "$(readlink -f "$state/active" 2>/dev/null || true)" && ! -f $candidate/successful ]]; then rm -rf -- "$candidate"; fi
  # Bounded records: current + previous + an active failed replacement, at most three.
  for old in "$state/releases/"*; do
    [[ -d $old ]] || continue
    [[ $old != "$(readlink -f "$state/current" 2>/dev/null || true)" && $old != "$(readlink -f "$state/previous" 2>/dev/null || true)" && $old != "$(readlink -f "$state/active" 2>/dev/null || true)" ]] || continue
    rm -rf -- "$old"
  done
  if (( code != 0 )); then
    report "RESULT=FAILED stage=$stage exit=$code"
    echo 'No automatic rollback. Check the failed stage and DB schema before explicit recovery.' >&2
  fi
  exit "$code"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
aws_role() {
  env -i PATH="$PATH" AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null \
    AWS_EC2_METADATA_DISABLED=false AWS_PAGER='' aws --region ap-northeast-2 \
    --cli-connect-timeout 10 --cli-read-timeout 30 "$@"
}
compose() {
  API_IMAGE=$image API_ENV_FILE=$api_env RDS_CA_FILE=$ca \
    docker compose -p chongmuya -f "$bundle/compose.prod.yml" "$@"
}
tool() {
  API_IMAGE=$image TOOLS_ENV_FILE=$work/db.env RDS_CA_FILE=$ca \
    docker compose -p chongmuya -f "$bundle/compose.tools.yml" run --rm --no-deps -T "$@"
}
if [[ $action == rollback ]]; then
  [[ $target =~ ^[a-zA-Z0-9_-]+$ ]] || die 'Invalid release ID.'
  bundle=$state/releases/$target
  [[ -f $bundle/successful ]] || die 'No retained successful release. First deployment has no previous version.'
elif [[ $action == data-restaurants || $action == operations ]]; then
  [[ -f $current/successful ]] || die 'Deploy a successful release first.'
  bundle=$current
fi
if [[ $action == deploy ]]; then image=$target; else image=$(cat "$bundle/image"); fi
sha=$(cat "$bundle/source-sha")
[[ $sha =~ ^[a-f0-9]{40}$ ]] || die 'Invalid source SHA.'
[[ $image =~ ^[0-9]{12}\.dkr\.ecr\.ap-northeast-2\.amazonaws\.com/[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$ ]] || die 'A Seoul ECR digest is required.'
report "SOURCE_SHA=$sha"
report "IMAGE=$image"
phase pull
export DOCKER_CONFIG=$work/docker
mkdir "$DOCKER_CONFIG"
aws_role ecr get-login-password | docker login --username AWS --password-stdin "${image%%/*}" >/dev/null 2>&1
docker pull --platform linux/amd64 "$image" >/dev/null
[[ $(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image") == "$sha" ]] || die 'Image/source SHA mismatch.'
expected=$(docker image inspect -f '{{.Id}}' "$image")
phase configuration
[[ -f $ca && -r $ca ]] || die 'RDS CA file is missing.'
ca=$(realpath -e "$ca")
helper=(docker run --rm -i --platform linux/amd64 --user "$(id -u):$(id -g)" --mount "type=bind,src=$work,dst=/work" --mount "type=bind,src=$ca,dst=/run/certs/rds-global-bundle.pem,readonly" "$image" node scripts/deployment-config.mjs)
if [[ $action == data-restaurants ]]; then
  aws_role ssm get-parameter --name /chongmuya/prod/DATABASE_URL --with-decryption --output json > "$work/parameters.json"
  "${helper[@]}" data /work < "$work/parameters.json"
  phase restaurant-data
  export DATA_INPUT_FILE=/dev/null
  if [[ $target != show ]]; then
    [[ -n ${RESTAURANT_INPUT_FILE:-} && $RESTAURANT_INPUT_FILE == /* && $RESTAURANT_INPUT_FILE != *:* && -f $RESTAURANT_INPUT_FILE ]] || die 'Use an existing absolute RESTAURANT_INPUT_FILE path.'
    for argument in "${data_args[@]}"; do [[ $argument != --file && $argument != --file=* ]] || die 'Use RESTAURANT_INPUT_FILE instead of --file on the host.'; done
    docker run --rm --platform linux/amd64 --user 0 \
      --mount "type=bind,src=$RESTAURANT_INPUT_FILE,dst=/run/source.json,readonly" \
      --mount "type=bind,src=$work,dst=/work" "$image" sh -ec \
      'node --input-type=module -e '\''import { copyRestaurantInput } from "./scripts/restaurant-data-input.mjs"; await copyRestaurantInput("/run/source.json", "/work/input.json").catch(() => { console.error("Private restaurant input rejected."); process.exitCode = 1; });'\''
       chown node:node /work/input.json'
    DATA_INPUT_FILE=$work/input.json
    data_args+=(--file /run/input.json)
  fi
  tool restaurant-data node scripts/restaurant-data.mjs "${data_args[@]}"
  report 'RESULT=SUCCESS'
  exit 0
fi
# CLI v2 paginates GetParametersByPath. Never source/eval its values.
aws_role ssm get-parameters-by-path --path /chongmuya/prod/ --with-decryption --no-recursive --output json > "$work/parameters.json"
extra=()
if [[ $action == deploy ]]; then
  aws_role ssm get-parameter --name /chongmuya/deploy/prod/DATABASE_URL --with-decryption --output json > "$work/migration.json"
  extra=(/work/migration.json)
fi
"${helper[@]}" prepare /work "${extra[@]}" < "$work/parameters.json"
api_env=$work/api.env
compose config --quiet
compose run --rm --no-deps -T api node scripts/deployment-config.mjs check
if [[ $action == operations ]]; then
  phase operations
  mounts=()
  if [[ -n ${OPERATOR_INPUT_FILE:-} ]]; then
    [[ $OPERATOR_INPUT_FILE == /* && $OPERATOR_INPUT_FILE != *:* && -f $OPERATOR_INPUT_FILE ]] || die 'Use an existing absolute OPERATOR_INPUT_FILE path.'
    # Only this file-copy helper runs as root. The operation still uses USER node.
    docker run --rm --platform linux/amd64 --user 0 \
      --mount "type=bind,src=$OPERATOR_INPUT_FILE,dst=/run/source.json,readonly" \
      --mount "type=bind,src=$work,dst=/work" "$image" sh -ec \
      'node --input-type=module -e '\''import { copyPrivateInput } from "./scripts/merchant-cli.mjs"; await copyPrivateInput("/run/source.json", "/work/input.json").catch(() => { console.error("Private operator input rejected."); process.exitCode = 1; });'\''
       chown node:node /work/input.json'
    mounts=(--volume "$work/input.json:/run/input.json:ro")
  fi
  compose run --rm --no-deps -T "${mounts[@]}" api node scripts/merchant-operations.mjs "${operation_args[@]}"
  report 'RESULT=SUCCESS'
  exit 0
fi
if [[ $action == deploy ]]; then
  phase migration
  tool migrate
  rm -f -- "$work/db.env" "$work/migration.json"
fi
# Only matching deploy files and non-secret identity are retained, never source archives.
candidate=$(mktemp -d "$state/releases/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
cp "$bundle/deploy.sh" "$bundle/compose.prod.yml" "$bundle/compose.tools.yml" "$candidate/"
printf '%s\n' "$sha" > "$candidate/source-sha"
printf '%s\n' "$image" > "$candidate/image"
report "RELEASE_ID=${candidate##*/}"
bundle=$candidate
phase ready
install -m 0600 "$work/api.env" "$state/runtime/api.env.new"
mv -f "$state/runtime/api.env.new" "$state/runtime/api.env"
api_env=$state/runtime/api.env
printf 'API_IMAGE=%s\nAPI_ENV_FILE=%s\nRDS_CA_FILE=%s\n' "$image" "$api_env" "$ca" > "$state/runtime/compose.env"
ln -sfn "$candidate" "$state/active.new"; mv -Tf "$state/active.new" "$state/active"
compose up -d --no-deps --no-build --pull never --wait --wait-timeout 120 api </dev/null
id=$(docker ps -q --filter label=com.docker.compose.project=chongmuya --filter label=com.docker.compose.service=api)
[[ -n $id && $id != *$'\n'* && $(docker inspect -f '{{.Image}}' "$id") == "$expected" ]] || die 'Running image mismatch.'
docker exec "$id" node --input-type=module -e "const r=await fetch('http://127.0.0.1:3001/ready',{signal:AbortSignal.timeout(2000)});process.exit(r.status===200?0:1)"
phase record
touch "$candidate/successful"
if [[ -f $current/successful ]]; then ln -sfn "$current" "$state/previous.new"; mv -Tf "$state/previous.new" "$state/previous"; fi
ln -sfn "$candidate" "$state/current.new"; mv -Tf "$state/current.new" "$state/current"
report 'RESULT=SUCCESS internal-ready=200'

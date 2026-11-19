#!/usr/bin/env bash
set -euo pipefail
[[ $GITHUB_REPOSITORY == chongmuya/chongmuya && $GITHUB_REF == refs/heads/main && $TARGET_SHA =~ ^[a-f0-9]{40}$ ]] || exit 1
if [[ $GITHUB_EVENT_NAME == workflow_run ]]; then
  jq -e --arg sha "$TARGET_SHA" '.workflow_run.head_sha == $sha and .workflow_run.head_branch == "main" and .workflow_run.event == "push" and .workflow_run.conclusion == "success" and .workflow_run.head_repository.full_name == "chongmuya/chongmuya"' "$GITHUB_EVENT_PATH" >/dev/null
else [[ $GITHUB_EVENT_NAME == workflow_dispatch ]] || exit 1; fi
# Verify ancestry, not equality to today's latest main: never substitute another SHA.
relation=$(gh api "repos/$GITHUB_REPOSITORY/compare/$TARGET_SHA...main" --jq .status)
[[ $relation == ahead || $relation == identical ]] || { echo 'Target is not on main.'; exit 1; }
conclusion=$(gh api --method GET "repos/$GITHUB_REPOSITORY/actions/workflows/ci.yml/runs" \
  -f head_sha="$TARGET_SHA" -f branch=main -f event=push -f per_page=1 --jq '.workflow_runs[0].conclusion')
[[ $conclusion == success ]] || { echo 'Successful main CI is required for this exact SHA.'; exit 1; }

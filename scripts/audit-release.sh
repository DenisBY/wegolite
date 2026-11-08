#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later
# Copyright (c) 2026 Wegolite contributors
#
# QUAL-07 licensing audit (D-01, D-03; research Pitfalls 8 and 14).
#
#   sh scripts/audit-release.sh            local checks: what git would publish,
#                                          then what the built site ships
#   sh scripts/audit-release.sh --remote   the public main equals the local main,
#                                          and the served licence documents and
#                                          src/main.ts are byte-identical to it
#
# The local mode fails at the first problem with a specific message. It refuses
# a tracked secret, build output, scratch or third-party agent tooling (T-07-29),
# agent tooling that is not ignored (T-07-30, Pitfall 8), a missing licence
# document or source offer, a foreign origin, uncommitted tracked source, and a
# built site that does not ship the documents, footer and disclaimer.
#
# Inside this script grep is used rather than rg, because the script may run
# where rg is absent. Every command's output is captured before it is tested, so
# a failing command cannot read as a clean result.

set -eu

cd "$(dirname "$0")/.."

REPO_SLUG='DenisBY/wegolite'

fail() {
  echo "release audit: FAIL: $1" >&2
  exit 1
}

MODE=local
case "${1:-}" in
  '') ;;
  --remote) MODE=remote ;;
  *)
    echo "usage: sh scripts/audit-release.sh [--remote]" >&2
    exit 2
    ;;
esac

if [ "$MODE" = local ]; then
  # (1) Deny-list over the tracked paths. The listing is captured first, so a
  # failing git cannot be mistaken for an empty, clean listing.
  TRACKED=$(git ls-files) || fail "git ls-files failed"
  FORBIDDEN=$(printf '%s\n' "$TRACKED" |
    grep -E '^(\.env$|\.agents/|skills-lock\.json$|dist/|node_modules/|test-results/|playwright-report/|scratch/)' || true)
  if [ -n "$FORBIDDEN" ]; then
    fail "tracked paths that must never be published: $(printf '%s' "$FORBIDDEN" | tr '\n' ' ')"
  fi

  # (2) Agent tooling must be ignored, so `git add` cannot pick it up.
  git check-ignore -q .agents/skills || fail ".agents/ is not ignored by .gitignore"
  git check-ignore -q skills-lock.json || fail "skills-lock.json is not ignored by .gitignore"

  # (3) The licence documents exist, and NOTICE carries the source offer.
  for doc in NOTICE LICENSE ASSETS.md; do
    [ -f "$doc" ] || fail "$doc is missing"
  done
  grep -qF "https://github.com/$REPO_SLUG" NOTICE ||
    fail "NOTICE does not carry the source URL https://github.com/$REPO_SLUG"

  # (4) The origin is the public repository.
  ORIGIN=$(git remote get-url origin) || fail "the origin remote is not configured"
  printf '%s\n' "$ORIGIN" | grep -Eq "github\.com[:/]${REPO_SLUG}(\.git)?$" ||
    fail "origin is $ORIGIN, not github.com/$REPO_SLUG"

  # (5) No tracked file outside .planning/ has uncommitted changes. The GSD
  # workflow commits .planning/ itself, so those paths are not this audit's.
  DIRTY=$(git status --porcelain --untracked-files=no) || fail "git status failed"
  OUTSIDE=$(printf '%s\n' "$DIRTY" | grep -v '^$' | grep -Ev '^.. \.planning/' || true)
  if [ -n "$OUTSIDE" ]; then
    fail "uncommitted tracked changes outside .planning/: $(printf '%s' "$OUTSIDE" | tr '\n' ' ')"
  fi

  # (6) The shipped site: build it, then run the compliance spec against the
  # preview. --project=chromium is the Chromium gate (as in test:e2e); the
  # firefox project is headed and needs the cross image's xvfb.
  docker compose run --rm e2e sh -lc \
    "npm run build && npx playwright test --project=chromium tests/e2e/compliance-shipped.spec.ts" ||
    fail "the shipped-site compliance spec failed (docker compose run --rm e2e)"

  echo "release audit: local checks passed"
  exit 0
fi

# --remote: the owner has pushed. The public main must be the gated local main,
# and the bytes the public site serves must match what git holds at that commit.
SHA=$(git rev-parse --verify main^{commit}) || fail "local main does not resolve to a commit"

LS_REMOTE=$(git ls-remote "https://github.com/$REPO_SLUG.git" refs/heads/main) ||
  fail "git ls-remote could not reach https://github.com/$REPO_SLUG.git"
REMOTE_SHA=$(printf '%s\n' "$LS_REMOTE" | head -n 1 | cut -f 1)
[ -n "$REMOTE_SHA" ] || fail "the public remote has no refs/heads/main"
if [ "$REMOTE_SHA" != "$SHA" ]; then
  fail "public main is $REMOTE_SHA but local main is $SHA; the push has not matched the gated commit"
fi

WORK=$(mktemp -d) || fail "mktemp failed"
trap 'rm -rf "$WORK"' EXIT

for path in NOTICE LICENSE ASSETS.md src/main.ts; do
  served="$WORK/served"
  committed="$WORK/committed"
  if ! curl -fsS -o "$served" "https://raw.githubusercontent.com/$REPO_SLUG/$SHA/$path"; then
    fail "public $path is not served at $SHA"
  fi
  git show "main:$path" >"$committed" || fail "main:$path is not in the local repository"
  cmp -s "$served" "$committed" || fail "public $path at $SHA differs from main:$path"
  rm -f "$served" "$committed"
done

echo "release audit: public main matches $SHA"

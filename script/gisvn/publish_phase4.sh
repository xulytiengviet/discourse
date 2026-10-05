#!/usr/bin/env bash
set -euo pipefail
owner="${1:-xulytiengviet}"
[[ "$owner" =~ ^[A-Za-z0-9-]+$ ]] || { echo 'Invalid GitHub owner' >&2; exit 1; }
command -v gh >/dev/null || { echo 'Install GitHub CLI and run gh auth login first.' >&2; exit 1; }
gh auth status
root="$(git rev-parse --show-toplevel)"
output="$(mktemp -d)"
for name in discourse-gisvn-theme discourse-gisvn-geo; do
  if gh repo view "$owner/$name" >/dev/null 2>&1; then
    echo "Repository already exists; will not overwrite: $owner/$name" >&2
    exit 1
  fi
done
for name in discourse-gisvn-theme discourse-gisvn-geo; do
  mkdir -p "$output/$name"
  git -C "$root" archive HEAD "packages/$name" | tar -x -C "$output/$name" --strip-components=2
  git -C "$output/$name" init -b main
  git -C "$output/$name" add .
  git -C "$output/$name" commit -m 'Release GISVN Phase 4 standalone package'
  gh repo create "$owner/$name" --public --source "$output/$name" --remote origin --push
done
echo "Published standalone repositories. Local exports: $output"

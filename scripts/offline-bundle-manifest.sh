#!/usr/bin/env bash
#
# This file is sh/bash and cannot be run by PowerShell: those shells reach the first bare
# `dir_name=` assignment and stop with a syntax error, having run nothing. There is no deliberate
# PowerShell guard at the top the way there is in the .ps1 twin, because a shell that cannot
# parse this file cannot run a guard written in it; the sentence above is the explanation.
#
# scripts/offline-bundle-manifest.sh - the bash twin of scripts/offline-bundle-manifest.ps1.
#
# Write the sha256 manifest for an ORBO offline bundle. The bundle is a directory an IT operator
# assembled on a machine that has internet, to carry through an air-gap into a deployment. This
# script downloads NOTHING: it walks the directory named with -d/--dir, hashes what is there,
# describes what each file is for, and lists what the bundle still needs.
#
# The pinned engine digests below are copied verbatim from
# desktop/src-tauri/src/install.rs (podman_download, compose_download, bun_download), so a bundle
# can be pre-verified against what the app will refuse or accept, without a toolchain. When
# install.rs moves, move this table with it.
#
# Pinned, from install.rs (Podman 6.1.1 publishes an arm64 macOS package only, and Linux takes
# its engine from the distribution's own packages, so neither a darwin-x86_64 Podman nor a
# generic linux Podman file exists):
#   podman-installer-windows-amd64.msi
#     https://github.com/podman-container-tools/podman/releases/download/v6.1.1/...
#     91d0e8ea0846c0151d531c88c329bb2729387231e4d1e42306a8e3ae9d09fc8a
#   podman-installer-windows-arm64.msi
#     https://github.com/podman-container-tools/podman/releases/download/v6.1.1/...
#     8ededac563c3b96abe55560f3379962ff59fd8bda1a185ed221891cb6ccf5cba
#   podman-installer-macos-arm64.pkg
#     https://github.com/podman-container-tools/podman/releases/download/v6.1.1/...
#     9c7b90b406681e5458d69cdb1164a589f7c9b214cab1ca6705fe375876491c09
#   docker-compose-windows-x86_64.exe
#     https://github.com/docker/compose/releases/download/v5.5.1/...
#     a3c0c73033eaede90210345d0cc2233edf4fab8fe0282a91dad8fd8436809d2f
#   docker-compose-windows-aarch64.exe
#     https://github.com/docker/compose/releases/download/v5.5.1/...
#     4bbb5d1ecc75bde1a9ca4afac43f5907c0d3bd0f88c7f00bf481ee7c8c1737be
#   docker-compose-darwin-x86_64
#     https://github.com/docker/compose/releases/download/v5.5.1/...
#     a264d61e824bf08a78867e59cdf32eb09f0aee9ecdf9f6ebfa43f76dc52880f1
#   docker-compose-darwin-aarch64
#     https://github.com/docker/compose/releases/download/v5.5.1/...
#     998735c9b6fe68a4f05895e6ea73d71ad06f9fc7046383ad89e47346781b6af5
#   docker-compose-linux-x86_64
#     https://github.com/docker/compose/releases/download/v5.5.1/...
#     db1889184726840f75c4f9c001048430d4f25b3be3cb084d3ddd762bc0aed576
#   docker-compose-linux-aarch64
#     https://github.com/docker/compose/releases/download/v5.5.1/...
#     732e3a84c1a0f67256ce80bc2598a24546b10ca05f9faa97efceb1171ece2ef7
#   bun-windows-x64-baseline.zip
#     https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/...
#     538f9c846355d9e847b2671bc00c47da4229a0befb24df3282b739770f3b475f
#   bun-windows-aarch64.zip
#     https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/...
#     89841f5a57f2348b67ec0839b718f4bf4ea7d07c371c9ba4b77b6c790f918953
#   bun-darwin-x64-baseline.zip
#     https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/...
#     3e35ad6f53971a9834bf9e6786e2adf72b5f1921cc9a9c5fde073d2972944076
#   bun-darwin-aarch64.zip
#     https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/...
#     d8b96221828ad6f97ac7ac0ab7e95872341af763001e8803e8267652c2652620
#   bun-linux-x64-baseline.zip
#     https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/...
#     a063908ae08b7852ca10939bbdc6ceed3ddabce8fb9402dce83d65d73b36e6c7
#   bun-linux-aarch64.zip
#     https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/...
#     a27ffb63a8310375836e0d6f668ae17fa8d8d18b88c37c821c65331973a19a3b
#
# Exit codes: 0 manifest written (missing files are listed inside, not a failure - an IT
# department typically bundles only its own platform's files); 1 usage error or missing
# directory (with --require-all: something was missing); 2 bad output directory.
#
# Examples:
#   scripts/offline-bundle-manifest.sh 0.1.6 -d /opt/orbo-offline -o /opt/orbo-offline/MANIFEST.txt
#   scripts/offline-bundle-manifest.sh --tag 0.1.6 --dir /opt/orbo-offline
#   scripts/offline-bundle-manifest.sh 0.1.6 -o manifest.txt              # hashes the cwd
#   scripts/offline-bundle-manifest.sh 0.1.6 -d /opt/orbo-offline --require-all
#   scripts/offline-bundle-manifest.sh --help

set -euo pipefail

usage() {
  awk 'NR==1{next} /^set -euo pipefail$/{exit} {print}' "$0"
  exit 0
}

# The digest helper: first of sha256sum, shasum -a 256 or openssl that exists on the machine.
dig() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -- "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 -- "$1" | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 -r -- "$1" | awk '{print $1}'
  else
    echo "offline-bundle-manifest: need sha256sum, shasum or openssl on PATH" >&2
    exit 1
  fi
}

red() { printf '  \033[0;31m%s\033[0m\n' "$1"; }
green() { printf '  \033[0;32m%s\033[0m\n' "$1"; }

version=''
dir=''
out=''
require_all=0

while [ $# -gt 0 ]; do
  case "$1" in
    -v) version="$2"; shift 2 ;;
    -d) dir="$2"; shift 2 ;;
    -o) out="$2"; shift 2 ;;
    -r|-R) require_all=1; shift ;;
    --version|-version|--tag|-tag) if [ -n "${2:-}" ]; then version="$2"; shift 2; else shift; fi ;;
    --dir|--directory|-directory) if [ -n "${2:-}" ]; then dir="$2"; shift 2; else shift; fi ;;
    --out|-out) if [ -n "${2:-}" ]; then out="$2"; shift 2; else shift; fi ;;
    --require-all) require_all=1; shift ;;
    -h|--help|-help) usage ;;
    --) shift; break ;;
    -*) echo "offline-bundle-manifest: unknown flag: $1" >&2; exit 1 ;;
    *) if [ -z "$version" ]; then version="$1"; else
         echo "offline-bundle-manifest: one positional version only" >&2; exit 1; fi
       shift ;;
  esac
done

[ -n "$version" ] || version='0.1.6'
[ -n "$dir" ] || dir=$(pwd)

if [ ! -d "$dir" ]; then
  red "Not a directory: $dir"
  exit 1
fi
dir=$(cd "$dir" && pwd)

if [ -z "$out" ]; then
  out="$dir/MANIFEST.txt"
fi
out_dir=$(dirname -- "$out")
out_name=$(basename -- "$out")
if [ ! -d "$out_dir" ]; then
  red "Not a directory: $out_dir"
  exit 2
fi
out="$out_dir/$out_name"

tmp=$(mktemp)
missing=$(mktemp)
trap 'rm -f "$tmp" "$missing"' EXIT

{
  echo "ORBO offline bundle manifest"
  echo "version: $version"
  echo "directory: $dir"
  echo "written: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  echo "Each line: sha256  bytes  filename  [comparison against the digest install.rs pins]  what it is in the deployment."
  echo
} >"$tmp"

present=0

# 1. The release source tarball for the tag. There is no published digest to compare against:
# the release publishes none and the app itself fetches over https. What IT records here is what
# the checksum CMDB says the bundle's tarball is.
tarball="$dir/$version.tar.gz"
if [ -f "$tarball" ]; then
  printf '%s  %s  %s  [%s]  %s\n' \
    "$(dig "$tarball")" \
    "$(wc -c <"$tarball" | tr -d ' ')" \
    "$version.tar.gz" \
    'no pinned digest; IT records this one' \
    'release source tarball; the app fetches it at first launch (ORBO_RELEASES_TARBALL_TEMPLATE when overridden); placed in the deployment root when offline' \
    >>"$tmp"
  present=$((present + 1))
else
  echo "$tarball" >>"$missing"
  echo "MISSING  -         $version.tar.gz  [release source tarball; the deployment cannot be unpacked without it]" >>"$tmp"
fi

# 2. container-images.json, the release asset digest-pinning every image the version runs.
images="$dir/container-images.json"
if [ -f "$images" ]; then
  printf '%s  %s  %s  [%s]  %s\n' \
    "$(dig "$images")" \
    "$(wc -c <"$images" | tr -d ' ')" \
    container-images.json \
    'no pinned digest; IT records this one' \
    'image manifest release asset (ORBO_RELEASES_ASSETS_TEMPLATE when overridden); placed beside the deployment root' \
    >>"$tmp"
  present=$((present + 1))
else
  echo "$images" >>"$missing"
  echo "MISSING  -         container-images.json  [image manifest asset; without it Compose cannot resolve image digests]" >>"$tmp"
fi

# 3. Desktop installers, whatever platform set IT carries. Carrying two platforms' installers in
# one bundle is fine; nothing here refuses them for that.
seen_any=0
for f_path in $(find "$dir" -maxdepth 1 -type f \
  \( -name '*.msi' -o -name '*.dmg' -o -name '*.deb' -o -name '*.AppImage' \
     -o -name '*-setup.exe' -o -name 'ORBO_*.exe' \) | sort); do
  name=$(basename -- "$f_path")
  printf '%s  %s  %s  [%s]  %s\n' \
    "$(dig "$f_path")" \
    "$(wc -c <"$f_path" | tr -d ' ')" \
    "$name" \
    'no pinned digest; IT records this one' \
    'desktop installer (msi/dmg/deb/AppImage/nsis-setup) for this release' \
    >>"$tmp"
  present=$((present + 1))
  seen_any=1
done
if [ "$seen_any" = 0 ]; then
  echo '<desktop installer for this release>' >>"$missing"
  echo "MISSING  -         <none of *.msi *.dmg *.deb *.AppImage *-setup.exe>  [desktop installer for this release]" >>"$tmp"
fi

# 4. Engine installers the app pulls at first launch, with the digests install.rs refuses to
# deviate from. The digest table above is the truth; the list below is only what gets looked
# up and verified.
check_pinned() {
  # $1 name of the pinned file, $2 pinned sha256, $3 what it is
  local path="$dir/$1"
  if [ -f "$path" ]; then
    local got
    got=$(dig "$path")
    local verdict
    if [ "$got" = "$2" ]; then
      verdict='matches pinned digest'
    else
      verdict="DOES NOT match pinned digest $2"
    fi
    printf '%s  %s  %s  [%s]  %s\n' \
      "$got" \
      "$(wc -c <"$path" | tr -d ' ')" \
      "$1" \
      "$verdict" \
      "$3" \
      >>"$tmp"
    present=$((present + 1))
  else
    echo "$path" >>"$missing"
    echo "MISSING  -         $1  [$3; the app would fetch it at first launch; carry it, or the engine fetch must reach ORBO_ENGINE_MIRROR or a file copy]" >>"$tmp"
  fi
}

check_pinned podman-installer-windows-amd64.msi \
  91d0e8ea0846c0151d531c88c329bb2729387231e4d1e42306a8e3ae9d09fc8a \
  'container-engine installer; pinned by desktop/src-tauri/src/install.rs'
check_pinned podman-installer-windows-arm64.msi \
  8ededac563c3b96abe55560f3379962ff59fd8bda1a185ed221891cb6ccf5cba \
  'container-engine installer; pinned by desktop/src-tauri/src/install.rs'
check_pinned podman-installer-macos-arm64.pkg \
  9c7b90b406681e5458d69cdb1164a589f7c9b214cab1ca6705fe375876491c09 \
  'container-engine installer (macOS publishes arm64 only); pinned by install.rs'
check_pinned docker-compose-windows-x86_64.exe \
  a3c0c73033eaede90210345d0cc2233edf4fab8fe0282a91dad8fd8436809d2f \
  'compose provider; pinned by desktop/src-tauri/src/install.rs'
check_pinned docker-compose-windows-aarch64.exe \
  4bbb5d1ecc75bde1a9ca4afac43f5907c0d3bd0f88c7f00bf481ee7c8c1737be \
  'compose provider; pinned by desktop/src-tauri/src/install.rs'
check_pinned docker-compose-darwin-x86_64 \
  a264d61e824bf08a78867e59cdf32eb09f0aee9ecdf9f6ebfa43f76dc52880f1 \
  'compose provider; pinned by desktop/src-tauri/src/install.rs'
check_pinned docker-compose-darwin-aarch64 \
  998735c9b6fe68a4f05895e6ea73d71ad06f9fc7046383ad89e47346781b6af5 \
  'compose provider; pinned by desktop/src-tauri/src/install.rs'
check_pinned docker-compose-linux-x86_64 \
  db1889184726840f75c4f9c001048430d4f25b3be3cb084d3ddd762bc0aed576 \
  'compose provider; pinned by desktop/src-tauri/src/install.rs'
check_pinned docker-compose-linux-aarch64 \
  732e3a84c1a0f67256ce80bc2598a24546b10ca05f9faa97efceb1171ece2ef7 \
  'compose provider; pinned by desktop/src-tauri/src/install.rs'
check_pinned bun-windows-x64-baseline.zip \
  538f9c846355d9e847b2671bc00c47da4229a0befb24df3282b739770f3b475f \
  'bun runtime; pinned by desktop/src-tauri/src/install.rs'
check_pinned bun-windows-aarch64.zip \
  89841f5a57f2348b67ec0839b718f4bf4ea7d07c371c9ba4b77b6c790f918953 \
  'bun runtime; pinned by desktop/src-tauri/src/install.rs'
check_pinned bun-darwin-x64-baseline.zip \
  3e35ad6f53971a9834bf9e6786e2adf72b5f1921cc9a9c5fde073d2972944076 \
  'bun runtime; pinned by desktop/src-tauri/src/install.rs'
check_pinned bun-darwin-aarch64.zip \
  d8b96221828ad6f97ac7ac0ab7e95872341af763001e8803e8267652c2652620 \
  'bun runtime; pinned by desktop/src-tauri/src/install.rs'
check_pinned bun-linux-x64-baseline.zip \
  a063908ae08b7852ca10939bbdc6ceed3ddabce8fb9402dce83d65d73b36e6c7 \
  'bun runtime; pinned by desktop/src-tauri/src/install.rs'
check_pinned bun-linux-aarch64.zip \
  a27ffb63a8310375836e0d6f668ae17fa8d8d18b88c37c821c65331973a19a3b \
  'bun runtime; pinned by desktop/src-tauri/src/install.rs'

echo >>"$tmp"

# 5. The npm dependency set. Nothing here can be hashed before it is resolved: bun 1.3.14 has
# no offline mode and no cache export (no `bun install --offline`; `bun pm cache` only prints
# ~/.bun/install/cache, and copying that directory is undocumented best-effort, not a
# contract). The supported offline npm story is an internal registry mirror reachable at
# install time, set with ORBO_NPM_REGISTRY or a bunfig.toml [install] registry line placed
# beside the deployment - docs/it-deployment.md. Never part of --require-all.

if [ "$require_all" = 1 ] && [ -s "$missing" ]; then
  while IFS= read -r line; do
    red "Missing from the bundle: $line"
  done <"$missing"
  echo
  exit 1
fi

cat "$tmp" >"$out"

echo
green "Manifest written: $out"
missing_count=0
[ -s "$missing" ] && missing_count=$(wc -l <"$missing" | tr -d ' ')
echo "  Present: $present file(s); missing: $missing_count (single-platform bundles are allowed to miss other platforms' files)."
exit 0

#!/usr/bin/env bash
# ClapperModel·ModalBellSynth Swift 단위 테스트 (docs/Spec.md §8)
# swift-tests/*.swift 와 ios/ 의 순수 로직 소스를 swiftc로 묶어 실행한다.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE_DIR="$ROOT_DIR/modules/bearbell-engine"
IOS_DIR="$ENGINE_DIR/ios"
TEST_DIR="$ENGINE_DIR/swift-tests"

SOURCES=()

for name in ShakeSensitivity.swift ClapperModel.swift ModalBellSynth.swift; do
  if [[ -f "$IOS_DIR/$name" ]]; then
    SOURCES+=("$IOS_DIR/$name")
  else
    echo "warning: $IOS_DIR/$name not found" >&2
  fi
done

for file in "$TEST_DIR"/*.swift; do
  SOURCES+=("$file")
done

BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bearbell-swift-tests.XXXXXX")"
trap 'rm -rf "$BUILD_DIR"' EXIT

echo "Compiling ${#SOURCES[@]} files..."
swiftc -O -o "$BUILD_DIR/SwiftTests" "${SOURCES[@]}"

"$BUILD_DIR/SwiftTests"

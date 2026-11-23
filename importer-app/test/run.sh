#!/usr/bin/env bash
# Runs the add-on analyzer tests on a normal JVM (no Android needed).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=$(mktemp -d)
javac -d "$OUT" src/io/github/fawn2004/addonimporter/PackAnalyzer.java test/PackAnalyzerTest.java
java -cp "$OUT" PackAnalyzerTest ../dist "$OUT/zips"

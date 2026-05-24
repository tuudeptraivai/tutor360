#!/usr/bin/env bash
#
# Scaffold a single feature module under apps/api/src/modules/<MODULE>/
# following the Video 05 folder convention (slide 4 + slide 13).
#
# Usage:
#   bash backend/tools/scaffold-module.sh courses
#
# Idempotent: existing files are left untouched (never overwritten).
# This is a dev-time helper only — it is NOT run in CI.

set -euo pipefail

MODULE="${1:-}"
if [[ -z "$MODULE" ]]; then
  echo "usage: bash tools/scaffold-module.sh <module-name>" >&2
  exit 1
fi

# Resolve repo paths relative to this script so it works from any CWD.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_SRC="$SCRIPT_DIR/../apps/api/src"
MOD_DIR="$API_SRC/modules/$MODULE"

# PascalCase the kebab-case module name (e.g. tutor-availability -> TutorAvailability).
pascal() {
  echo "$1" | awk -F- '{ for (i = 1; i <= NF; i++) printf "%s%s", toupper(substr($i, 1, 1)), substr($i, 2) }'
}
NAME="$(pascal "$MODULE")"

mkdir -p "$MOD_DIR/dto" "$MOD_DIR/repositories"

# create_file <path> <content> — only writes when the file does not yet exist.
create_file() {
  local path="$1"
  local content="$2"
  if [[ -e "$path" ]]; then
    echo "skip   $path (exists)"
    return
  fi
  printf '%s' "$content" > "$path"
  echo "create $path"
}

create_file "$MOD_DIR/$MODULE.module.ts" "import { Module } from '@nestjs/common';

@Module({})
export class ${NAME}Module {}
"

create_file "$MOD_DIR/$MODULE.controller.ts" "import { Controller } from '@nestjs/common';

@Controller('$MODULE')
export class ${NAME}Controller {}
"

create_file "$MOD_DIR/$MODULE.service.ts" "import { Injectable } from '@nestjs/common';

@Injectable()
export class ${NAME}Service {}
"

create_file "$MOD_DIR/$MODULE.repository.ts" "export interface ${NAME}Repository {}
"

create_file "$MOD_DIR/$MODULE.constants.ts" "// DI tokens, enum const for ${NAME}Module — fill at feature video.
"

create_file "$MOD_DIR/index.ts" "export { ${NAME}Module } from './$MODULE.module';
"

create_file "$MOD_DIR/dto/.gitkeep" ""
create_file "$MOD_DIR/repositories/.gitkeep" ""

echo "done   $MODULE"

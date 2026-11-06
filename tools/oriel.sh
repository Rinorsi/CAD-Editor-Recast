#!/bin/bash
# 调用 Oriel MCP 工具（stdio 客户端），把结果摘要打印出来。
#   bash tools/oriel.sh <工具名> '<参数JSON>'      例：bash tools/oriel.sh oriel_check '{"projectId":"item-editor"}'
# 完整回执写到工作区 daily/<今天>/scratch/editor-ui/<工具名>.out.json。
set -e
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -W)"
MODS="$(cd "$HERE/.." && pwd -W)"
DAY="$(date +%F)"
export ORIEL_ROOT="$MODS/Oriel-UI" ORIEL_WORKSPACE="$MODS/Oriel-UI-Workspace"
export JAVA_HOME="$(cygpath -w "$(cygpath -u "$USERPROFILE")/.jdks/jdk-25.0.5+8")"
export ORIEL_MCP_STATE="$MODS/Oriel-UI-Workspace/daily/2026-11-05/scratch/mcp-editor-ui"
export ORIEL_MC_JAR="$MODS/Oriel-UI/common/versions/26.1/build/moddev/artifacts/vanilla-26.1.2-1-merged.jar"
S="$MODS/Oriel-UI-Workspace/daily/$DAY/scratch/editor-ui"
mkdir -p "$S"
printf '%s' "${2:-{\}}" > "$S/$1.in.json"
cd "$MODS/Oriel-UI"
node tools/mcp/client.mjs "$1" "$S/$1.in.json" "$S/$1.out.json" > "$S/$1.log" 2>&1 || true
node -e '
const o = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const s = o.structuredContent || {};
if (o.isError) console.log("ERROR", s.code, s.message);
const keep = ["stage", "revisionId", "url", "sessionId", "reviewId", "status", "ok", "passed", "summary"];
for (const k of keep) if (s[k] !== undefined) console.log(k + ":", typeof s[k] === "object" ? JSON.stringify(s[k]) : s[k]);
const d = s.diagnostics || (s.details && s.details.diagnostics) || [];
console.log("diagnostics:", d.length);
const seen = new Set();
d.forEach(x => { const f = String(x.file || "").split(/[\\/]/).slice(-1)[0]; const key = x.ruleId + f + x.line + x.message; if (seen.has(key)) return; seen.add(key); console.log(" ", x.severity, x.ruleId, f + ":" + x.line + ":" + x.column, String(x.message).slice(0, 180)); });
const shots = s.shots || s.screenshots || (s.snapshots) || [];
if (shots.length) console.log("shots:", JSON.stringify(shots).slice(0, 900));
' "$S/$1.out.json"

const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const run = path.resolve(root, "../Oriel-UI-Workspace/daily/2026-11-06/run/editor-registry-probe");
const data = {}; vm.runInNewContext(fs.readFileSync(path.join(root, "common/src/main/resources/assets/cadeditor/ui/js/data.js"), "utf8"), data);
const live = JSON.parse(fs.readFileSync(path.join(run, "registry-snapshot.json"), "utf8"));
const out = {};
for (const [kind, old] of Object.entries({items:"items", enchantments:"enchants", mob_effects:"effects", attributes:"attrs"})) {
  const baseline = data.EDATA[old].map(e => typeof e === "string" ? e : e.id).map(e => e.includes(":") ? e : "minecraft:" + e);
  const current = live[kind].map(e=>e.id);
  out[kind] = {baseline:baseline.length, live:current.length, added:current.filter(e=>!baseline.includes(e)), removed:baseline.filter(e=>!current.includes(e))};
}
const output = path.join(run, "registry-baseline-diff.json");
fs.writeFileSync(output, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out));

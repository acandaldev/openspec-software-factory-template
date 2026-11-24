import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readAgent(name) {
  return readFile(path.join(ROOT, ".opencode", "agents", `${name}.md`), "utf8");
}

test("reviewer deniega las escrituras de PowerShell", async () => {
  const text = await readAgent("reviewer");
  const commands = [
    "Remove-Item",
    "Move-Item",
    "Copy-Item",
    "Rename-Item",
    "New-Item",
    "Set-Content",
    "Add-Content",
    "Clear-Content",
    "Out-File",
    "Set-Item",
    "Remove-ItemProperty",
    "Set-ItemProperty",
    "New-ItemProperty",
    "Tee-Object",
    "Start-Process",
    "Invoke-Expression",
  ];

  for (const command of commands) {
    assert.ok(
      text.includes(`resource: "${command} *"`),
      `reviewer no deniega ${command}`,
    );
  }
});

test("reviewer deniega los alias y lanzadores que escriben", async () => {
  const text = await readAgent("reviewer");
  const commands = [
    "del",
    "erase",
    "rmdir",
    "rd",
    "move",
    "copy",
    "ren",
    "ni",
    "sc",
    "clc",
    "ac",
    "tee",
    "start",
    "saps",
    "iex",
    "pwsh",
    "powershell",
    "cmd /c",
    "bash -c",
    "sh -c",
  ];

  for (const command of commands) {
    assert.ok(
      text.includes(`resource: "${command} *"`),
      `reviewer no deniega ${command}`,
    );
  }
});

test("implementer deniega el borrado recursivo de PowerShell", async () => {
  const text = await readAgent("implementer");
  assert.ok(text.includes('resource: "Remove-Item *"'), "implementer no deniega Remove-Item");
});

test("openspec-reviewer mantiene el shell en whitelist", async () => {
  const text = await readAgent("openspec-reviewer");
  assert.match(text, /- action: shell\n\s+resource: "\*"\n\s+effect: deny/);
});

// Installs the FUEL-API (backend/, Python) next to the web app so one Render
// service runs both. Runs after `next build` on Render (or with
// EMBED_FUEL_API=1). Never fails the build: without Python the web app keeps
// using the external FUEL_API_URL.
import { execFileSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(web, "..");
const backend = join(root, "backend");
const requirements = join(backend, "requirements.txt");
const marker = join(web, ".api-runtime.json");

if (!process.env.RENDER && process.env.EMBED_FUEL_API !== "1") {
  console.log("setup-api: skipped (not on Render; set EMBED_FUEL_API=1 to embed locally)");
  process.exit(0);
}
rmSync(marker, { force: true });

const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit", cwd: root });
const python = ["python3.12", "python3", "python"].find((p) => {
  try {
    execFileSync(p, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
});
if (!python) {
  console.warn("setup-api: no Python found – the web app will use the external FUEL_API_URL");
  process.exit(0);
}
console.log(`setup-api: using ${execFileSync(python, ["--version"]).toString().trim()}`);

const strategies = [
  () => {
    const venv = join(root, ".api-venv");
    rmSync(venv, { recursive: true, force: true });
    run(python, ["-m", "venv", venv]);
    const py = join(venv, "bin", "python");
    run(py, ["-m", "pip", "install", "--no-cache-dir", "-q", "-r", requirements]);
    return { python: py, pythonPath: "" };
  },
  () => {
    const target = join(root, ".api-packages");
    rmSync(target, { recursive: true, force: true });
    run(python, ["-m", "pip", "install", "--no-cache-dir", "-q", "--target", target, "-r", requirements]);
    return { python, pythonPath: target };
  },
];

for (const [i, strategy] of strategies.entries()) {
  try {
    const runtime = strategy();
    execFileSync(runtime.python, ["-c", "import fastapi, uvicorn, httpx, openpyxl"], {
      env: { ...process.env, PYTHONPATH: runtime.pythonPath },
    });
    writeFileSync(marker, JSON.stringify({ ...runtime, backend }, null, 2));
    console.log(`setup-api: FUEL-API embedded (strategy ${i + 1})`);
    process.exit(0);
  } catch (e) {
    console.warn(`setup-api: strategy ${i + 1} failed: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
  }
}
if (!existsSync(marker)) console.warn("setup-api: could not install the FUEL-API – the web app will use the external FUEL_API_URL");

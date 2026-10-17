// Starts the web app and, when setup-api.mjs embedded it, the FUEL-API on a
// private port. The API is restarted if it exits; the web app is the main
// process (its exit ends the service).
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const marker = join(web, ".api-runtime.json");
const API_PORT = process.env.FUEL_API_PORT || "8001";
const env = { ...process.env };
let api = null;
let stopping = false;

function startApi(runtime, attempt = 0) {
  api = spawn(runtime.python, ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", API_PORT], {
    cwd: runtime.backend,
    env: { ...process.env, PYTHONPATH: runtime.pythonPath || "", PYTHONUNBUFFERED: "1" },
    stdio: "inherit",
  });
  const started = Date.now();
  api.on("exit", (code, signal) => {
    if (stopping) return;
    // Back off if it keeps crashing right after start.
    const next = Date.now() - started < 30_000 ? Math.min(attempt + 1, 6) : 0;
    const delay = 1000 * 2 ** next;
    console.warn(`fuel-api exited (${signal ?? code}); restarting in ${delay / 1000}s`);
    setTimeout(() => startApi(runtime, next), delay);
  });
}

if (existsSync(marker)) {
  const runtime = JSON.parse(readFileSync(marker, "utf8"));
  startApi(runtime);
  env.FUEL_API_URL = `http://127.0.0.1:${API_PORT}`;
  console.log(`fuel-api embedded on 127.0.0.1:${API_PORT}`);
} else {
  console.log(`fuel-api not embedded; using ${env.FUEL_API_URL || "the default FUEL_API_URL"}`);
}

const nextBin = join(web, "node_modules", "next", "dist", "bin", "next");
const app = spawn(process.execPath, [nextBin, "start", ...(process.env.PORT ? ["-p", process.env.PORT] : [])], {
  cwd: web,
  env,
  stdio: "inherit",
});

function stop(signal) {
  stopping = true;
  api?.kill(signal);
  app.kill(signal);
}
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));
app.on("exit", (code) => {
  stopping = true;
  api?.kill("SIGTERM");
  process.exit(code ?? 0);
});

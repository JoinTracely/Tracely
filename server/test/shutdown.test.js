/**
 * SIGTERM drains (Codex review R1, 2026-10-22): Railway stops the old process
 * with SIGTERM on every deploy. The server takes no new work, finishes what is
 * in flight (so a billed call is charged to its pool) and exits 0.
 *
 * POSIX only: on Windows a child process cannot be sent a catchable SIGTERM
 * (child.kill ends it outright), so these run in CI on Linux.
 */
import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const POSIX = process.platform !== "win32";
const SCRUB = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "OPENAI_API_KEY", "TRACELY_HOSTED", "TRACELY_PUBLIC_HOSTS", "TRACELY_BIND", "TRACELY_LLM_PROVIDER"];

const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.unref();
  probe.on("error", reject);
  probe.listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});

async function boot() {
  const port = await freePort();
  const env = { ...process.env };
  for (const k of SCRUB) delete env[k];
  const child = spawn(process.execPath, [path.join(HERE, "..", "server.js")], {
    env: { ...env, TRACELY_MOCK: "1", PORT: String(port), TRACELY_DATA_DIR: mkdtempSync(path.join(tmpdir(), "tracely-shutdown-")), TRACELY_DRAIN_MS: "10000" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout.on("data", (c) => { out += c; });
  const exited = new Promise((resolve) => child.on("exit", (code) => resolve(code)));
  for (let i = 0; i < 100; i++) {
    if (await canConnect(port)) return { port, child, exited, log: () => out };
    await new Promise((r) => setTimeout(r, 50));
  }
  child.kill("SIGKILL");
  throw new Error("server did not start");
}

const canConnect = (port) => new Promise((resolve) => {
  const s = net.connect(port, "127.0.0.1");
  s.on("connect", () => { s.destroy(); resolve(true); });
  s.on("error", () => resolve(false));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("SIGTERM with a check in flight: no new connections, the check finishes, then a clean exit", { skip: !POSIX && "needs POSIX signals; runs in CI" }, async () => {
  const { port, child, exited, log } = await boot();
  const body = JSON.stringify({ text: "Water boils at 100 degrees Celsius at sea level.", sentences: [{ id: "s1", text: "Water boils at 100 degrees Celsius at sea level." }] });
  const half = Math.floor(body.length / 2);
  const sock = net.connect(port, "127.0.0.1");
  let response = "";
  sock.on("data", (c) => { response += c; });
  await new Promise((r) => sock.on("connect", r));
  sock.write(`POST /api/check HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body.slice(0, half)}`);
  await sleep(200); // the request is now in the handler, waiting for the rest of its body

  child.kill("SIGTERM");
  await sleep(300);
  assert.equal(child.exitCode, null, "it is still finishing the check");
  assert.equal(await canConnect(port), false, "and takes no new connections");

  sock.write(body.slice(half));
  const code = await Promise.race([exited, sleep(5000).then(() => "timeout")]);
  assert.equal(code, 0, `exit ${code}; log:\n${log()}`);
  assert.match(response, /^HTTP\/1\.1 200/, "the check in flight was answered");
  assert.match(log(), /SIGTERM: finishing 1 request\(s\) in flight/);
  assert.match(log(), /drained; exiting/);
});

test("SIGTERM with nothing in flight exits at once", { skip: !POSIX && "needs POSIX signals; runs in CI" }, async () => {
  const { child, exited } = await boot();
  const t0 = Date.now();
  child.kill("SIGTERM");
  const code = await Promise.race([exited, sleep(3000).then(() => "timeout")]);
  assert.equal(code, 0);
  assert.ok(Date.now() - t0 < 2000, `took ${Date.now() - t0} ms`);
});

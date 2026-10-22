/**
 * Hosting the server behind a platform proxy (Railway, 2026-10): the Host
 * headers a public deployment answers to, the extension ids it admits, and
 * the container that runs it.
 *
 * On the Linode, Apache rewrites Host to 127.0.0.1:4477, so hostAllowed()'s
 * loopback list was enough. Railway's proxy keeps the caller's Host
 * (api.jointracely.com, and healthcheck.railway.app for its health check), so
 * a deployment there lists them in TRACELY_PUBLIC_HOSTS. Without that every
 * request is a 403, the health check included, and the deploy never goes live.
 */
import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, "..");
const REPO = path.join(SERVER, "..");

const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.unref();
  probe.on("error", reject);
  probe.listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});

const OLD_ID = "a".repeat(32);
const NEW_ID = "b".repeat(32);
// Variables that would change what these servers do if the shell had them.
const SCRUB = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "OPENAI_API_KEY", "TRACELY_EXTENSION_ID", "TRACELY_PUBLIC_HOSTS",
  "TRACELY_TRUSTED_PROXY_HOPS", "TRACELY_HOSTED", "TRACELY_BIND", "TRACELY_LLM_PROVIDER"];

async function boot(extra) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const port = await freePort();
    const env = { ...process.env };
    for (const k of SCRUB) delete env[k];
    let exited = false;
    const child = spawn(process.execPath, [path.join(SERVER, "server.js")], {
      env: { ...env, TRACELY_MOCK: "1", PORT: String(port), TRACELY_DATA_DIR: mkdtempSync(path.join(tmpdir(), "tracely-hosting-")), ...extra },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.on("exit", () => { exited = true; });
    for (let i = 0; i < 100 && !exited; i++) {
      try { if ((await get(port, "/api/status")).status === 200 && !exited) return { port, child }; } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 50));
    }
    child.kill();
    if (!exited) break;
  }
  throw new Error("server did not start");
}

// node:http, not fetch: fetch will not let a caller choose the Host header.
function send(port, method, pathname, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: pathname, method, headers: { Host: `127.0.0.1:${port}`, ...(body ? { "Content-Type": "application/json" } : {}), ...headers } }, (res) => {
      let text = "";
      res.on("data", (c) => { text += c; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: text }));
    });
    req.on("error", reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
const get = (port, pathname, headers = {}) => send(port, "GET", pathname, headers);

let pub;
let plain;
let hosted;
test.before(async () => {
  pub = await boot({ TRACELY_PUBLIC_HOSTS: "api.example.test, healthcheck.railway.app", TRACELY_EXTENSION_ID: `${OLD_ID}, ${NEW_ID}` });
  plain = await boot({});
  hosted = await boot({ TRACELY_HOSTED: "1" });
});
test.after(() => { pub?.child.kill(); plain?.child.kill(); hosted?.child.kill(); });

// The local web app's own routes (LOCAL_ONLY_ROUTE in server.js).
const LOCAL_ONLY = [
  ["GET", "/api/documents"], ["POST", "/api/documents", { title: "x" }], ["GET", "/api/documents/latest"], ["GET", "/api/documents/abc"],
  ["PUT", "/api/documents/abc", { title: "y" }], ["DELETE", "/api/documents/abc"],
  ["GET", "/api/library"], ["POST", "/api/library", { title: "z" }], ["DELETE", "/api/library/abc"],
  ["GET", "/api/analyses?documentId=abc"], ["POST", "/api/analyses", {}],
  ["POST", "/api/clear-history", {}], ["GET", "/api/stats"], ["GET", "/api/evidence/for-claim?claimText=x"],
  ["GET", "/api/watch/state"], ["POST", "/api/watch/toggle", { enabled: false }],
];

test("a deployed server refuses the local web app's storage routes, which ask no one who is calling", async () => {
  for (const [method, p, body] of LOCAL_ONLY) {
    const r = await send(hosted.port, method, p, {}, body);
    assert.equal(r.status, 403, `${method} ${p} answered ${r.status} on a hosted server`);
    assert.match(r.body, /only available on a local Tracely server/);
  }
  assert.equal((await get(hosted.port, "/api/status")).status, 200, "status still answers, for the health check");
  assert.equal((await get(hosted.port, "/api/prefs")).status, 200, "the prefs read is unchanged (its PUT was already refused)");
});

test("a laptop server keeps them", async () => {
  assert.equal((await get(plain.port, "/api/documents")).status, 200);
  assert.equal((await get(plain.port, "/api/stats")).status, 200);
  assert.equal((await get(plain.port, "/api/library")).status, 200);
});

test("a listed public host is answered, its health check's host included, case-insensitively", async () => {
  for (const host of ["api.example.test", "API.Example.Test", "healthcheck.railway.app"]) {
    const r = await get(pub.port, "/api/status", { Host: host });
    assert.equal(r.status, 200, `${host} was refused: ${r.body}`);
  }
  assert.equal((await get(pub.port, "/api/status")).status, 200, "loopback stopped working once public hosts were set");
});

test("a host not on the list is still refused, so the DNS-rebinding guard holds", async () => {
  const r = await get(pub.port, "/api/status", { Host: "evil.example.test" });
  assert.equal(r.status, 403);
  assert.match(r.body, /Bad Host header/);
});

test("with no public hosts set, the server answers loopback only, as before", async () => {
  assert.equal((await get(plain.port, "/api/status", { Host: "api.example.test" })).status, 403);
  assert.equal((await get(plain.port, "/api/status")).status, 200);
});

test("TRACELY_EXTENSION_ID admits every id it lists, and no other extension", async () => {
  for (const id of [OLD_ID, NEW_ID]) {
    const origin = `chrome-extension://${id}`;
    const r = await get(pub.port, "/api/status", { Origin: origin });
    assert.equal(r.status, 200, `${id} was refused`);
    assert.equal(r.headers["access-control-allow-origin"], origin);
  }
  const foreign = await get(pub.port, "/api/status", { Origin: `chrome-extension://${"c".repeat(32)}` });
  assert.equal(foreign.status, 403);
});

test("the container serves the extension's engine from where STATIC_FILES looks, and never ships a .env", () => {
  const dockerfile = readFileSync(path.join(SERVER, "Dockerfile"), "utf8");
  const serverJs = readFileSync(path.join(SERVER, "server.js"), "utf8");
  assert.match(serverJs, /"\/ext-content\.js": \{ file: "extension\/content\.js"/, "STATIC_FILES moved /ext-content.js: update server/Dockerfile");
  assert.match(dockerfile, /^COPY extension\/content\.js \.\/extension\/content\.js$/m);
  assert.match(dockerfile, /^COPY server\/ \.\/$/m);
  assert.match(dockerfile, /TRACELY_HOSTED=1/);
  assert.match(dockerfile, /TRACELY_DATA_DIR=\/data/);
  assert.match(dockerfile, /TRACELY_BIND=0\.0\.0\.0/);
  assert.match(dockerfile, /^CMD \["sh", "scripts\/container-start\.sh"\]$/m);
  const ignore = readFileSync(path.join(REPO, ".dockerignore"), "utf8").split(/\r?\n/);
  for (const line of ["*", "!server/", "!extension/content.js", "server/.env", "server/.env.*", "server/data/"]) {
    assert.ok(ignore.includes(line), `.dockerignore lost "${line}"`);
  }
});

test("the container refuses to start when no volume is mounted at the data folder", { skip: !existsSync("/proc/mounts") && "needs Linux (/proc/mounts); runs in CI" }, () => {
  const script = path.join(SERVER, "scripts", "container-start.sh");
  const notMounted = spawnSync("sh", [script], { cwd: SERVER, env: { ...process.env, TRACELY_DATA_DIR: `/tracely-not-a-mount-${process.pid}` }, encoding: "utf8" });
  assert.equal(notMounted.status, 1);
  assert.match(notMounted.stderr, /no volume is mounted at \/tracely-not-a-mount-/);
  const unset = { ...process.env };
  delete unset.TRACELY_DATA_DIR;
  const noDir = spawnSync("sh", [script], { cwd: SERVER, env: unset, encoding: "utf8" });
  assert.notEqual(noDir.status, 0);
  assert.match(noDir.stderr, /TRACELY_DATA_DIR/);
});

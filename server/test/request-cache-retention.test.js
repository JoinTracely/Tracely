/**
 * Cached answers (lib/db.js request_cache) are deleted once past their kind's
 * retention, and no route reads one older than that (2026-10-22).
 *
 * Rows used to stay forever; maxAgeMs was only checked on read. Some carry the
 * writer's own sentences, and PRIVACY.md now promises they go after 1 or 7
 * days, so a route that reads an older answer, or a kind with no retention,
 * would quietly break that promise.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.TRACELY_DATA_DIR = mkdtempSync(path.join(tmpdir(), "tracely-cache-retention-"));
const { db, cacheSet, cacheGet, requestCachePurge, requestCacheRetentionMs } = await import("../lib/db.js");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(path.join(HERE, "..", f), "utf8");
const DAY = 24 * 3600_000;
const age = (kind, key, ms, now) => db.prepare("UPDATE request_cache SET created_at = ? WHERE key = ?").run(now - ms, `${kind}:1:${key}`);

test("each kind's cached answers are deleted once past its retention, and younger ones kept", () => {
  const now = Date.UTC(2026, 9, 22, 12);
  for (const [kind, key, ms] of [
    ["detect", "old", DAY + 1], ["detect", "new", DAY - 60_000],
    ["structure", "old", DAY + 1],
    ["critique", "old", 7 * DAY + 1], ["critique", "new", 6 * DAY],
    ["find-sources", "new", 3 * DAY],
    ["some-new-kind", "old", 7 * DAY + 1], ["some-new-kind", "new", 2 * DAY],
  ]) {
    cacheSet(kind, key, { answer: `${kind} ${key}` });
    age(kind, key, ms, now);
  }
  assert.equal(requestCachePurge(now), 4);
  const left = db.prepare("SELECT key FROM request_cache ORDER BY key").all().map((r) => r.key);
  assert.deepEqual(left, ["critique:1:new", "detect:1:new", "find-sources:1:new", "some-new-kind:1:new"]);
  assert.equal(requestCachePurge(now), 0, "a second sweep finds nothing more");
  assert.deepEqual(cacheGet("critique", "new"), { answer: "critique new" }, "a kept answer still serves");
});

test("no route reads a cached answer older than its kind is kept", () => {
  const src = read("server.js");
  const configs = [...src.matchAll(/kind: "([a-z-]+)"(?:, version: \d+)?, maxAgeMs: ([0-9_ *]+)/g)];
  assert.ok(configs.length >= 6, `found only ${configs.length} cache configs: the pattern needs updating`);
  for (const [, kind, expr] of configs) {
    const ms = expr.replace(/_/g, "").split("*").map((x) => Number(x.trim())).reduce((a, b) => a * b, 1);
    assert.ok(Number.isFinite(ms) && ms > 0, `could not read ${kind}'s maxAgeMs (${expr})`);
    assert.ok(ms <= requestCacheRetentionMs(kind),
      `${kind} is read up to ${ms / DAY} days old but kept ${requestCacheRetentionMs(kind) / DAY}: raise REQUEST_CACHE_RETENTION_MS and PRIVACY.md together`);
  }
});

test("the server sweeps hourly, and PRIVACY.md says how long these answers are kept", () => {
  const src = read("server.js");
  assert.match(src, /requestCachePurge\(\)/);
  assert.match(src, /setInterval\(sweepCache, 3600 \* 1000\)/);
  const privacy = readFileSync(path.join(HERE, "..", "..", "PRIVACY.md"), "utf8");
  const row = privacy.split("\n").find((l) => l.startsWith("|") && /desktop app's results/i.test(l));
  assert.ok(row, "PRIVACY.md's \"What we keep\" table has no row for the desktop app's cached results");
  assert.match(row, /1 day/);
  assert.match(row, /7 days/);
});

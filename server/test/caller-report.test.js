/* Who uses Tracely (lib/callerReport.js, `users` on GET /api/admin/costs).
 * Owner, 2026-11-18: see which users use how many credits, and how many use
 * Tracely without signing up. Read from the usage counts the server already
 * keeps; nothing new is recorded. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Before db.js opens anything: this file's own database.
process.env.TRACELY_DATA_DIR = mkdtempSync(path.join(tmpdir(), "tracely-callers-"));
const { callerReport } = await import("../lib/callerReport.js");
const { db, usageBump, usageAdd } = await import("../lib/db.js");
const { usageDay, usageMonth } = await import("../shared/plan.js");

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 18, 18, 0, 0);
const day = (back) => usageDay(NOW - back * DAY);
const ACCOUNT = "user:6f1c2d3e-0000-4000-8000-000000000001";
const DESKTOP = "user:6f1c2d3e-0000-4000-8000-000000000002";
const INSTALL = "install:0123456789abcdef0123456789abcdef";
const TRYOUT = "demo:" + "a".repeat(64);

test("callers by kind, active by day, new by first day on record, the most spent first", () => {
  db.exec("DELETE FROM entitlement_usage");
  // A signed-in account, first seen 40 days ago, active today and yesterday.
  usageBump(ACCOUNT, day(40), "check");
  usageBump(ACCOUNT, day(1), "check");
  usageBump(ACCOUNT, day(0), "source_search");
  usageBump(ACCOUNT, day(0), "verify_search");
  usageBump(ACCOUNT, day(0), "verify_search");
  usageAdd(ACCOUNT, day(0), "account_ucents", 3_000_000); // 3¢
  usageAdd(ACCOUNT, usageMonth(NOW), "account_ucents", 3_000_000); // a month row: never a day
  // The desktop app's anonymous account, new two days ago.
  usageBump(DESKTOP, day(2), "ai");
  usageAdd(DESKTOP, day(2), "account_ucents", 500_000);
  // A signed-out extension, new today.
  usageBump(INSTALL, day(0), "check");
  usageAdd(INSTALL, day(0), "account_ucents", 100_000);
  // A try-out visitor yesterday.
  usageBump(TRYOUT, day(1), "demo_check");
  usageBump(TRYOUT, day(1), "demo_sources");
  // Not callers: the pools' own totals and an address key.
  usageAdd("__global__", day(0), "spend_ucents", 99_000_000);
  usageBump("addr:ffff", day(0), "check");

  const r = callerReport({ days: 7, now: NOW });
  assert.equal(r.from, day(6));
  assert.equal(r.to, day(0));
  assert.equal(r.byDay.length, 7, "every day in the range, quiet ones too");
  assert.deepEqual(r.totals, {
    accounts: 2, signedOut: 1, tryOut: 1,
    newAccounts: 1, newSignedOut: 1, newTryOut: 1,
    desktopAccounts: 1, cents: 3.6,
  });
  const today = r.byDay.at(-1);
  assert.deepEqual(today, { day: day(0), accounts: 1, signedOut: 1, tryOut: 0, newAccounts: 0, newSignedOut: 1, newTryOut: 0, cents: 3.1 },
    "the pools and the address key are not callers");
  const yesterday = r.byDay.at(-2);
  assert.equal(yesterday.accounts, 1);
  assert.equal(yesterday.tryOut, 1);
  assert.equal(yesterday.newTryOut, 1);
  assert.equal(r.byDay.at(-3).newAccounts, 1, "the desktop account's first day");

  assert.equal(r.callerCount, 4);
  assert.deepEqual(r.callers.map((c) => c.type), ["account", "account", "signed-out", "try-out"], "the most spent first");
  const [acct, desk, inst, tryout] = r.callers;
  assert.deepEqual(acct, {
    id: ACCOUNT, type: "account", firstDay: day(40), lastDay: day(0), activeDays: 2,
    checks: 1, searches: 1, lookups: 2, desktop: 0, cents: 3,
  }, "first seen is the earliest day on record, before the range");
  assert.equal(desk.desktop, 1);
  assert.equal(inst.id, "install:0123456789", "a hash is shortened");
  assert.equal(tryout.id, "demo:aaaaaaaaaa");
  assert.equal(tryout.checks, 1);
  assert.equal(tryout.searches, 1);
});

test("today alone, and a limit on the list", () => {
  const r = callerReport({ days: 1, limit: 1, now: NOW });
  assert.equal(r.from, r.to);
  assert.equal(r.byDay.length, 1);
  assert.equal(r.totals.accounts, 1);
  assert.equal(r.callers.length, 1);
  assert.equal(r.callerCount, 2, "the account and the signed-out install were active today");
});

test("a range across a clock change is still one row per calendar day", () => {
  // 07:05 UTC is 23:05 in California after the clock goes back on 1 November
  // and 00:05 the next day before it: stepping by 24 hours gave 1 November
  // twice. On a server in UTC this holds trivially.
  const r = callerReport({ days: 30, now: Date.UTC(2026, 10, 18, 7, 5, 0) });
  const list = r.byDay.map((d) => d.day);
  assert.equal(list.length, 30);
  assert.equal(new Set(list).size, 30);
  for (let i = 1; i < list.length; i++) {
    const gap = (Date.parse(`${list[i]}T12:00:00Z`) - Date.parse(`${list[i - 1]}T12:00:00Z`)) / DAY;
    assert.equal(gap, 1, `${list[i - 1]} then ${list[i]}`);
  }
});

test("nobody: an empty report, not an error", () => {
  db.exec("DELETE FROM entitlement_usage");
  const r = callerReport({ days: 30, now: NOW });
  assert.equal(r.callers.length, 0);
  assert.equal(r.byDay.length, 30);
  assert.ok(r.byDay.every((d) => d.accounts === 0 && d.signedOut === 0 && d.tryOut === 0));
  assert.equal(r.totals.cents, 0);
});

/* Who uses Tracely (2026-11-18), for the costs page. Owner: "is there a way,
 * on the tracely costs page, to see which users are using how many credits",
 * then, with 15 weekly store users and no sign-ins but his own: "do both".
 *
 * Nothing new is recorded. lib/entitlement.js already keeps, per caller and
 * per day, what that caller was metered on (checks, source searches, lookups,
 * desktop calls) and what its model calls cost (`account_ucents`), in
 * entitlement_usage, kept 13 months (PRIVACY.md, "Usage counts"). This reads
 * those day rows back, grouped by caller:
 *  - `user:<id>`: a Supabase account. A Google sign-in, or the desktop app's
 *    anonymous session; a desktop account has desktop calls (`ai`).
 *  - `install:<hash>`: an extension with no session, so signed out.
 *  - `demo:<hash>`: a visitor to the website's try-out, signed out.
 * Address-only callers (`addr:`) carry no quota, are never recorded, and so
 * are never counted here.
 *
 * Account ids, never emails: no usage row holds an email. An id is looked up
 * in Supabase (Authentication, Users) when it matters. Install and try-out
 * ids are hashes, shortened here, and mean nothing outside this table.
 *
 * Two limits of the rows themselves, said on the page too: a check is counted
 * only where a plan limits checks (Free), so a Student or Pro account's checks
 * show only in what it spent; and "first seen" is the earliest day still on
 * record. */
import { db } from "./db.js";
import { usageDay } from "../shared/plan.js";

// Which usage kinds count as what (lib/entitlement.js, lib/demo.js DEMO_USAGE_KINDS).
const COLUMN = {
  check: "checks",
  demo_check: "checks",
  source_search: "searches",
  demo_sources: "searches",
  verify_search: "lookups",
  ai: "desktop",
};
const SPEND_KIND = "account_ucents";
const TYPES = [["user:", "account"], ["install:", "signed-out"], ["demo:", "try-out"]];

const typeOf = (id) => TYPES.find(([prefix]) => id.startsWith(prefix))?.[1] ?? null;
// An account id stays whole (it is what Supabase shows); a hash is shortened.
const shown = (id) => (id.startsWith("user:") ? id : id.slice(0, id.indexOf(":") + 11));
// Micro-cents as cents, to a ten-thousandth (lib/costLedger.js does the same).
const cents = (ucents) => Math.round(ucents / 100) / 10_000;

const WHO = "(account_id LIKE 'user:%' OR account_id LIKE 'install:%' OR account_id LIKE 'demo:%')";

/* The last `days` usage days, today included: who was active each day, who
 * was new, and every caller with what it did, the most spent first. */
export function callerReport({ days = 7, limit = 100, now = Date.now() } = {}) {
  // Calendar days, stepped on the calendar at noon: stepping by 24 hours gives
  // one day twice and skips another across a clock change (usageDay is local).
  const t = new Date(now);
  const dayList = [];
  for (let i = days - 1; i >= 0; i--) dayList.push(usageDay(new Date(t.getFullYear(), t.getMonth(), t.getDate() - i, 12).getTime()));
  const from = dayList[0];
  const to = dayList[dayList.length - 1];
  // Day rows only: a month row's key is "YYYY-MM" (lib/entitlement.js, "day rows and month rows").
  const rows = db.prepare(
    `SELECT account_id, day, kind, count FROM entitlement_usage WHERE length(day) = 10 AND day >= ? AND day <= ? AND ${WHO}`,
  ).all(from, to);
  const firstSeen = new Map(db.prepare(
    `SELECT account_id, MIN(day) AS first FROM entitlement_usage WHERE length(day) = 10 AND ${WHO} GROUP BY account_id`,
  ).all().map((r) => [r.account_id, r.first]));

  const callers = new Map();
  const perDay = new Map(dayList.map((d) => [d, { day: d, active: new Set(), ucents: 0 }]));
  for (const r of rows) {
    const type = typeOf(r.account_id);
    if (!type || !(r.count > 0)) continue;
    const c = callers.get(r.account_id) ?? {
      id: r.account_id, type, firstDay: firstSeen.get(r.account_id) ?? r.day, lastDay: r.day,
      days: new Set(), checks: 0, searches: 0, lookups: 0, desktop: 0, ucents: 0,
    };
    c.days.add(r.day);
    if (r.day > c.lastDay) c.lastDay = r.day;
    if (r.kind === SPEND_KIND) c.ucents += r.count;
    else if (COLUMN[r.kind]) c[COLUMN[r.kind]] += r.count;
    callers.set(r.account_id, c);
    const d = perDay.get(r.day);
    if (d) {
      d.active.add(r.account_id);
      if (r.kind === SPEND_KIND) d.ucents += r.count;
    }
  }

  const count = (ids, type, isNew = () => true) => [...ids].filter((id) => callers.get(id)?.type === type && isNew(id)).length;
  const byDay = [...perDay.values()].map((d) => {
    const newOn = (id) => callers.get(id).firstDay === d.day;
    return {
      day: d.day,
      accounts: count(d.active, "account"),
      signedOut: count(d.active, "signed-out"),
      tryOut: count(d.active, "try-out"),
      newAccounts: count(d.active, "account", newOn),
      newSignedOut: count(d.active, "signed-out", newOn),
      newTryOut: count(d.active, "try-out", newOn),
      cents: cents(d.ucents),
    };
  });
  const all = [...callers.values()];
  const inRange = (c) => c.firstDay >= from;
  const totals = {
    accounts: all.filter((c) => c.type === "account").length,
    signedOut: all.filter((c) => c.type === "signed-out").length,
    tryOut: all.filter((c) => c.type === "try-out").length,
    newAccounts: all.filter((c) => c.type === "account" && inRange(c)).length,
    newSignedOut: all.filter((c) => c.type === "signed-out" && inRange(c)).length,
    newTryOut: all.filter((c) => c.type === "try-out" && inRange(c)).length,
    desktopAccounts: all.filter((c) => c.type === "account" && c.desktop > 0).length,
    cents: cents(all.reduce((s, c) => s + c.ucents, 0)),
  };
  const list = all
    .sort((a, b) => b.ucents - a.ucents || b.days.size - a.days.size || (a.lastDay < b.lastDay ? 1 : a.lastDay > b.lastDay ? -1 : 0))
    .slice(0, Math.max(0, limit))
    .map((c) => ({
      id: shown(c.id), type: c.type, firstDay: c.firstDay, lastDay: c.lastDay, activeDays: c.days.size,
      checks: c.checks, searches: c.searches, lookups: c.lookups, desktop: c.desktop, cents: cents(c.ucents),
    }));
  return { days, from, to, totals, byDay, callers: list, callerCount: all.length };
}

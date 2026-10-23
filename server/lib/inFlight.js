/**
 * One run for identical work from one caller (Codex review S3, 2026-10-22).
 *
 * The desktop opens a source list from two places, the editor's citation flow
 * and Screen Watch's "Find a source", and both can ask /api/verify-sources
 * for the same list at the same moment: the desktop caches an answer only
 * once it comes back. Each request paid for its own judge call and spent its
 * own AI action. Now, while one request runs, an identical one from the same
 * caller waits for it and gets the same answer (`once`):
 * - **The key** is who is calling, the route, the model and effort chosen,
 *   and the exact input, hashed (`workKey`). It is never the input itself,
 *   and it lives only while the first request runs.
 * - **The first request (the leader) is charged and records the quota.** A
 *   joiner does neither: it is the same caller's same work, answered once.
 * - **A joiner still went through the gate** (the per-caller limiter and its
 *   own spend hold) before it got here, so joining never gets round a limit.
 * - **A failure reaches every joiner** with the same kind, message, status
 *   and retry time, but without the leader's billing tag, so a failure that
 *   cost something is charged once.
 * - **An address-only caller (`addr:`) never joins.** One address can be
 *   many people, and work is never shared across people.
 *
 * In memory only. How often a request joined is counted by the hour
 * (`takeJoinLines`), so whether to widen this past receipts is measured
 * before anyone decides.
 */
import { createHash } from "node:crypto";
import { CheckError } from "./errors.js";

const running = new Map(); // key -> the leader's promise
const joined = new Map(); // route -> joins since the last take

/** The key for one caller's work, or null when it must never be shared. */
export function workKey(caller, route, parts) {
  if (typeof caller !== "string" || !/^(user|install):/.test(caller)) return null;
  return createHash("sha256").update(JSON.stringify([caller, String(route), ...(Array.isArray(parts) ? parts : [parts])])).digest("hex");
}

/* The leader's failure as a joiner sees it: what the client is told, none of
 * what the server bills from (the non-enumerable `llm` tag). */
function forJoiner(err) {
  if (!(err instanceof CheckError)) return new Error(String(err?.message ?? err));
  const copy = new CheckError(err.kind, err.message, { status: err.status, retryAfter: err.retryAfter });
  if (err.feature) copy.feature = err.feature;
  return copy;
}

/**
 * `work()` once per key at a time. `onJoin`, optional, is told when this
 * call joined another's run (the route's log line says so). The leader gets
 * its own result; a joiner gets a copy, so neither can change the other's.
 */
export async function once(key, route, work, { onJoin = null } = {}) {
  if (!key) return work();
  const ahead = running.get(key);
  if (ahead) {
    const label = typeof route === "string" && /^\/api\/[a-z/-]+$/.test(route) ? route : "other";
    joined.set(label, (joined.get(label) ?? 0) + 1);
    if (typeof onJoin === "function") { try { onJoin(); } catch { /* watching only */ } }
    let result;
    try {
      result = await ahead;
    } catch (err) {
      throw forJoiner(err);
    }
    return structuredClone(result);
  }
  const run = (async () => work())();
  running.set(key, run);
  try {
    return await run;
  } finally {
    if (running.get(key) === run) running.delete(key);
  }
}

/** The hourly lines, `[tracely] joined route=… n=…`, and a fresh start. */
export function takeJoinLines() {
  const lines = [...joined].sort(([a], [b]) => a.localeCompare(b)).map(([route, n]) => `[tracely] joined route=${route} n=${n}`);
  joined.clear();
  return lines;
}

/** How many runs are in flight (tests). */
export const runningCount = () => running.size;

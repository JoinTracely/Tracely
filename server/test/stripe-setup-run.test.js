/**
 * scripts/stripe-setup.mjs, run for real against a stand-in Stripe.
 *
 * The other stripe-setup tests (spend.test.js) read its source. The first
 * sandbox run on 2026-10-22 found three things no source check caught:
 * - an account not yet activated stopped a TEST run, which takes test
 *   payments regardless;
 * - the portal's Switch plan list had no product ids on a first --apply,
 *   because they were read back from lists made before anything was created;
 * - every --apply made another pair of Payment Links, because Stripe's list
 *   of links leaves line_items out.
 * The stand-in behaves like Stripe on each of those points.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "stripe-setup.mjs");

function fakeStripe({ chargesEnabled }) {
  const s = { products: [], prices: [], links: [], hooks: [], portals: [], portalBodies: [] };
  let n = 0;
  const id = (p) => `${p}_${++n}`;
  const send = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      const url = new URL(req.url, "http://127.0.0.1");
      const p = url.pathname.replace(/^\//, "");
      const f = Object.fromEntries(new URLSearchParams(raw));
      const key = `${req.method} ${p}`;
      if (key === "GET account") return send(res, 200, { charges_enabled: chargesEnabled, payouts_enabled: chargesEnabled });
      if (key === "GET tax/settings") return send(res, 200, { status: "active", defaults: { tax_behavior: "inclusive" } });
      if (key === "GET tax_codes") return send(res, 200, { data: [{ id: "txcd_10103000", name: "Software as a service (SaaS) - personal use" }] });
      if (key === "GET products") return send(res, 200, { data: s.products });
      if (key === "POST products") { const o = { id: id("prod"), name: f.name, tax_code: f.tax_code ?? null, active: true }; s.products.push(o); return send(res, 200, o); }
      if (req.method === "POST" && p.startsWith("products/")) return send(res, 200, s.products.find((x) => x.id === p.slice(9)));
      if (key === "GET prices") return send(res, 200, { data: s.prices });
      if (key === "POST prices") {
        const o = { id: id("price"), product: f.product, unit_amount: Number(f.unit_amount), currency: f.currency, active: true,
          recurring: { interval: f["recurring[interval]"], interval_count: Number(f["recurring[interval_count]"]) } };
        s.prices.push(o); return send(res, 200, o);
      }
      // Like Stripe: a listed link carries no line_items unless expanded.
      if (key === "GET payment_links") return send(res, 200, { data: s.links.map(({ line_items, ...l }) => l) });
      if (key === "POST payment_links") {
        const o = { id: id("plink"), url: `https://buy.stripe.com/test_${n}`, active: true,
          metadata: { price_id: f["metadata[price_id]"] }, line_items: { data: [{ price: { id: f["line_items[0][price]"] } }] } };
        s.links.push(o); return send(res, 200, o);
      }
      if (key === "GET webhook_endpoints") return send(res, 200, { data: s.hooks });
      if (key === "POST webhook_endpoints") {
        const events = Object.keys(f).filter((k) => k.startsWith("enabled_events")).map((k) => f[k]);
        const o = { id: id("we"), url: f.url, enabled_events: events, status: "enabled", secret: "whsec_stand_in" };
        s.hooks.push(o); return send(res, 200, o);
      }
      if (key === "GET billing_portal/configurations") return send(res, 200, { data: s.portals });
      if (key === "POST billing_portal/configurations") {
        s.portalBodies.push(f);
        for (let i = 0; f[`features[subscription_update][products][${i}][prices][0]`]; i++) {
          if (!f[`features[subscription_update][products][${i}][product]`]) {
            return send(res, 400, { error: { message: `Missing required param: features[subscription_update][products][${i}][product].` } });
          }
        }
        const o = { id: id("bpc"), active: true, is_default: true, features: { subscription_cancel: { enabled: true } } };
        s.portals.push(o); return send(res, 200, o);
      }
      send(res, 404, { error: { message: `stand-in has no ${key}` } });
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ s, server, base: `http://127.0.0.1:${server.address().port}` })));
}

function run(base, key, args = ["--apply"]) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      env: { ...process.env, STRIPE_KEY: key, STRIPE_API_BASE: base, TRACELY_TAX_CODE: "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (c) => { out += c; });
    child.stderr.on("data", (c) => { out += c; });
    child.on("close", (status) => resolve({ status, out }));
  });
}

test("TEST mode on an account not yet activated: the first --apply builds everything, a second creates nothing", async () => {
  const { s, server, base } = await fakeStripe({ chargesEnabled: false });
  try {
    const first = await run(base, "rk_test_stand_in");
    assert.equal(first.status, 0, first.out);
    assert.match(first.out, /not activated for live payments yet\. Going on/);
    assert.deepEqual([s.products.length, s.prices.length, s.links.length, s.hooks.length, s.portals.length], [2, 2, 2, 1, 1]);
    const portal = s.portalBodies[0];
    assert.deepEqual(
      [portal["features[subscription_update][products][0][product]"], portal["features[subscription_update][products][1][product]"]],
      s.products.map((p) => p.id),
      "the portal's Switch plan lists both products, by the ids this run created",
    );

    const second = await run(base, "rk_test_stand_in");
    assert.equal(second.status, 0, second.out);
    assert.deepEqual([s.products.length, s.prices.length, s.links.length, s.hooks.length, s.portals.length], [2, 2, 2, 1, 1],
      "a re-run made a second copy of something");
    assert.match(second.out, /exists\S*\s+Tracely Student — https:\/\/buy\.stripe\.com\//);
  } finally {
    server.close();
  }
});

test("LIVE mode on an account not yet activated stops before creating anything", async () => {
  const { s, server, base } = await fakeStripe({ chargesEnabled: false });
  try {
    const r = await run(base, "rk_live_stand_in");
    assert.notEqual(r.status, 0);
    assert.match(r.out, /cannot accept charges yet/);
    assert.deepEqual([s.products.length, s.prices.length, s.links.length, s.hooks.length, s.portals.length], [0, 0, 0, 0, 0]);
  } finally {
    server.close();
  }
});

test("the stand-in address is refused unless it is loopback, so a real key only ever goes to Stripe", async () => {
  const r = await run("https://example.com/v1", "rk_test_stand_in", []);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /STRIPE_API_BASE is for the tests only/);
});

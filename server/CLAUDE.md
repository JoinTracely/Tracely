# server/ — the backend every client talks to (Sam deploys)

Read the root `CLAUDE.md` first. Runbooks: `DEPLOY.md` (deploy, rollback,
env), `BILLING.md` (plans, Stripe, Supabase), `scripts/healthcheck.sh`,
`STATUS.md` at the root for what is live. Zero npm dependencies: `node --test`
is the whole toolchain, and it also runs the extension's tests (`test/ext-*`).

## One backend, one reasoning implementation

- **Every AI call from every client goes to `server/`.** The desktop called a
  separate Vercel relay (`questionablepuddle/Tracely-relay`) until the backend
  unification; its prompts, schemas and guardrails moved into the server and
  nothing new ships to the relay. **v0.3.99 (2026-10-03) is the first stable
  release on the server.** Every stable release up to v0.3.97 (2026-08-23)
  predates the move, was compiled against the relay and the since-deleted
  Supabase project `epafyygdvvkgpdkbevqi`, and cannot sign in, so every AI
  call on it fails; 0.3.98-preview.251 (#251) and later previews call the
  server. (There was no stable 0.3.98: `ship` bumps the patch, and `main`
  already said 0.3.98.) A stable install is still a relay-era build until
  its user accepts the 0.3.99 update — production asks first, and
  electron-updater offers only a strictly higher version and cannot
  downgrade.
- **The prompts live in `server/lib/prompts/`**, one file per route, and
  `server/test/prompts.test.js` pins each one's SHA-256. Editing a prompt is
  allowed and should be a decision: every one carries numbers measured on real
  drafts, so re-measure, then update the hash. Since 2026-10-22 (Codex review
  R4) the prompts written inline are pinned too: the extension's check and
  source search, the flow and review prompts (`factcheck.js`
  `INLINE_PROMPTS`), the receipts' `VERIFY_SYSTEM` and `COVER_SYSTEM`, and
  the custom-grade prompt. Before that, only `lib/prompts/` was.
- **The guardrails run on the server**, so every client gets them:
  `normalizeCritique` (a revision may only narrow; `fabricated` is withdrawn
  when no reference lookup ran) and `verifyGrade` (a finding whose quote is not
  in the draft is dropped), in `server/shared/`. The desktop still runs its own
  copies on the answer; both are idempotent.
- **A source search shows its receipts** (`lib/sourceVerify.js`, 2026-10-07;
  three judges found 16 of 51 "relevant" sources backed the sentence). Every
  source `/api/sources` returns is READ — the OpenAlex abstract, its
  open-access copy when the abstract does not settle it, else the page; never
  a PDF — and judged in the one existing verify call. It is
  `supports`/`refutes` only with a verbatim `quote` from that text, checked
  by `matchQuote` (whitespace, quote marks, dashes, case folded; word
  boundaries kept), and carries `verified`, `readFrom`, `quote` — additive,
  optional. Unread or unjudged is `context` + `verified: false`, never
  backing, which every installed extension already honours. Retracted works
  (Crossref `updated-by`/`update-to`, PubMed, OpenAlex `is_retracted`) are
  dropped; a DOI whose registered title or year is another work's is not
  applied (`lib/sourceEnrich.js` `sameWork`). The route's `verified` and
  `retracted` tallies are log-line only. A judge that split the claim into
  parts (#327: `supports` only with a quote for every part, `refutes` on any
  one part) was live from 2026-10-13 and reverted the same day. On the same
  310 judged sources, the good "backs" it kept fell from 34 to 9, and 23 of
  its 26 "contradicts" were wrong (`eval/goldset/README.md`). Measure any
  change to the judge with `eval/goldset/run-verify-prod.mjs` before it ships.
  A "backs" whose quote does not show the figure the sentence states ("roughly
  70 percent" backed by "8 to 10 hours") is `context`, with no model involved
  (`lib/claimFigures.js`, tallied `figures=`). Measured free on recorded
  runs with `eval/goldset/figures.mjs`.
  **Trim a detail** (owner, 2026-10-13): when nothing backs the whole sentence,
  a second, separate call (`coverDetail`, `COVER_SYSTEM`) checks whether one
  source backs all of it but one small detail. The verdict judge and its
  prompt are untouched. The call splits the sentence into claim / detail /
  qualifier parts, with a quote for each part a source states.
  `lib/claimTrim.js` then decides, without a model, whether removing the
  missing part is safe: small, not a qualifier, scope, figure or attribution,
  and not used later in the paragraph. If so, the source carries
  `partial: { quote, missing, trimmed }` and stays `context`, never backing.
  The extension's search always asks for this (never with a `correction`).
  `/api/verify-sources` asks only with `partial: true` (receipt `trim`).
  It is tallied `partial=`, and costs up to 1,500 more output tokens, which
  is why `WORST_CALL["/api/sources"]` is 6,500.
  Measure it with `eval/goldset/run-verify-prod.mjs --partial`.
  **One fetch per page per search** (2026-10-22, Codex review S2,
  `citeMeta.js` `sharedPages`): completing a source's citation fields and
  reading it for its receipt share the page, and each cuts the body as it
  always did. A source with no DOI and no PubMed id starts fetching as soon
  as the model answers, beside Crossref. Each search's log line says
  `pages=fetched:N,reads:M`. Nothing is shared between searches.
- **The desktop gets the same receipts from its own route,
  `/api/verify-sources`** (2026-10-07; `lib/reasoning.js` `verifySources` →
  the same `lib/sourceVerify.js`, never a second verifier). The desktop sends
  a list the writer OPENED — at most 8 sources `{ id, title, url?, doi?,
  abstract?, venue?, year? }`, clamped — and gets one `{ id, verdict:
  backs|contradicts|topic|unread, quote?, readFrom?, retracted? }` each. An
  `abstract` the desktop sends (a scholarly index's own) is read only when
  OpenAlex has none (`gatherEvidence` `abstractOf`; the extension passes none).
  It is an APP route: `appGate`/`appCall`, the app pool and limiter, one `ai`
  action per list, never the source-search allowance (nothing is searched),
  the fast model at low (`plan.js` `verifySources`), no server cache (a page
  that missed the deadline must not be frozen as unread; the desktop caches).
  A judge that fails is a 502, never a list of "unread" — the desktop falls
  back to its unchecked list. Why user-triggered: it is a paid call, and the
  desktop's passive Screen Watch never makes one unasked. `context` is
  accepted and not sent to the judge (VERIFY_SYSTEM is measured on the claim
  alone). **The same list from the same caller, twice at once** (the editor
  and Screen Watch can both open it) is judged once (2026-10-22, Codex
  review S3, `lib/inFlight.js` via `appCall`'s `coalesce`). The first
  request is charged and spends the AI action. The one that joined spends
  neither, its log line says `joined=1`, and a failure reaches it without
  the billing tag. It never applies across callers or to an address-only
  caller. The hourly `[tracely] joined` line counts it, to show whether
  other routes are worth the same. Tests: `test/verify-sources.test.js`, `test/boundary.test.js`,
  `test/mirror-contracts.test.js`.
- **The extension's lookups** (2026-10-23, `verify: true` on `/api/sources`
  and its stream). Since 2.21.73 the extension looks a claim up before it
  flags it as needing evidence or a citation (extension/CLAUDE.md, "Look it
  up before flagging it"). The search is the same search, metered apart:
  - **Its own allowance:** `VERIFY_LIMITS` (`shared/plan.js`, 10/100 Free,
    30/300 Student, 50/500 Pro), usage kind `verify_search`
    (`lib/entitlement.js` `verifyQuota`/`recordVerify`). It never touches
    `SOURCE_LIMITS`, so the writer's own searches are untouched.
  - **Its own windows:** `SPEND.verifySearchesPerHour` (120, all free and
    beta callers together) and `callerVerifySearchesPerHour` (20). The
    extension pool's 15-an-hour web-search window would fill in minutes.
  - **The same pool and reservation** as any search, so a spent day stops
    lookups too. The try-out never sends it (`gate.demo` ignores it).
  - The search's log line says `verify=1`. A refusal's message is for the
    log only; the extension shows nothing for a lookup that failed.
  Tests: `test/sources-quota.test.js`.
- **`server/lib/reasoning.js`** is the desktop's reasoning, one export per
  route, on the relay's request/response contract — which is why the desktop's
  request builders and parsers did not change when it moved.
- **The server picks the model per route** (plan policy of 2026-09-21,
  `server/shared/plan.js` `modelForRoute`): `gpt-5.6-luna` on every route and
  every plan — the most accurate and the cheapest model the blind-judged eval
  measured (`eval/models/FINDINGS.md`; re-run it before changing a tier or an
  effort) — and `gpt-6-astra` only for Pro's "Explain in depth" (`/api/check`
  `deep: true`) and desktop critiques, out of a $1.50/month Thorough allowance
  reserved per call, falling back to luna, never refused. Two tiers, `fast`
  and `thorough`; `gpt-5.6-terra` (balanced) is retired. The client's model
  id is read only on those two routes and only picks thorough over fast; the
  client's effort is never read on a hosted server (check `medium`, sources
  `low`, everything else `low`; `ROUTE_EFFORT`). A local server keeps `pickModel`. The ids are
  copied by hand into `server/shared/plan.js` and `src/shared/plan.ts`
  (`MODEL_FOR_TIER`); `server/test/models.test.js` fails if they drift. The
  extension still ships its three-stop slider (terra on the middle stop)
  until 2.20.0; `models.test.js` and `mirror-contracts.test.js` pin its ids
  to ones the server maps. Retired ids (`gpt-5-nano`, `gpt-5.4`,
  `gpt-5.6-terra`) are still SENT by shipped extensions and desktops:
  `LEGACY_MODEL_TIER` reads them all as fast — keep that map until no such
  build is in use; a desktop settings row holding `'balanced'` reads as fast
  too. Paid plans have no daily check limit but a per-account fair-use limit
  (Student $0.75/day $2.50/month, Pro $1.50/$5, since 2026-10-22) that drops them to Free's limits;
  source searches are metered on every plan (5/40, 20/100, 40/250 a
  day/month). The reverse skew is NOT handled: a 2.19.3+ extension on a
  pre-2026-09-21 server runs `gpt-5-nano` at the Fast stop's `medium` (the
  eval's slowest config) and ignores the beta header, so deploy the server
  before any zip from the same change ships, beta included, and never roll it
  back to an older `app.bak-*` while 2.19.3+ is installed
  (`server/DEPLOY.md`, "The model tiers"; limits in `server/BILLING.md`).
- **Hand-copied logic is mirror-tested.** `server/shared/*` holds leaf ports of
  desktop modules (the splitters, `gradedDraft`, `normalizeCritique`,
  `narrowing`, the owner's `RUBRIC_TEXT`); `server/test/mirror.test.js` runs
  each side by side with its `src/` original. Change one side and the test
  names the other.
- **The provider is a seam.** `lib/llm.js` is a facade; everything
  OpenAI-specific is in `lib/providers/openai.js`, selected by
  `TRACELY_LLM_PROVIDER` (only `openai` is registered). Every error message on
  that path reaches the shipped extension verbatim — reword nothing there
  without an extension release in mind.

## Two products on one server: keep them apart

- **`/api/kind`** (2026-10-15, `lib/kind.js`, prompt `lib/prompts/kind.js`,
  SHA-pinned): the model names the kind of writing, one of the extension's 56
  (`WRITING_KINDS`; `test/kind.test.js` keeps the two lists equal) or
  "unsure". It reads the first 3,600 and last 400 characters, uses the fast
  model at low effort, and costs about 0.1¢ a call. It has its own daily
  count (`DAILY_KIND`) and a 2 s floor. An answer for text the server
  already has (an in-memory cache keyed by text) is free and not counted.
  The extension asks only when `FEATURES.modelKind` is on, and it is off
  until `eval/kinds/run.mjs` has measured it against production.
- **The wrong-source check** (2026-10-15, `lib/citeFit.js`, prompt
  `lib/prompts/citeFit.js`, SHA-pinned). `/api/check` runs it only when the
  request says `citeFit: true`, and never on Explain in depth or the try-out.
  It asks whether the source each cited sentence names could be where its
  claim comes from (Venus cited to the OECD, PISA to NASA).
  - It runs as one more call, admitted like a shard, on the fast model at
    low effort. It sees at most 12 cited sentences, and only ones the check
    called accurate.
  - A "wrong" turns that finding into `wrong_source`, which only a build
    that asked for it ever receives. "fits" and "unsure" change nothing,
    and a failure leaves the check's answer.
  - The extension sends it only while `FEATURES.citeFit` is on. That is off
    until `eval/citefit/run.mjs` has measured it against production.
- **The extension's routes are FROZEN while a Web Store build is in review**:
  `/api/status /api/check /api/flow /api/sources /api/cite-url /api/docs/apply
  /api/entitlement`. Their response fields, error `kind`/`message` text, the
  401-then-anonymous behaviour, `corsHeaders()` (it must keep `Authorization`
  and `X-Tracely-Install`), port 4477, `api.jointracely.com`, the Supabase
  project, the three model ids, the plan names `free|student|pro` and the
  Stripe `PORTAL_URL` are all baked into the shipped extension. Changing any of
  them needs an extension release, not a server deploy.
- **The desktop's routes have their own guard rails and must never share the
  extension's**: `APP_AI_ROUTES` go through `appGate`/`appCall` — their own
  spend pool (`TRACELY_APP_DAILY_BUDGET_USD`), their own per-caller limiter,
  their own daily quota kind (`ai`: free 150/day, paid no daily limit but
  bounded by fair use), their own web-search window (source searches share
  one per-plan day/month count with the extension's). Shared, one busy desktop user on the thorough model could
  empty the extension's day and 503 every `/api/check`.
  `server/test/boundary.test.js` drives desktop traffic at a real mock server
  and asserts the extension's routes do not move.
- **A caller's model is never read from the global prefs row on a hosted
  server.** `PUT /api/prefs` is unauthenticated and that row is shared by every
  caller; it drives the model only on a local, single-user server (and a
  hosted server refuses the PUT outright).
- **The extension's model routes spend three pools** (`spendGate`): free
  callers the shared `extension` pool, Student/Pro the `paid` pool, test-build
  callers (`X-Tracely-Beta`) the `beta` pool. The paid and beta pools serve
  the thorough model, so they reserve each admitted call's worst case
  (`WORST_CALL`, `lib/spend.js` `reserveSpend`; a check's truncation split
  is admitted the same way, `reservation.extend`) and fall back — to the fast
  model, or to the caller's own plan — instead of ever 503ing. A pool that
  can reach expensive models must never share a day with free users.
- **Every pool reserves before it admits** (2026-10-17 spend audit). The
  `extension` and `app` pools used to read spend on disk only, so a burst
  with rotating install ids all ran before the first charge landed. Now
  `spendGate` and `appGate` hold the route's fast-model worst case
  (`WORST_CALL`, which lists the desktop routes too) and refuse with the
  `budget` 503 when what is in flight fills the day. A gate that holds a
  reservation gives the body `GATED_BODY_DEADLINE_MS` to arrive. The same
  audit made these rules, each with a test (`test/spend-hardening.test.js`,
  `test/beta-grant.test.js` I–K):
  - A call that **times out** is charged its worst case (`lib/llm.js` post →
    `timedOutUsage`): the vendor runs and bills a dropped request to its end.
  - Every failure **after the vendor answered** carries its cost
    (`tagFailure`, `lib/errors.js` `billedFailure`), all failed shards included.
  - **Web searches are capped per answer** (`max_tool_calls`: 3 on
    `/api/sources`, 4 on `/api/find-sources`), and find-sources has a
    global hourly window (`SPEND.appWebSearchesPerHour`).
  - **Effort is switched off for a model only after the same call succeeds
    without it** (`isEffortError` reads the vendor's `param`).
  - **A deployed server never runs unmetered**: with `release.json` present
    (or `TRACELY_HOSTED=1`) and Supabase unset, spending routes answer 503
    and `PUT /api/prefs` 403 (`refuseUnmetered`).
  - **A deployed server refuses the local web app's storage** (2026-10-22,
    `LOCAL_ONLY_ROUTE`). That covers `/api/documents`, `/api/library` and
    `/api/analyses` (and the ids under them), `/api/clear-history`,
    `/api/stats`, `/api/evidence/for-claim` and Screen Watch's state and
    switch. They ask no one who is calling, which is fine on a laptop. The
    live server answered `GET /api/documents` with 200 (it held nothing). No
    shipped client calls them. Test: `test/hosting.test.js`.
  - **Stripe:** a plan event older than the newest one applied for that
    customer is `stale` (`billing_event_order`), and only a confirmed,
    non-anonymous email claims an unclaimed purchase.
- **What the calls cost, by route, once an hour** (`lib/usageTally.js`,
  2026-10-17): `[tracely] usage route=… calls in cached (n%) write (n%) out
  searches cost`. The `cached` and `write` shares are the prompt cache's
  reads (a tenth of input) and writes (1.25×), which nothing recorded before,
  so measure any caching change against these lines. Counts and dollars only.
  Two more lines print with them (2026-10-22):
  - **`[tracely] cache kind=… hits=N of M`**: how often the server's own
    result cache (appCall's `cache`, the desktop's routes) answered with no
    model call at all.
  - **`[tracely] repeats scope=… searches seen other`**: the extension's
    source searches whose sentence was already searched in the last two
    weeks, and how many of those were by ANOTHER caller (`lib/seenClaims.js`:
    a keyed hash in memory, never the sentence, never on disk). `other` is
    what a cache shared between people would save. `demo-sources` (the
    try-out's one sample essay) and `sources-correction` are kept apart. A
    deploy forgets what was seen, so read it as a lower bound.
  - **`[tracely] stages route=… pool=…`** (Codex review S1,
    `lib/stageTally.js`): where a source search's time went, each stage's
    p50/p95/max in ms. The stages are `wait` (the body, the account, the
    gates), `search` (the model's web search), `complete` (the citation
    fields), `read`, `judge`, `trim` and `total`. `backed` counts searches
    that ended with a backing source, so cost per backed answer is the usage
    line's cost over it. **`[tracely] reads`** counts why sources went unread
    (`READ_OUTCOMES` in `sourceVerify.js`: pdf, blocked, http, deadline, dns
    and the rest). Each search's own line carries `stages=` and `reads=` too.
    `/api/verify-sources` reports the verifier's three stages. Numbers and
    fixed labels only, never a URL. On SIGTERM these lines print after the
    drain, so the searches that finish during it are counted.
  - **The cost counters** (2026-10-24). They decide whether to build
    "judge known sources first" and cross-document reuse, and change nothing
    a caller gets:
    - **`[tracely] searches route=/api/sources pool=… mode=lookup|search|correction`**
      (`lib/searchTally.js`): searches, failed, every cent charged (billed
      failures included), how many ended backed, refuted, unverified or
      unread (`searchOutcome`, the extension's `lookupOutcome`), and
      `perBacked`, the cost over backed in the same pool and mode.
    - **`[tracely] lookup-tags pool=…`**: per label the extension sends with
      a lookup (`lookupTags`, never text), `n/backed/refuted/unverified`.
      The labels are `rank` (lookupRank 0-3), `pick` (1-5), `doc`
      (none/some/related: whether the Doc already had sources) and
      `elsewhere` (looked/checked/no: another Doc on that computer).
      Anything else is kept as `?`.
    - **`[tracely] candidates scope=…`** (`lib/seenClaims.js` `noteBucket`):
      how often a claim's bucket (`claimFeatures`) was searched before, by
      another caller, and by another caller whose search ended backed. That
      is an upper bound on what a shared candidate cache could serve.
    - **`[tracely] dupes route=/api/check|/api/sources`**
      (`lib/dupeTally.js`): the same request from the same identified caller
      while one runs, and what those cost.
    Each lookup's own log line carries `tags=`. Tests:
    `test/search-tally.test.js`, `test/seenClaims.test.js`.
  - **A cheaper search first, OpenAI's as its fallback** (2026-10-24,
    `lib/searchApi.js`, `factcheck.js` `cheapFirst`). Owner: "implement the
    system with openai's search as a fallback". On the cost page a lookup
    cost 1.7 to 2.7 cents, mostly OpenAI's $10-per-1,000 web_search fee and the
    result pages it reads back.
    - **How it works:** `TRACELY_SEARCH_PROVIDER` picks a mode.
      - **`openalex`:** OpenAlex's papers alone: free, about 100 searches a
        day with no key, 1,000 with `OPENALEX_API_KEY`.
      - **`brave`:** with `BRAVE_SEARCH_API_KEY`, Brave's web results ($5 per
        1,000) and OpenAlex's papers, asked at once (`find`).
      - **What is searched:** the sentence, with its citation taken out
        (`searchQueryFor`).
      - **Which papers:** only ones `lexicalRelevance` puts above the local
        evidence search's floor, the best three, each by its DOI so the
        reader finds the abstract (`openAlexCandidates`).
      - **What is judged:** up to eight readable results (`candidateResults`
        drops PDFs, videos, social posts and shops), through the same
        complete-and-judge step any search's sources get (`judgeSources`),
        without the detail check.
      - **Strong sources first** (owner, 2026-10-24, after a blog backed a
        sentence beside the Washington Post; `strongFirst`). Peer-reviewed,
        official, reference and news-of-record candidates go first, from
        anywhere in Brave's ten (`shared/sourceCredibility.js`, a port of
        the desktop's, held to it and the extension's by
        `test/source-credibility.test.js`). With three or more strong ones,
        the unvetted are left unjudged; with fewer, they fill the pass. The
        log line's `picked=3:3s2w` counts them: judged, then strong (s) and
        unvetted (w) candidates. Nothing shown is
        dropped: the extension still labels and ranks.
      - **Billing:** Brave is charged only when it answered. OpenAlex comes
        out of its free daily budget, and `find` throws only when no service
        answered.
      - **Left out on purpose:** Semantic Scholar (non-commercial data
        licenses) and Google Scholar scrapers (Google's terms; blocked on
        cloud servers).
    - **One backs it:** that is the answer. No OpenAI search runs, no
      web_search fee is charged, and the provider's fee is
      (`extraMicroCents`).
    - **Nothing backs it:** OpenAI's search runs exactly as before
      (`openaiSources`). A Brave page that says otherwise is kept beside its
      answer. So no search ends with fewer backing sources than OpenAI's
      alone gives.
    - **Never asked:** a correction search, a caller with the reading off,
      or the mock.
    - **Billing:** a provider that failed charges nothing. When the fallback
      fails, the cheap pass's tokens and fee ride on its error.
    - **The reservation:** the worst case grows by one verifier pass and one
      fee only while a provider is set (`CHEAP_PASS`).
    - **What reaches Brave:** only the query; Brave's snippets are not kept,
      because its terms allow only transient storage. PRIVACY.md names Brave.
    - **Watching it:** each search's log line says `via=cheap|fallback|openai`,
      `api=brave+openalex:2` (how many services answered) and, for a cheap
      answer, `from=brave|openalex`. The cost ledger's `via` column (migration v6)
      gives the cost page its "Cheaper search answered" column.
    - **Why Brave:** the comparison of 2026-10-24 is in `searchApi.js`.
      Google-scraping resellers are left out on purpose.
    Tests: `test/cheap-search.test.js`.
  - **What each action cost, kept** (2026-10-24, `lib/costLedger.js`). The
    lines above are counted in memory and lost on a deploy. Owner: "can we
    create a system so I can see how much api credits weve used on each look
    up or action that tracely uses?"
    - **One row per action that was charged:** a check, a lookup, a source
      search, a desktop call. It holds every model call the action made (a
      check's citeFit call included), its web searches, tokens, time, and
      whether it failed. A billed failure counts.
    - **How it is written:** `chargeCall` notes each charge on the gate
      (`noteActionCost`), and the request's `finally` writes the row
      (`recordAction`). A joiner, or a request refused before its call,
      writes nothing. A source search is split by mode: `sources:lookup`,
      `sources:search`, `sources:correction`.
    - **What it holds:** no caller and no text. It is kept 90 days
      (`KEEP_DAYS`). The cost is the server's estimate, the spend cap's own
      arithmetic; OpenAI's usage page is the bill.
    - **Who reads it:** `GET /api/admin/costs?days=&recent=` with
      `Authorization: Bearer <TRACELY_ADMIN_TOKEN>`, and the page at
      `/admin/costs`. The page holds nothing: it keeps the token in the tab
      (sessionStorage). Without the variable, or with one under 24 characters,
      the route is a 404. A wrong token is a 401. Another site's page is
      refused by the origin guard before the route runs.
    Tests: `test/cost-ledger.test.js`.
  - **`TRACELY_PROMPT_CACHE_KEY=caller`** (off by default) sends a hashed
    per-caller `prompt_cache_key` on `/api/check`. It changes where a call
    runs, never what it answers. It is off because a cache write costs more
    than plain input, so for one-off callers it could cost more. Keep it only
    if the usage lines show it pays. A vendor that refuses the field is
    answered without it (`postOptional`).
  - **`TRACELY_PROMPT_CACHE_RETENTION=24h`** (off by default, 2026-10-28)
    sends OpenAI's `prompt_cache_retention: "24h"` on every structured call
    (`lib/llm.js` `cacheRetention`). A check's instructions are about 1,640
    tokens, the same every time, and the in-memory cache forgets them within
    minutes at Tracely's traffic; kept a day, they are read at a tenth of the
    price. It changes how long a prompt is kept, never what is asked or
    answered. A model that refuses the field is answered without it, and the
    field is then off for that model (`withOptional`, around the key's
    `postOptional`). Judge it on the cost page: the check row's cached share.
- **The public try-out page (`/try`) is a third product with its own fence**
  (`lib/demo.js`, `demoGate`; DEPLOY.md "The try-out page"): `DEMO_ROUTES`
  (`/api/demo/check|sources|review|status`) sit in NO other set — not
  `EXTENSION_API`, `PAID_ROUTES` or `APP_AI_ROUTES` — and alias into the
  `/api/check`, `/api/sources` and `/api/review` handlers (`api`, the aliased
  path, is what those handlers match on; never copy a handler for the demo).
  Its pool `demo` reserves per call — in `demoAdmit`, after the body is read,
  never in the gate — and REFUSES when spent (503 `demo_closed`; full of
  calls in flight, 503 `demo_busy`) — never fall back to another pool.
  `TRACELY_PUBLIC_ORIGIN`
  reaches the demo routes and static files only (decided before the self-origin
  pass); never add it to `SELF_ORIGINS`. The website's own pages
  (`demoSiteOrigins`: jointracely.com, www, new., plus `TRACELY_SITE_ORIGINS`)
  are held to the same fence, plus `SITE_API` (reading the signed-in
  account's `/api/entitlement` with its own token, for the website's
  Settings, 2026-10-28) and `SITE_SIGNED_IN` (`/api/check` and
  `/api/sources` with a verified account only, else 401: the website's
  tools on the visitor's own plan), and get their own credentialed CORS answer
  (`siteCorsHeaders`), never the extension's; their first `/api/demo/status`
  mints the visitor cookie (2026-10-27). The caller is always the free plan,
  enforced; never call `withBetaGrant` for it. `test/demo.test.js` pins all of
  this. `/ext-content.js` (the engine `/try` runs) must be copied on every
  deploy.

## Accounts and billing

- One Supabase project, `sxifbtelrtbsgnnwnmdf`, for every surface. Stripe
  checkout → webhook → `app_metadata.plan` on the user (`server/BILLING.md`).
  `user_metadata` is user-writable and is never read for a plan.
- **Anonymous sign-ins are ON** on that project (checked 2026-09-22:
  `/auth/v1/settings` reports `external.anonymous_users: true`; #251's
  description predates this). A desktop built against `sxifbtelrtbsgnnwnmdf`
  signs in anonymously at boot and is metered as `user:<id>` on the free plan.
  Every call also carries `X-Tracely-Install` (a stable per-install UUID in
  `config.json`), which the server meters when there is no session — sign-in
  failed, or the build names another project.
- **The old production project `epafyygdvvkgpdkbevqi` is deleted** (its host
  no longer resolves). A build compiled against it — every stable release up
  to v0.3.97 — can never get a session.

## Where things are

- `server.js` — every route, inline. `EXTENSION_API` (~line 150) is the
  shipped contract: append, never remove. `PAID_ROUTES`, `APP_AI_ROUTES`,
  `MODEL_ROUTES` beside it say what spends, what is the desktop's, what is
  logged as a model failure.
- `lib/llm.js` → `lib/providers/openai.js` — the one model seam; prompts in
  `lib/prompts/` (SHA-pinned by `test/prompts.test.js`), the extension's check
  and source search in `lib/factcheck.js`, the desktop's reasoning in
  `lib/reasoning.js` (the relay's contract, byte-frozen prompts).
- `shared/` — leaf ports of desktop modules, mirror-tested
  (`test/mirror.test.js`, `test/mirror-contracts.test.js`); `shared/plan.js`
  is the plan policy, model tiers, allowances and effort per route;
  `shared/prices.js` the price table the spend cap does arithmetic with.
- `lib/spend.js`, `lib/entitlement.js`, `lib/billing.js`, `lib/db.js` — the
  cap, who is calling, Stripe, SQLite. `lib/demo.js` — the try-out's cookie,
  allowance, caps and status.
- `public/try.html|js|css` — the try-out page (`/try`, `/try.js`, `/try.css`);
  `server.js` owns only the headers `/try` is served with (`TRY_PAGES`).
- `scripts/` — `pack-extension.sh`, `bump-extension.mjs`, `healthcheck.sh`,
  and two Linode-only scripts (`set-server-env.sh`, `deploy-openai-key.sh`).
- `public/app/` — the vanilla web app, served by `server.js`; local only.
- `eval/models/FINDINGS.md` (root) — every measured decision about models,
  efforts, prompts and costs. Re-measure before changing one; append a dated
  section after.

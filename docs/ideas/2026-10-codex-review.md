# Tracely: October 2026 Codex review

Review date: 21 October 2026, America/Los_Angeles. Source snapshot: `46df2d995219a8773e2d0f3d379d5f4f65ddff96` in `JoinTracely/Tracely`. The downloaded GitHub ZIP's archive comment identifies that commit. All line references below refer to this snapshot.

This is an ideas-only review. No application code, prompts, settings, versions, or deployment state were changed. Proposed implementation files below are future work, not changes made by this review.

## What matters most

The immediate opportunity is to turn a source search into a usable, correctly formatted citation more often. There are reproducible losses before the judge sees the evidence: the extension can omit a later claim's paragraph; an insufficient abstract can prevent a readable original page from being tried; and Chinese receipts without spaces fail the quote gate. Fix those before buying another model or making the judge stricter.

Retrieval and verification need separate measurements. A real quote proves that those words exist, not that they establish the entire proposition. Conversely, failing to retrieve or read a source does not prove that the student's claim is wrong. Preserve those distinctions in scores, cards, fallbacks, and paid features.

### Evidence levels and limits

- **Verified implementation:** inspected at the pinned commit; references identify the relevant code.
- **Reproduced offline:** executed the real exported functions with synthetic inputs and injected responses. No network or model calls in these probes, cost **$0**.
- **Recorded measurement:** a committed earlier experiment, not a measurement of today's production. The source judges in `eval/goldset/README.md` are explicitly **AI-consensus, not human validation**.
- **Unverified:** projected impact, production frequency, conversion, current live deployment, and any behavior not exercised here. Effect estimates in the ideas are hypotheses unless explicitly described as reproduced.

No production cost logs, account records, private drafts, keys, or `.env` files were inspected. No paid eval ran. No live Google Doc was edited. No live search-latency improvement is claimed.

### Where the supplied map differs from the code or overstates the evidence

| Supplied map | What this snapshot establishes |
|---|---|
| Source search sends no effort | Hosted `sources` uses **low**: `server/shared/plan.js:221`; `server/server.js:1624` consumes that choice. Several comments still describe the old behavior. |
| Check context is at most 2,000 characters | `checkContext`, `server/lib/factcheck.js:122`, preserves the **whole input through 6,000 characters**, then switches to a 2,000-character head. |
| The source finder receives context around the claim | Docs and fields send a **6,000-character head**, e.g. `extension/content.js:8988`, `:13341`. The server's local-window function cannot recover a paragraph the client never sent. |
| Dead links are dropped | Metadata reading skips sources already carrying DOI or year+author (`factcheck.js:585`); known 404/410 results are retained when **all** results are dead (`:610`). Receipts still prevent these unread results from becoming backing. |
| Luna is the cheapest of all 13 configurations | The historical table in `eval/models/FINDINGS.md` contains cheaper configurations with worse accuracy. Luna medium was the strongest measured check choice at its cost, not the absolute cheapest configuration. |
| 110/110 describes accuracy | It describes 55 sentences with two repetitions in an earlier experiment. The dated 1 October section records **98%** on that checkset and **96%** on the hard set, including remaining harmful errors. It is not a population-wide accuracy estimate. |
| 31% extension / 10% desktop describe the current source experience | These are older baselines with different denominators. The 9 October extension run after receipts showed 22 backing offers, 12 judged backing, and 7/36 claims with a correct offer. The later fixed-input verifier experiment is a separate test. See `eval/goldset/README.md`, dated sections. |
| Free indexes first, paid web second is only in flight | The **desktop already does this**, but only for `general` claims and using relevance+credibility rather than a verified receipt (`aggregator.ts:419`). The extension still starts with paid search. |
| "Needs evidence" is searched automatically | `EVIDENCE_FIRST` selects **questionable** only (`content.js:3406`), not every `needs_citation` or local citation note. Also, the allowance calculation already takes the minimum of daily and monthly remaining searches (`:460`); do not propose that as a missing feature. |
| Every important prompt is SHA-pinned | `server/test/prompts.test.js` pins imported reasoning/kind/citeFit prompts. The verifier's `VERIFY_SYSTEM` has semantic assertions in `source-verify.test.js:331`, not the same byte-hash protection; `FINDINGS.md` explicitly notes it was not SHA-pinned. |

### Offline results from this review

| Probe | Actual result | Implication |
|---|---|---|
| Claim at offset 8,001; pass the client's first 6,000 characters into `claimWindow` | Claim missing; passing the full synthetic document includes it | Proven client/server context mismatch, not a judge failure. |
| DOI resolves to an insufficient abstract, no OA landing page, original URL has usable full text | Only OpenAlex requested; only abstract passages selected | The original page is skipped in this branch. |
| All model-returned sources answer 404 | `returnedSources=1`, `dropped=0`, `verified=false` | A dead link survives the list, but is not backing. |
| `figuresShown('The object moved 10 meters.', 'The object moved 10 feet.')` | `ok=true` | The numeric guard does not bind quantities to units. |
| 10 percentage points versus 10 percent | `ok=true` | Different measures share the same numeric kind. |
| `matchQuote` on an exact 18-character Chinese quote without spaces | `null` | The three-space-separated-words requirement rejects a valid exact quote. |

Existing tests: `node --test server/test/source-verify.test.js server/test/sourceEnrich.test.js server/test/claim-figures.test.js` passed **44/44**. A broader run including `sourceCitations.test.js` passed **48/49**; its HTTP mock-server test failed with `server did not start`. A direct mock-server startup subsequently succeeded, so the HTTP test failure remains **unresolved**, not established as a production defect or dismissed as an environment issue. No full-suite green claim is made.

## Ranked top 10: value per effort

Rank reflects user value, strength of evidence, implementation size, and operating cost. It is a review judgment, not a measured ROI. S = a narrow change in one subsystem; M = several coordinated modules or an eval; L = new infrastructure or a substantial product capability.

| Rank | Idea | Why first | Size | Accuracy / speed / API cost hypothesis |
|---|---|---|---|---|
| 1 | C1. Remove every known dead link | Reproduced edge case, very small fix | S | Cleaner results; neutral speed; no added model cost |
| 2 | C2. Send the claim's actual neighborhood | Reproduced input loss affects later paragraphs | S–M | Better retrieval and reference resolution; similar token budget |
| 3 | C3. Try the original page after an insufficient abstract | Reproduced missed reading path | S–M | More useful receipts; bounded extra fetches |
| 4 | C4. Bring desktop citation formatting up to the extension's standard | Concrete formatter divergence | M | More submission-ready references; local and free |
| 5 | C5. Bind figures to measures and units | Two reproduced holes in the numeric safety net | M | Fewer invalid receipts survive a mistaken judge; free |
| 6 | S1. Measure each stage and reason for loss | Existing total-time logs cannot locate the bottleneck | S | Enables sound decisions; negligible operating overhead |
| 7 | S2. Read each page once per search | Sequential metadata and evidence passes can refetch | M | Lower fetch work and possible latency reduction; no extra model call |
| 8 | A1. Make quote and identity handling script-aware | Exact Chinese quote demonstrably rejected | M | Fixes a deterministic multilingual failure |
| 9 | S3. Coalesce identical concurrent work per caller | Completed-result caches do not merge concurrent misses | M | Less duplicate work; savings depend on overlap |
| 10 | C8. Offer a receipt-driven desktop fallback | Topical scholarly hits can suppress a useful web search | M | Higher claim-level evidence yield, with explicit paid-search budget |

C6/C7 should follow soon after instrumentation: passage selection and retrieval query quality are likely larger long-term levers, but their gains require evaluation. R1 is a separate reliability prerequisite before depending on frequent Railway restarts.

## Full list by area

### Citation quality and usable evidence

#### C1. Remove every known dead link

**Problem and evidence.** `server/lib/factcheck.js:610` removes dead sources only when `dead.size < list.length`. The all-404 offline probe returned its dead result and `dropped=0`. The existing mixed-result test at `server/test/sourceEnrich.test.js:190` covers one dead result beside two survivors, so it misses this branch.

**Proposal.** Remove every positively identified 404/410, including a list with zero survivors. Return a successful empty result after a completed search with no usable links, allowing existing empty-state UI to explain it. Do not turn a timeout, 403, or unavailable page into a 404. Keep the current receipt restriction.

**Expected effect.** High confidence in eliminating this edge case; production incidence and conversion effect are *unverified*. Accuracy: no dead results offered to inspect. Speed: neutral/slightly better because downstream work shrinks. Cost: no new model call.

**Measure and cost.** Add all-dead, mixed, and all-unread mocked cases beside the current test; **$0**. Check the HTTP response and the extension's empty-state rendering, not only array mutation.

**Risks/trade-offs.** An empty list must not trigger an automatic paid retry. Preserve existing response fields and error text; do not convert a real completed search into a provider error. Privacy unchanged.

**Size/files.** S. `server/lib/factcheck.js`, `server/test/sourceEnrich.test.js`, empty-state fixture in `server/test/ext-find-source.test.js`.

#### C2. Send the claim's actual neighborhood, within the existing limit

**Problem and evidence.** `extension/content.js:8988`, `:9885`, `:13305`, and `:13341` send the document head. `claimWindow` at `server/lib/factcheck.js:530` works only on the received string. The offset-8,001 probe reproduced the missing claim. The check path has a related limit: after 6,000 characters `checkContext` uses only the first 2,000 (`:122`). A later "she" or "this experiment" may lose its referent.

**Proposal.** First fix source searches: derive a bounded window from the exact sentence occurrence in the client, retaining neighboring sentences and paragraph boundaries, before sending `context`. Use segment offsets where available so repeated sentences choose the right occurrence. Update all search paths, including replacement evidence and fields. Separately test a check-shard context composed of a short title/thesis plus local context for that shard, under a fixed total token budget.

**Expected effect.** High confidence that the transmitted context becomes relevant; the retrieval gain is *unverified*. Speed/cost should remain near neutral if the character budget is held constant; local check contexts may reduce prefix-cache reuse and need measurement.

**Measure and cost.** Client-to-server tests for late, repeated, edited, and short sentences: **$0**. Compare 36 matched searches using `eval/goldset/run-extension-prod.mjs`, plus a late-paragraph variant: approximately **$0.50–$1 per 36 calls**, estimated from recorded search costs; reserve a **$2 cap** for one before/after pair and approve before running. Re-measure any check prompt/context change with the model harness.

**Risks/trade-offs.** Do not enlarge what leaves the device. `PRIVACY.md` should describe actual surrounding text rather than a head; no additional retention. The HTTP schema need not change. Do not silently change existing cached verdicts.

**Size/files.** S–M for search; M for checks. `extension/content.js` search builders, `server/lib/factcheck.js`, context tests, `PRIVACY.md`, `eval/models/FINDINGS.md` if model input changes.

#### C3. Try alternative readable locations after an insufficient abstract

**Problem and evidence.** `openAccessPage` (`sourceVerify.js:374`) chooses one URL. `gatherEvidence` (`:439–445`) excludes `s.url` whenever any abstract exists. The offline probe supplied an insufficient abstract and a readable original URL; only OpenAlex was requested. If the one OA location is blocked or is merely another abstract, other locations are not tried.

**Proposal.** Build a de-duplicated candidate list of OA HTML locations plus the original page. After an abstract fails `abstractSettles`, try those within the existing shared deadline, stopping when usable, sufficiently informative text is read. Prefer stable full-text repositories to abstract-only landing pages using observable location metadata. Keep all URL safety checks. Avoid launching every location unboundedly.

**Expected effect.** High confidence in removing the skipped-page branch; amount of recovered backing evidence is *unverified*. Speed: mixed—some extra fetches, but less wasted searching later. API cost: same judge count, possibly slightly more input; publisher/network load rises in this branch.

**Measure and cost.** Mock missing OA, first OA blocked, alternative OA readable, original-page-only, and deadline cases: **$0**. Replay the 310 fixed source pairs with `run-verify-prod.mjs`; the committed two-set run was about **$0.10**, not a guarantee. Use a **$0.50 cap per candidate run** and compare readable, correct-backs, incorrect-backs, and latency.

**Risks/trade-offs.** Respect paywalls; no login or proxy workaround. Do not label every fetched page "full text." Existing quote contracts and no-PDF behavior remain until C11 is separately decided. No additional student text sent to publishers.

**Size/files.** S–M. `server/lib/sourceVerify.js`, `server/test/source-verify.test.js`, goldset reading diagnostics.

#### C4. Unify citation correctness across desktop and extension

**Problem and evidence.** Desktop `src/main/services/citations/authorUtils.ts:22,50` truncates APA reference authors above three; the extension's APA formatter at `extension/content.js:1320` handles up to 20 before its long-list rule. Desktop formatters are much simpler and do not consume volume/issue/pages. Extension formatting can consume those fields, but the non-DOI metadata completion allowlist at `factcheck.js:596` drops them even though `citeMeta.js:509–514` extracts them. Crossref enrichment does carry them (`sourceEnrich.js:211`).

**Proposal.** Create a common citation fixture corpus and bring desktop output to the same declared style editions and supported source types. Preserve structured author names, journal locators, group authors, chapters, and publication dates end to end. Add volume/issue/pages to validated non-DOI completion. Prefer shared pure formatting logic if it can ship without restructuring content scripts; otherwise mirror-test output as the repository already does. Distinguish Chicago author-date from notes/bibliography in product wording.

**Expected effect.** High confidence in eliminating proven parity and field-loss problems; compliance across every source type remains *unverified* until fixtures are checked. Speed: local, negligible. Cost: no model call.

**Measure and cost.** At least 30 manually checked fixtures spanning 1/2/3/4/20/21 authors, organization authors, compound names, articles with locators, chapters, books, undated pages, and Chicago mode. **$0 API cost**; human style-reference review required. Use existing extension citation tests plus desktop formatter tests. Consult the actual style authorities during implementation rather than treating current extension output as the authority.

**Risks/trade-offs.** Plain text cannot convey all italics and layout rules; define rich versus copied-text guarantees. Never invent missing page numbers. Additive fields only; preserve old clients and type contracts. No new data disclosure.

**Size/files.** M. Desktop citation formatters/author utilities, `src/shared/types.ts`, source normalization/storage as needed, `server/lib/citeFields.js`, `factcheck.js`, extension citation tests and mirror tests.

#### C5. Bind a figure to its measure, unit, and population

**Problem and evidence.** `claimFigures.js:114–115` maps percent and percentage points to one kind; `:138` compares values and broad kinds, and `:155` independently reuses matching quote figures. The offline probes accepted 10 meters/10 feet and 10 percentage points/10 percent. This is a weakness in a secondary guard, **not proof the full judge would accept either pair**.

**Proposal.** Extend deterministic figure extraction with nearby units and distinguish percentages from percentage-point changes. Treat repeated quantities as assignable matches rather than letting one number satisfy unrelated quantities. Use explicit, safe unit conversion only. Give the judge contrastive examples for different denominators, populations, and years only after isolating remaining failures; do not reintroduce #327's parts verdict design.

**Expected effect.** High confidence in blocking these synthetic numeric mismatches; real precision gain and recall loss are *unverified*. Speed: negligible. Cost: zero for rules; a later prompt change needs remeasurement.

**Measure and cost.** Extend `server/test/claim-figures.test.js`; apply the candidate to committed quotes, reporting both good sources lost and wrong sources removed. **$0** offline. Follow with the fixed-pair verifier run, estimated **$0.10–$0.50** with cap/approval.

**Risks/trade-offs.** Unit-less quotes can legitimately rely on nearby context; do not reject them blindly or equate missing detail with contradiction. Prefer abstention/context on ambiguity. Keep response vocabulary unchanged. Privacy unchanged.

**Size/files.** M. `server/lib/claimFigures.js`, its tests, `eval/goldset/figures.mjs`; verifier prompt and dated findings only if separately evaluated.

#### C6. Preserve article structure when selecting excerpts

**Problem and evidence.** `pageText` inserts generic punctuation at block ends and flattens table cells (`sourceVerify.js:72` onward). `selectExcerpts` ranks lexical windows (`:182`); a number in a table can be separated from its heading, denominator, or year. The goldset documents both good read sources rejected and sources backing only the setup clause. The frequency attributable specifically to excerpt selection is *unverified*.

**Proposal.** Retain paragraph and table-row boundaries internally. Keep caption/header context with numerical cells. Rank a small candidate set using lexical and figure coverage, preserving negation and adjacent qualifier sentences; optionally compare a local semantic reranker offline. Pass the judge coherent passages under the same budget. Keep source offsets so receipts point to actual contiguous text, not a fabricated joining of cells.

**Expected effect.** Medium confidence in useful evidence recovery and fewer misleading excerpts; magnitude *unverified*. Speed: modest parsing work. Cost: neutral if input budget is fixed; do not simply enlarge every excerpt.

**Measure and cost.** A 30-page offline corpus containing tables, unrelated boilerplate figures, abstracts, quoted claims, and footnotes; annotate whether the decisive passage survived selection. **$0**. Rejudge fixed pairs only after extraction recall improves; estimated **$0.10–$0.50** per controlled run.

**Risks/trade-offs.** Flattened HTML is not always equivalent to visible article content. Preserve strict quote matching. No open-ended browser renderer, no extra text retained by default. A new extraction policy must version receipt caches.

**Size/files.** M. `sourceVerify.js`, source-reading fixtures, goldset capture/replay, receipt cache versions.

#### C7. Decompose retrieval queries, while keeping one whole-claim judge

**Problem and evidence.** Desktop `queryVariants` fans additional variants to Crossref (`aggregator.ts:350`), but web source finding still starts from a whole sentence (`factcheck.js:430`). Specific attribution, a statistic, and causal interpretation can pull retrieval toward different topics. Recorded goldset errors show that topical relevance alone is inadequate.

**Proposal.** Form one query identifying the report/study/entity and one identifying the rare statistic or relationship. For attributed claims, prioritize the named source and date; for causality, preserve intervention/outcome terms. Use deterministic query candidates first, and test a model-produced query only if needed. Merge candidates, then judge the **original sentence using the existing verdict structure**. Query decomposition must never convert partial support into support for the whole sentence.

**Expected effect.** Medium confidence in higher candidate recall; effect *unverified*. Speed/cost may improve if a better first query avoids a retry, or worsen if it adds searches. Keep tool caps and model unchanged.

**Measure and cost.** Compare against the same 36 claims plus a fresh holdout. Report verified backing per claim and cost per successful claim, not sources returned. A 36-call extension arm is estimated **$0.50–$1**; a before/after pair should have a **$2 cap**. One-search and two-query variants must be costed separately.

**Risks/trade-offs.** No speculative search before an authorized search action. No #327 parts judge. Any changed prompt is an evaluated release; add the current unpinned source-search prompt to explicit change control as in R4. Privacy must describe any newly transmitted query terms; do not send more context than C2.

**Size/files.** M. `factcheck.js` source builder/prompt, `src/main/services/search/queryVariants.ts`, query fixtures, model findings.

#### C8. Trigger desktop web fallback from evidence failure, on a click

**Problem and evidence.** `hasCitableSource` uses relevance and credibility (`aggregator.ts:286`); web fallback runs only for `general` (`:419`). A high-relevance paper that never states the claim can prevent fallback. `src/CLAUDE.md` confirms receipts do not yet feed the score or retrieval decision. The 10% baseline is old, but establishes why a topical match is an insufficient success criterion.

**Proposal.** When an opened list completes with zero verified backing sources, offer a single explicit "Search beyond these results" action. Support biomedical, statistical, and scholarly claims as well as general ones, preserving existing quotas and budgets. Use the failure reason to choose a new query, then verify the new sources. Keep passive Screen Watch free of new paid work. Do not make every zero-receipt list automatically buy another search.

**Expected effect.** Medium confidence in higher claim coverage; *unverified*. Speed: longer on fallback paths but avoids dead ends. Cost: up to one additional metered search on an explicit action, so track benefit per paid search.

**Measure and cost.** Compare current gate versus zero-receipt-click fallback on fixed claims, then fresh examples; count additional correct-backed claims and cost per additional success. **$0** for mocked gate tests; roughly **$0.50–$1 per 36 extra searches**, route-dependent and *unverified* until logged. Coordinate with PR #4's desktop search measurements.

**Risks/trade-offs.** Retrieval failure is not proof of a false claim. Existing server error shapes stay frozen; expose new actions only in clients that support them. No extra passive text disclosure; review `PRIVACY.md` for any changed context.

**Size/files.** M. Desktop citation-flow views, `services/ai/verifySources.ts`, `search/aggregator.ts`, `webBudget.ts`, source-flow tests.

#### C9. Keep citation-field provenance and resolve conflicts

**Problem and evidence.** `completeSources`, `factcheck.js:584–601`, often skips metadata when year+author are already present and otherwise fills only empty fields. Crossref correctly overwrites model metadata, but non-DOI results can keep a plausible wrong year/author. `citeFields` validates shape, not truth. This is a verified acceptance path; the production error rate is *unverified*.

**Proposal.** Track each field internally as search-provided, registrar-provided, page-provided, or user-entered. Reuse the receipt page's metadata to replace or flag conflicting search guesses. Prefer explicit publication metadata over modified dates, preserving the existing date-reader rules. Show an actionable "date not confirmed" or editable citation field rather than supplying a guess.

**Expected effect.** Medium-high confidence in better field accuracy where conflicts occur. Speed/cost: nearly free when reusing S2's fetch; avoid reading every page a second time.

**Measure and cost.** Twenty conflict fixtures and 30 real source records with manually checked authors, dates, container, and DOI: **$0 model cost**. Report exact field accuracy and percentage of references requiring manual completion. No paid judge is needed to compare a date to metadata.

**Risks/trade-offs.** Structured metadata can itself be wrong; provenance is not a guarantee. Preserve user edits. Add optional metadata fields rather than replacing response shapes. No new writing storage; do not log titles or URLs for production analytics.

**Size/files.** M. `citeFields.js`, `citeMeta.js`, `sourceEnrich.js`, `factcheck.js`, citation editing UI and tests.

#### C10. Deduplicate by work before spending all candidate slots

**Problem and evidence.** Extension `mergeSources` is exact-URL based and stops at six (`factcheck.js:619–638`). Publisher, DOI, PubMed, and repository copies of one study can occupy different slots. Desktop title dedup uses an ASCII-only normalized key (`aggregator.ts:66`), which can also collapse unrelated non-Latin titles with the same year.

**Proposal.** Normalize DOI and canonical work identity, merging complementary metadata and alternative readable locations into one candidate. Normalize only known tracking parameters for URLs; do not remove meaningful query parameters. Prefer a diverse candidate pool by distinct work, not arbitrary domain quotas. Preserve an OA alternate link for C3.

**Expected effect.** High confidence in fewer duplicate slots; increased verified claim coverage is *unverified*. Speed/cost: fewer duplicate fetches and judge entries; free scholarly metadata calls may decrease.

**Measure and cost.** DOI/PMID/URL/Unicode identity fixtures and replay candidate counts from committed runs: **$0**. Compare distinct-work backing coverage after any ranking change; paid confirmation uses the same capped 36-claim run as C7.

**Risks/trade-offs.** Preprint and published versions can differ, as can translations and datasets. Do not merge merely because titles are similar. Preserve stable client IDs or map old IDs additively. Privacy unchanged.

**Size/files.** M. `factcheck.js`, `sourceEnrich.js`, desktop aggregator, identity fixtures.

#### C11. Recover machine-readable full text before adding a general PDF parser

**Problem and evidence.** PDFs are explicitly unread (`sourceVerify.js:352–359`), and `openAccessPage` filters them. Some scholarly evidence is therefore unavailable beyond an abstract. How much of the unread goldset is recoverable this way is *unverified*; bot walls are a different problem.

**Proposal.** First try official machine-readable repository text for recognized works, such as structured full text where available, with source identity and licensing/access checked during implementation. Only if that leaves substantial misses, evaluate a size/page/time-capped PDF worker. Store page/section locators with receipts. Never send an arbitrary PDF to another paid service as an implicit fallback.

**Expected effect.** Medium confidence in higher scholarly reading coverage, uncertain yield. Speed: potentially slower. Cost: free endpoint work initially; a parser adds CPU, memory, maintenance, and violates today's zero-dependency simplicity if put in-process.

**Measure and cost.** Manually classify 30 unread recorded links by cause; **$0 model cost**. Then compare passage recall and fixed-pair verdicts under a **$0.50 eval cap**. Stop if few relevant misses are actually PDF-only.

**Risks/trade-offs.** Malformed files require isolation, decompression limits, and SSRF protections. No bypassing access restrictions. New processors or retention require a privacy-policy change. Additive locators only; retain unread fallback.

**Size/files.** M for recognized repository text; L for PDFs. `sourceVerify.js`, repository adapters, fixtures, optional isolated worker, container configuration if approved.

#### C12. Make support indicators reflect what was actually verified

**Problem and evidence.** Receipts are not fed into desktop strength scores (`src/CLAUDE.md`, receipts section). The score combines relevance and venue signals (`scoring.ts`), while `sourceReceipts.ts:318` permits insertion during an unavailable-verifier fallback, and `:330` can preselect that source. That fallback is an explicit existing product decision, not an accidental missing check.

**Proposal.** Separate "sources found" from "sources verified to back this sentence" in the desktop. After an opened list returns receipts, show a distinct verified-coverage count without silently recalibrating old strength scores. For outages, offer manual citation work clearly, but consider requiring deliberate source selection rather than preselecting a presumed recommendation. The owner must decide whether insertion without a receipt stays allowed; do not silently reverse the fallback policy.

**Expected effect.** High confidence in clearer trust signals; effect on completion is *unverified*. Speed/cost: reuse existing user-triggered receipts, no new passive calls.

**Measure and cost.** UI scenarios for checking/checked/unavailable/topic/refuted/unread, plus five student tasks asking what is verified. **$0 model cost** with fixtures. Require students to distinguish source credibility from claim support; do not score success by clicks alone.

**Risks/trade-offs.** An outage must not prevent users managing citations they supplied themselves. Do not use finding colors for generic source-quality badges. No extra retention. Additive score/coverage fields and client-side presentation preserve installed contracts.

**Size/files.** M. `sourceReceipts.ts`, desktop citation-flow views, `scoring.ts` consumers, trust-copy tests.

### Speed and request efficiency

#### S1. Measure stage latency and every reason evidence is lost

**Problem and evidence.** `/api/sources` logs total milliseconds and receipt counts (`server/server.js:1676`); `usageTally.js` records tokens/cost/cache share, not fetch-stage latency. These cannot tell whether a slow search is model search, metadata completion, reading, verification, or trimming. Production distributions were not available to this review.

**Proposal.** Record monotonic durations for search, metadata, read, judge, trim, and total, plus counters for read outcome categories and candidate/verified counts. Use aggregate histograms per route/pool and client time to first useful result. Count DNS/HTTP/deadline/PDF outcomes without recording the source URL, claim, or user ID. Measure queue time separately from execution.

**Expected effect.** High confidence in diagnostic value, no direct accuracy gain. Speed/cost overhead negligible if aggregated. All actual optimization gains remain *unverified* until observed.

**Measure and cost.** Deterministic clock tests, **$0**; sample one week of naturally occurring aggregate logs with no extra model requests. Compare p50/p95/p99 and cost per verified-backed claim.

**Risks/trade-offs.** Do not create a hidden essay analytics system. Avoid high-cardinality labels and per-user records. Frozen API unaffected by log-only instrumentation; update privacy wording if aggregate measurement practices change materially.

**Size/files.** S. `server.js` source handler, `factcheck.js`, `sourceVerify.js`, `usageTally.js`, telemetry tests.

#### S2. Share fetched page bytes between citation completion and verification

**Problem and evidence.** `findSources` awaits `completeSources` then `verifySources` (`factcheck.js:497,506`), which can each fetch the same non-DOI page. Completion itself awaits enrichment before page metadata work (`:568`). Independent source reads already run concurrently; simply recommending "parallelize reads" would duplicate existing behavior.

**Proposal.** Add a request-scoped bounded fetch result that exposes parsed metadata and readable text from the same bytes. Start safe metadata and text extraction together when no DOI discovery dependency prevents it. Reuse DOI/PMID records as well. Keep final source identity and retraction filtering authoritative before attaching any receipt. Preserve current found/read/judging streaming events.

**Expected effect.** Medium-high confidence in less duplicate fetch work; wall-clock gain *unverified*. Accuracy should stay equal if extraction input is unchanged. Model cost unchanged or slightly lower; bandwidth/CPU lower.

**Measure and cost.** Count requests and staged timing in fixtures: **$0**. Target one fetch per URL within an answer and no lost retraction/mismatched-work filtering. Use free fetch-only timing on a fixed small corpus before paid rejudging.

**Risks/trade-offs.** Share within one request first, not a new persistent cross-user claim cache. Enforce byte limits and URL safety in the common layer. No privacy retention change for ephemeral bytes; version results if semantics change.

**Size/files.** M. `citeMeta.js`, `sourceEnrich.js`, `sourceVerify.js`, `factcheck.js`, corresponding tests.

#### S3. Coalesce identical concurrent work within one caller

**Problem and evidence.** Desktop `appCall` reads a completed cache, runs on a miss, then writes (`server.js:1210–1220`). `verifySourceList` does the same (`services/ai/verifySources.ts:52` onward). Two surfaces opening identical uncached work can both pay. No single-flight mechanism is present in these inspected functions; production overlap is *unverified*.

**Proposal.** Keep a short-lived in-flight promise map keyed by caller, route, chosen model/effort, exact effective input, and policy version. One leader owns the spend reservation and bill; followers receive the result without consuming a second source search. Preserve per-caller admission protection so followers cannot become a rate-limit bypass. Clear on settlement, error, and deadline. Start with identical user-triggered receipt lists.

**Expected effect.** Medium confidence in savings where overlap exists; no savings promised for ordinary sequential traffic. Speed: followers avoid a second run. Accuracy unchanged for exact inputs. Cost: eliminate duplicate calls only.

**Measure and cost.** Concurrent synthetic callers and counters, **$0**. Require one upstream call and one correct ledger charge; test different callers, contexts, model policies, and failures. Count actual coalescible requests before widening scope.

**Risks/trade-offs.** Do not coalesce across people or normalize away meaningful context. Never release a leader's reservation when a follower disconnects. No persistent new text storage, no frozen response changes.

**Size/files.** M. `server.js`/new leaf for in-flight work, desktop receipt service, quota/spend/concurrency tests.

### Flagging accuracy, multilingual behavior, and evaluation

#### A1. Make quote and work identity handling script-aware

**Problem and evidence.** An exact Chinese quote is rejected by `matchQuote`'s three-space-separated-words rule (`sourceVerify.js:303`). Desktop title normalization removes every non-ASCII letter (`aggregator.ts:66`), so distinct Chinese-only titles can share an empty title key in one year. Broader model accuracy outside English is *unverified*.

**Proposal.** Keep exact normalized-span matching but replace the English word-count threshold with script-aware minimum meaningful length/tokenization. Use Unicode letters/numbers in identity keys and refuse an empty title key as an identity. Audit segmentation, abbreviation handling, names, and figure formats before advertising multilingual support. Return uncertainty rather than substituting English sources for an unresolved local-language claim.

**Expected effect.** High confidence in correcting the deterministic Chinese failure; language-wide gains *unverified*. Speed: tiny local overhead. Cost: no added calls for these rules.

**Measure and cost.** Exact/paraphrased/malicious quotes across Chinese, Japanese, Spanish, Arabic, and mixed-script text; duplicate-title cases: **$0**. Then a fresh 60-sentence language-stratified check set, two reps; estimate **under $0.10** from historical checks but enforce a **$0.25 cap**. Human bilingual labels are needed.

**Risks/trade-offs.** A shorter valid receipt must still be meaningful and on boundaries; never accept an arbitrary character substring. Some style systems transliterate names differently. No new retention or API contract.

**Size/files.** M. `sourceVerify.js`, `aggregator.ts`, segmentation and citation helpers identified by audit, multilingual fixtures/eval.

#### A2. Evaluate the complete displayed outcome on a fresh holdout

**Problem and evidence.** The historical 110/110 is not current generalization evidence. Source-judge changes used a small, repeatedly examined goldset; #327 preserved roughly similar backing precision while destroying recall (`eval/goldset/README.md`, 13 October section). Server verdicts also pass through local genre, citation, strictness, and cache filters before the student sees them.

**Proposal.** Freeze a new holdout with human-reviewed fact/source labels and run the real client segmentation, request construction, server judgment, and display filters. Stratify opinion/common knowledge, anonymous study, named source, incorrect citation, pronouns, late paragraphs, multilingual text, and writing kind. Track false red flags, missed evidence needs, unsupported citation offers, and correct-backed claims; cluster uncertainty by sentence/document, not independent repetitions. Repeated runs measure stability, not more independent examples.

**Expected effect.** High confidence in identifying regressions and avoiding overfit; no direct model gain promised. Speed/cost: eval-only.

**Measure and cost.** Client/local fixtures **$0**. About 150 fresh sentences × two reps in short batches should be **under $0.25** at historical check prices; reserve **$0.50**. A 36-claim search holdout adds roughly **$0.50–$1 per arm**. Separate human labeling time from API cost and approve paid runs first.

**Risks/trade-offs.** Synthetic data alone may flatter performance; recruit consented, de-identified examples without retaining full student drafts by default. Never publish a single aggregate "accuracy" as a guarantee. Any prompt/model change still needs dated findings and regression gates.

**Size/files.** M. `eval/models/harness`, new client-to-server holdout runner, extension display fixtures, `eval/models/FINDINGS.md`.

#### A3. Preserve stable verdicts, but offer explicit refresh after context changes

**Problem and evidence.** Extension cache keys are sentence-based (`content.js:5740,6104`); the owner deliberately requires unchanged sentences to keep their verdicts. Desktop `webSources.ts:80–88` pins context by claim text. An identical "She conducted the experiment" can acquire a different referent after surrounding edits, and a present-tense claim can become stale. Frequency is *unverified*.

**Proposal.** Do not silently recheck unchanged sentences. Track a local context fingerprint and show an explicit "Check again with this paragraph" action when the writer changes the relevant context. Scope search-query pins by document/entity context rather than globally by identical sentence text. For receipts, key on effective source identity/content inputs and an explicit verifier version, not only IDs (`sourceReceipts.ts:196`). Preserve local stored answers until the user chooses a refresh.

**Expected effect.** Medium-high confidence in avoiding wrong-context reuse; actual incidence *unverified*. Default speed/cost unchanged; explicit refresh pays for new work.

**Measure and cost.** Pronoun, copied sentence across documents, changed source URL with same ID, and old-cache fixtures: **$0**. Paid fresh checks are only needed when evaluating changed model input, under A2's cap.

**Risks/trade-offs.** Must respect the owner's stable-underlines decision, privacy retention, and intentional source pinning. Do not create automatic repeated billing. Cache-version changes should be explicit releases with no rewriting of old source records.

**Size/files.** M. `content.js` cache presentation, `webSources.ts`, `sourceReceipts.ts`, receipt service, cache tests.

#### A4. Make a wrong writing kind easy to correct at the point of use

**Problem and evidence.** The fresh rule-only set has 13.5% wrong checking groups and five checked documents classified quiet (`extension/CLAUDE.md`, writing-kinds section). `FEATURES.modelKind` is off (`content.js:255`). A manual document kind already exists (`:702`); hiding uncertainty in the header does not remove its effect on checks.

**Proposal.** Expose the existing per-document override from the kind chip/quiet-state explanation and provide a "check factual claims here" escape hatch. Keep the sure-only naming rule. Do not claim a new model classifier is ready until its existing eval passes. For mixed documents, test paragraph-level quiet regions before applying one quiet type to everything.

**Expected effect.** High confidence in a usable recovery path; automated accuracy gain *unverified*. Speed/cost: no model needed for the override.

**Measure and cost.** Reuse untuned corpora to count wrong-group impact and simulate overrides, **$0**. Five usability tasks should establish whether students can restore checking without searching Settings. If modelKind is considered, run its own cost estimate and eval separately.

**Risks/trade-offs.** A manual override must not start reading a site the user never enabled. Keep quiet-state consent and finding colors. Additional context transmission for modelKind requires the already documented privacy change.

**Size/files.** S–M. `content.js` kind chip/quiet-state wiring, options document settings, writing-kind tests.

### Robustness, operation, and change control

#### R1. Drain in-flight paid work on shutdown; account conservatively after a crash

**Problem and evidence.** `server/lib/spend.js:137–139` intentionally keeps holds in memory on the assumption a restart ends requests. `llm.js:182,282` separately recognizes that a timed-out request may still be billed by the vendor. `server.js` has no SIGTERM/SIGINT drain handler in this snapshot; the container starts Node directly via `exec` (`scripts/container-start.sh`). A killed process cannot record the eventual bill. Actual production losses are *unverified*.

**Proposal.** Add SIGTERM draining: reject new model admissions, finish active requests within a bounded grace period, write charges, flush aggregate counters, then close. Persist a minimal outstanding-reservation journal before outbound paid work; on hard crash, reconcile unresolved entries conservatively without storing prompts. Maintain the one-instance deployment rule. Verify Railway's actual shutdown grace and volume behavior before choosing durations.

**Expected effect.** High confidence in improving planned-restart behavior; crash-accounting gain *unverified*. Steady-state speed: small SQLite bookkeeping. Cost: avoids unrecorded spend; may temporarily overcount unresolved calls until reconciled.

**Measure and cost.** Fake-provider process tests: SIGTERM during search/check, forced termination and restart, double-release, midnight rollover, journal cleanup. **$0**. Do not kill the real production process for a test.

**Risks/trade-offs.** Never charge twice. Distinguish conservative internal budget accounting from what users are told they used. No API changes or raw writing retention. Minimal journal contents require a privacy review if they introduce a new retained identifier.

**Size/files.** M. `server.js`, `lib/spend.js`, SQLite journal code, container runbook, shutdown tests.

#### R2. Cancel timed-out retrieval work and bound queue length

**Problem and evidence.** `safeSearch` uses `Promise.race` but deliberately leaves timed-out provider work running (`aggregator.ts:101–128`). `rateLimiter.ts` queues per provider without cancellation. DOI enrichment runs after the search timeout wrapper (`aggregator.ts:387`); its OpenAlex fetches do not carry abort signals (`openalex.ts:141,175`). A timeout can finish the UI's wait without freeing work or bounding the later stage.

**Proposal.** Thread one search deadline/AbortSignal through provider fetches and queue waits, including enrichment. Remove canceled waiters before they send requests. Bound pending per-provider and per-pool work so an outage cannot consume the process with abandoned tasks. Keep partial useful results and surface a retryable failure rather than an indefinitely spinning flow. Use cooldown on repeated provider 429s, respecting actual retry information.

**Expected effect.** High confidence in resource bounds; tail-latency and provider-success gain *unverified*. Speed: better during stalls, neutral normally. Cost: fewer wasted requests, no extra paid retries.

**Measure and cost.** Hundreds of synthetic queued claims with hung fetches; assert bounded outstanding jobs, fast cancellation, and isolation between pools: **$0**. Measure memory, queue latency, and event-loop delay, not merely whether the response returned.

**Risks/trade-offs.** Shared callers must not cancel one another's work. Paid provider calls may still be billed after abort; preserve worst-case charging. Do not add a failover model absent its eval and budget policy.

**Size/files.** M. Desktop provider interfaces, `rateLimiter.ts`, `aggregator.ts`, `openalex.ts`, server admission/concurrency tests where shared bounds are added.

#### R3. Add a real-Docs compatibility canary and explicit degraded mode

**Problem and evidence.** `docs-hook.js` depends on `_docs_annotate_canvas_by_ext` (`:78`), `.docs-texteventtarget-iframe` (`:687`), `.kix-appview-editor` (`:692`), internal text/range adapters, and synthetic clipboard events (`:719`). Many UI decisions in `extension/CLAUDE.md` are marked tested only on a stand-in. Existing synchronous selection verification and read-back guards are valuable and should stay.

**Proposal.** Maintain a dedicated synthetic test document owned for testing, never a student's assignment. Before release, exercise read, underline position, repeat occurrences, one-sentence replacement, citation/list insertion, Undo, zoom, comments sidebar, list markers, read-only mode, and non-Latin text. Add a capability check that disables write-back cleanly when Docs internals change, retaining copy/manual options and explicit status.

**Expected effect.** High confidence in detecting compatibility breaks earlier; failure frequency *unverified*. Normal speed/cost unchanged. Tests use local/mock responses and no paid model.

**Measure and cost.** Existing stand-in tests plus a human-supervised real-browser canary, **$0 API cost**. Assert final text and exact Undo result. Never allow the historical public student test Doc to receive automated edits.

**Risks/trade-offs.** No unattended edits to real work. No new Google permissions or alternate account access. Keep one-sentence acceptance and verify-before-paste guards, even if they cost a few milliseconds.

**Size/files.** M. `docs-hook.js` capability reporting, `content.js` degraded mode, `extension/dev` harness, release checklist.

#### R4. Close change-control gaps and test hostile source text

**Problem and evidence.** `prompts.test.js:152` pins imported prompts, while the verifier's main prompt is inline and covered by phrase assertions (`source-verify.test.js:331`). Source pages and student text are placed into model input as quoted data (`sourceVerify.js:477` onward). Strict JSON and verbatim quotes help, but do not prove resistance to instructions embedded in a source. Exploitability is *unverified*; this review did not attack production.

**Proposal.** Inventory every production prompt, schema, cache version, and route policy; explicitly protect inline check/source/verify/coverage behavior with byte hashes or equivalent versioned artifacts. Add adversarial source fixtures that try to instruct the judge, embed fake claim text in boilerplate, or forge a citation. Preserve numeric and quote gates independently. Audit `safeFetch`'s DNS validation-to-connection boundary (`citeMeta.js:575–589`): validation and fetch resolve separately; test address changes and consider pinning a validated public address. Treat the DNS issue as an audit hypothesis, not a proven exploit.

**Expected effect.** High confidence in more reviewable changes, medium confidence in useful hardening; actual attack exposure *unverified*. Speed/cost: no steady-state model increase; connection pinning must be benchmarked.

**Measure and cost.** Hash/version tests, injected resolver changes, redirect fixtures, and malicious-text shape tests: **$0**. Live model resistance evaluation requires a small capped run, **$0.25 suggested**, with correct support/abstention labels and no real secrets.

**Risks/trade-offs.** Hashes catch change, not wrong behavior. Do not "fix" prompt injection by trusting site reputation or blocking unfamiliar opinions. Preserve HTTPS validation, hostnames, redirects, frozen errors, and the zero-dependency choice unless a separate design approves otherwise.

**Size/files.** M. Inline prompts, `prompts.test.js`, source-verification fixtures, `citeMeta.js`, cache-version documentation; prompt edits require eval and dated findings.

### Cost decisions

#### K1. Optimize dollars per useful citation, and distinguish fixed limits from unit economics

**Problem and evidence.** `usageTally.js` logs per-route cost, not whether a paid search produced a usable source. Recorded extension search cost around 1.28 cents predates some verification/trim work; it is not a guaranteed current blended cost. `plan.js:299` applies $2.50/$5 monthly fair-use ceilings in addition to search counts. The paid extension has no global search-hour window (`server.js:1597`), but still shares a reserved dollar pool; 220 paying accounts would not imply 220 concurrent searches are supportable.

**Proposal.** Join aggregate cost counters to completed verified-backed-claim counts, including empty, failed, automatic, and correction searches. Estimate contribution after API, payment, hosting, and support costs using observed usage distribution, not fully-used allowances alone. Keep daily/monthly quota accounting and existing fair-use UI. Use observed duplicate rate and S3 overlap to decide caches; do not ship a cross-user text cache on a guessed hit rate.

**Expected effect.** High confidence in better budget decisions, savings amount *unverified*. Speed/accuracy neutral directly. Do not lower check effort or replace Luna on speculation.

**Measure and cost.** Naturally occurring aggregate logs for a week, **$0 extra API cost**. A recorded 1.4-cent total search would make 100 searches roughly $1.40 and 250 roughly $3.50; these are **illustrative arithmetic, not measured current plan margins**. Track p50/p95 usage and failures separately.

**Risks/trade-offs.** Do not store student sentences to attribute success. A cost cap is not user value; suppressing searches can reduce conversion. Keep existing privacy statements about counts and no raw text logs accurate.

**Size/files.** S–M. `usageTally.js`, source route aggregate outcomes, a non-content operational report, plan documentation if measured economics warrant a later decision.

### Features that could justify paying

These are product hypotheses, all *unverified* for willingness to pay. They extend evidence/citation work and do not add grammar, style, essay rewriting, or automatic multi-sentence edits.

#### P1. Save an evidence card with a reusable receipt

**Problem and evidence.** The extension already keeps a source list per sentence; the desktop has a library and receipts, but a reusable source is different from a reusable claim-to-source relationship (`sourceReceipts.ts`, `services/ai/verifySources.ts`). Re-finding why a source was useful is avoidable work.

**Proposal.** Let the student explicitly save claim, exact quote, work identity, readable link, citation, and verification date to a local evidence card. When reusing it for a different claim, show the original association and verify the new claim on a click. Offer source-folder and bibliography export without writing the student's essay.

**Expected effect.** Medium confidence in utility, paid conversion *unverified*. Speed: instant reuse for the same association. Cost: none for local reuse; one existing receipt call only if the claim changes and the student asks.

**Measure and cost.** Five to ten students complete a two-session research task; measure successful reuse and avoided repeat searches. **$0 API with fixture prototype**; any real checks use normal metered limits. Ask what they would stop using/pay for, not whether they like the concept.

**Risks/trade-offs.** A saved receipt can become stale or retracted. Keep local by default; cross-device cloud sync would newly retain user writing and requires an explicit privacy/product design. No silent source endorsement for a new claim.

**Size/files.** M. Desktop library/storage, receipt types, extension export flow if added, bibliography export fixtures.

#### P2. A pre-submission citation audit with actionable repairs

**Problem and evidence.** Existing citation rules cover missing entries, unused references, page numbers, named-source notes, and optional citeFit; they are spread across cards (`content.js` citation helpers around `:2980–3274`, `:4459`). `FEATURES.citeFit=false` means wrong-source checking is not yet a measured shipped guarantee.

**Proposal.** Provide a user-triggered audit that groups unresolved citation tasks and missing metadata, reuses existing checks, and supports one repair at a time. Let students export the bibliography in the chosen declared style. Show "not checked" separately from "no problem found." Only add wrong-source audit after the existing citeFit eval passes its bar.

**Expected effect.** Medium-high confidence in utility; willingness to pay *unverified*. Speed: most list reconciliation is local. Cost: existing searches only on demand; do not recheck a whole paper just to populate a summary.

**Measure and cost.** Ten deliberately flawed bibliographies and student correction tasks, **$0 with fixtures**. Measure unresolved real errors after use and harmful suggested fixes. CiteFit evaluation is a separate few-cents estimate from its runner, with a stated cap before any run.

**Risks/trade-offs.** No "citation-perfect" guarantee. Do not remove legitimately uncited bibliography entries without the writer's acceptance. Keep one-at-a-time edits and Undo. No new cloud storage needed.

**Size/files.** M. Extension citation panel/audit entry point, desktop citation flow, export helpers, existing citation tests.

#### P3. Class-specific source requirements and a student-controlled evidence packet

**Problem and evidence.** Students already have citable-only/avoid-site controls and document citation preferences, but these do not express assignment requirements such as primary sources or a date range (`content.js` prefs and `backingSources`; desktop `sourceFilter.ts`). A generic reputation tier is not an assignment rubric.

**Proposal.** Let a student set local assignment requirements: allowed source types, year range, primary-source preference, and citation style. Filter candidate offers without changing factual verdicts or pretending reputable means supportive. Export a student-selected evidence packet of claims, receipts, references, and unchecked limitations for a teacher to review. Start with a download/share action; defer a teacher dashboard and institutional billing until demand exists.

**Expected effect.** Medium confidence in reducing unusable offers; payment and teacher adoption *unverified*. Speed/cost: local filtering/export free, but restrictive requirements can require additional explicit searches.

**Measure and cost.** Pilot three assignment types with students and one teacher; count verified sources accepted under the actual requirements. **$0 prototype API cost**. Require evidence of repeat use and a concrete willingness-to-pay test before building accounts/classes.

**Risks/trade-offs.** Exported quotes and writing can identify students: make export explicit and previewable, never automatically send it. Cloud class management would change retention, access, and privacy significantly. No blanket claim that a source type is required by every teacher.

**Size/files.** M for local presets/export; L for a future class service. Document prefs, source filters, evidence library/export UI, privacy documentation if sharing/storage is added.

## Decisions and questions before implementation

1. **What is the primary release target: the new extension listing or desktop?** Main is ahead of installed builds. Verify actual live server and client versions before claiming a fix reaches users. No status/deployment assertion was made here.
2. **Which workflow defines success?** Recommended primary outcome: a claim gets at least one correctly formatted, verified, assignment-acceptable source, with false backing offers separately gated. Define the acceptable precision/recall trade-off with human examples.
3. **Can we inspect a week of aggregate production stage/cost logs?** This is necessary to rank reading versus search latency, duplicate calls, automatic-search usefulness, and pool capacity. Do not supply raw drafts or keys.
4. **What should happen when verification is unavailable?** The desktop intentionally permits insertion; decide whether manual insertion remains with no preselection, or whether a receipt becomes mandatory for tool-suggested citations. Keep the distinction from user-managed citations.
5. **Which style editions and Chicago mode are promised?** Approve a human-checked fixture set, including rich-text versus plain-text expectations, before consolidating formatters.
6. **Which languages are supported today?** Fix deterministic script bugs first; do not imply validated accuracy in languages without an appropriate holdout.
7. **How much extra search is worth one additional backed claim?** Set a maximum cost per successful fallback and require an explicit click. Retain the existing paid-search quotas and passive-Screen-Watch boundary.
8. **Are machine-readable full text or PDFs worth the operational burden?** First classify unread sources; do not add a general document parser merely because PDFs exist.
9. **What is Railway's confirmed shutdown grace and single-instance behavior?** Test drain, volume recovery, and outstanding reservations in a throwaway environment before relying on restart accounting.
10. **How should a sentence react to changed context?** Default proposal preserves old verdicts until explicit refresh; obtain the owner's decision before changing stable-underlines behavior.
11. **What may be retained or exported for paid features?** Local evidence cards are the small starting point. Cloud sync/class dashboards need explicit retention, deletion, access, and sharing decisions.
12. **Which paid eval caps are approved?** No approval or spend is assumed from this review. Cost estimates above are based on committed historical runs; runners must recalculate and stop at a cap.

## Coordination and implementation order

Observed open PRs during this review: #4 lean desktop source-search eval; #5 beta burst-test deflake; #6 healthcheck key rejection; #7 desktop sign-in; #8 Show me highlight; #9 launch/legal documents. This review changes only its new Markdown file. Recheck open PR files before implementing any recommendation; titles alone do not establish non-overlap.

Suggested sequence: C1/C2/C3 plus S1; C4/C5/A1; S2/S3 and R1/R2; then C6/C7/C8 behind controlled evals. Prototype P1/P2/P3 with students before building new backend services. Keep #4's lean search experiment, free-index-first extension work, shared cache measurement, lazy trimming, basis-field experiments, and Batch evals in their existing tracks rather than claiming them as new discoveries.

No recommendation here authorizes deployment, merging, changing a prompt, or spending on an eval. Every future change retains frozen route/error contracts, one-sentence acceptance, the receipt requirement, and no-writing-tips rules. Where a proposed behavior deliberately revisits an owner decision, that decision is named explicitly above.

## Delivery status

The requested review text is complete at `docs/ideas/2026-10-codex-review.md` in a local snapshot of the pinned commit. Authenticated GitHub access was not available to this session: command-line requests failed, no GitHub connector tools were exposed, and the browser was signed out. Therefore **no remote branch or draft PR was created**. A matching PR-template body is included below. Do not describe this file as an opened PR or as committed to the upstream repository.

### Prepared draft PR details

Target branch: `docs/codex-ideas`. Title: `docs: ideas to make Tracely better (Codex review)`. Base: refresh `main` before creating the branch and recheck open PR file overlap. The following is prepared text, not an existing pull request.

#### What and why

Adds an ideas-only review of Tracely at `46df2d995219a8773e2d0f3d379d5f4f65ddff96`: a ranked top 10, 27 proposals grouped by area, and implementation questions. It separates reproduced defects, older committed measurements, and unverified projections. Offline probes reproduce late-paragraph context loss, a skipped full-text fallback, retained all-dead results, numeric-unit gaps, and rejection of exact Chinese receipts.

No product code, prompt, setting, version, or deployment change. The review gives proposed files, size, expected effects, measurement costs, and risks for each idea.

#### Surface

- [ ] **Desktop** — no implementation change.
- [ ] **Server** — no implementation change.
- [ ] **Extension** — no implementation change; manifest and `EXTENSION_API` unchanged.
- [x] **Docs, tests, tooling** — review Markdown only; nothing to deploy.

#### Checks

- [ ] `cd server && npm test` — full suite not run; no server/extension code changed.
- [x] `npm run typecheck && npm test` — not applicable; no `src/` change.
- [x] Prompt measurement/hash update — not applicable; no prompt changed and no paid eval ran.
- [x] Focused offline source verification, enrichment, and figure suites: 44/44 pass.
- [ ] Broader source-citation integration run: 48/49 pass; mock HTTP server startup/reachability failure unresolved. Direct mock startup separately succeeded.
- [x] No `.env*`, key, token, or `beta.json` in the proposed documentation diff.
- [ ] Branch up to date with `main` — must be verified when authenticated branch creation becomes possible.

#### Handoff

- **Needs Sam:** no deployment; review ranked evidence and proposed evaluation gates.
- **Needs Merrick:** select implementation priorities and decide the named product-policy questions; no installer/store action.
- **Order:** documentation review, then separate small implementation PRs; approve capped paid evals before any run.
- **Hot files touched:** none. Only `docs/ideas/2026-10-codex-review.md` is the proposed repository change.
- **STATUS.md:** unchanged; nothing shipped.

## Verification by Claude Code (2026-10-22)

The review was checked against `main` at `46df2d9` before it was committed. Each reproduced finding was confirmed by reading the cited lines and, where a probe was described, re-running it offline at $0:

| Finding | Result |
|---|---|
| C2, the source search gets the document head, not the claim's neighbourhood | Confirmed. `extension/content.js:8988` sends `docText.slice(0, 6000)`. |
| C1, every result is dead, so none is dropped | Confirmed. `server/lib/factcheck.js:610` drops dead links only when `dead.size < list.length`. |
| C5, units and percentage points | Confirmed. `figuresShown` returned `ok: true` for 10 meters vs 10 feet, and for 10 percentage points vs 10 percent. |
| A1, script-aware quotes and titles | Confirmed. `matchQuote` rejects an exact 18-character Chinese quote (fewer than three space-separated words); an English control matched. `normalizeTitle` (`aggregator.ts:66`) keeps only `[a-z0-9]`. |
| C4, desktop APA authors | Confirmed. `ET_AL_THRESHOLD = 3` in `src/main/services/citations/authorUtils.ts`. |
| R4, prompt pins | Confirmed. `server/test/prompts.test.js` pins `lib/prompts/*` only; the extension's check, source-search (`SOURCES_SYSTEM`), verifier and cover prompts are inline and unpinned. |
| R1, no shutdown drain | Confirmed. `server.js` has no SIGTERM/SIGINT handler. |
| C3, the original page is skipped after an insufficient abstract | Confirmed, with one note: the comment at `sourceVerify.js:439` says this is deliberate (a paywalled publisher page is usually the abstract again). Treat it as an eval question rather than a defect. |
| The corrections to the supplied map (search effort `low`, the check context rule, auto-search covering `questionable` only, Luna not the absolute cheapest, 110/110 as one experiment) | Confirmed. `server/CLAUDE.md` still says source search sends no effort; that line is stale. |

Delivery: Codex had no GitHub access, so this file was committed and its draft PR was opened from the Claude Code session. The "Delivery status" section above describes Codex's session, not the repository.

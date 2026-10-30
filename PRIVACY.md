# Tracely Privacy Policy

*Effective: 24 October 2026. This update says how long OpenAI may keep the
text it checks (up to 30 days, in its abuse-monitoring logs, never for
training), names who hosts our server (Railway, since 23 October 2026) and
our website (Vercel), covers the website itself, sets the minimum age at 13,
says how Tracely answers a browser's Do Not Track signal, adds a security
section, and takes privacy requests by email rather than in public. Later the
same day it added OpenAlex's search and Brave Search, which may be asked
first when Tracely looks for sources: they receive the sentence being looked
up, never the document (see "Finding sources" and "Who else processes your
data"). Earlier
the same day, it said that a lookup carries a few labels about itself, never
text, and that Help's diagnostics hold a few counts (see "Finding sources"
and "On your device"). The 23 October 2026
version said that the extension looks up a claim before it flags it as
needing evidence or a citation, and counts those lookups. The 22 October 2026 version said that
the desktop app's results are kept on our server for 1 to 7 days and then
deleted (see "What we keep, and for how long"); before it they were kept
with no end date, which this policy did not say. The 3 October 2026 version added the site icons shown
beside sources, loaded from Google's favicon service (see **Google** under
"Who else processes your data"), and said when text is sent for checking: a
few seconds after a sentence is written or changed, rather than on a
ten-second timer. The 24 September 2026 version replaced the
August 2026 policy, which described an earlier version of the extension that
ran on your own API key with no server and no accounts. That is not how
Tracely works now, so this policy starts from what the current version
actually does.*

This policy covers the **Tracely Chrome extension**, the **Tracely
service** it talks to (`api.jointracely.com`), what that service keeps of the
**Tracely desktop app**'s requests, the **try-out page**
(`api.jointracely.com/try`, shown on jointracely.com/try) and the **website**
(jointracely.com), all operated by Tracely ("we"). It is written from the code: each statement below names the part of
the product it describes.

## The short version

- The text you are checking is sent to our server and on to OpenAI to be
  judged. **We do not store your text.** It is processed and discarded. The
  one exception is the desktop app's results, which can include sentences from
  your draft: they are kept for 1 to 7 days, so the same request isn't paid for
  twice, and then deleted automatically. OpenAI never uses it for training,
  but may keep it for up to 30 days to check for abuse.
- Google Docs is checked only after you turn Tracely on for Docs, once. Other
  sites are checked only after you turn Tracely on for that site. Until then
  nothing is read from the page.
- No account is needed. If you sign in with Google, we keep your email
  address and account id and the plan attached to them.
- We keep usage counts against your account (or an anonymous install id) for
  13 months, and payment records (which plan, when) for as long as you have
  an account.
- You can delete your account and everything we keep with it from the
  extension's options page, at any time.
- We do not sell data, show ads, or use your text for anything but checking
  it.

## What is sent, and when

**Checking.** While Tracely is on for the page you are writing in, the
extension sends the text of the document or text box (up to 30,000
characters) and the sentences to check to `api.jointracely.com`, a few
seconds after you write or change a sentence. A sentence that has already been
checked is not sent again. For "Explain in depth", one sentence and the
document context. For the flow check, the first 12,000 characters. When
Tracely recognises a resume, its first 12,000 characters, for Resume tips. Our server
forwards this to **OpenAI** (the model that does the judging) and returns the
verdicts. Our server holds the text only for the seconds the check takes.
OpenAI does not use it to train its models, and every request asks OpenAI not
to store it; OpenAI may still keep requests for up to 30 days in its
abuse-monitoring logs, as its API terms allow.

**Finding sources.** When you ask for sources (or turn on automatic sources in
the widget), the flagged sentence, its suggested correction and up to 6,000
characters of surrounding text are sent to our server and to OpenAI, whose
web-search tool may run searches derived from that sentence. When our server
has it turned on, it first searches for the sentence in **OpenAlex** (a free
index of scholarly papers) and, if it is set up, **Brave Search**: each
receives that one sentence, with its citation taken out, as a search query,
and never the document, the text around it or anything about you. OpenAI's
search runs only when nothing they find backs the sentence. Tracely also
looks up a claim the check would mark as needing evidence or a citation
before it flags it (up to 5 a check), sending the same, without the
suggested correction. With each such lookup it also sends a few labels,
never any text: what kind of claim it is, its place in the queue, whether
the document already had sources for a related sentence, and whether
another document on your computer had already looked it up. Our server
keeps only hourly totals of those labels. Settings → Checking → "Look for
evidence automatically" turns that off.

**Citing a pasted URL.** A URL you paste into the widget is fetched by **our
server** (not your browser) to read its title, author and date. The site you
pasted sees our server's address, not yours. Private and local addresses are
refused.

**Google Docs.** The first Google Doc you open with Tracely installed asks
whether to turn Tracely on for Docs. If you say yes, Tracely reads the
document's text through your own Google session (the same way Docs itself
exports a document) and checks it as above, in every Doc you open, until you
turn it off on the options page. If you say no, nothing is read. "Fix in doc"
and "Cite in doc" edit the document through the editor's own paste path — no
Google API, no extra permission — and the edit is read back before it is
reported as done. Google may record, in its own diagnostics, that a
third-party annotation extension is present.

**Other sites.** The widget can appear on any page with a large text field,
but it reads nothing and sends nothing until you switch on "Auto-check on this
site" for that site. Password fields and fields that look like sign-in forms
are never read. Turning a site off clears what Tracely cached on that page.

**The try-out page.** The try-out page lets you test Tracely on a sample
essay without installing anything. Text you check there (up to 3,000
characters at a time) is sent to our server and to **OpenAI** to check it,
exactly as above, and a sentence you ask sources for, with up to 1,500
characters around it, is sent the same way;
nothing you type is saved, by us or by the page. The page sets one cookie,
`tracely_demo`: a random id with no link to you, your browser profile or any
account, which expires after a day and lets the page count how many checks you
have used. We keep only those counts (see below), never the text. If you also
have the extension installed, it stays out of the way on that page.

**Signing in.** "Sign in" opens Google's sign-in through **Supabase**, our
account provider. We receive your email address and an account id; we do not
receive your Google password. A session token is kept in the extension's
storage on your device until you sign out. Signing in on the website keeps its
own session token in that browser's storage for jointracely.com, until you sign
out in the website's Settings.

**Paying.** Plans are bought on **Stripe**'s hosted checkout at
jointracely.com. Your card details go to Stripe and never to us. Stripe tells
our server which plan was bought, the Stripe customer id and the email used to
pay, so the plan can be attached to your account. If you buy before signing
in, the purchase waits until an account with that email signs in.

**The website.** jointracely.com loads its typeface from Google Fonts, so
Google receives your IP address and browser details when a page loads. Signing
in on the website uses the same Google sign-in through Supabase as the
extension, and buying a plan opens Stripe's checkout with your account id, so
the purchase reaches your account. The website's Fact check and Find sources
send the text you give them to our server: signed out, as the try-out page
does (above); signed in, on your account's plan, the way the extension's
checks do. The website sets no advertising or
analytics cookies.

**Every request** to our server carries a random install id, generated once
per browser profile, so plan limits and fair-use caps can be applied without
an account. It identifies a browser, not a person, and is stored hashed. When
you are signed in, requests also carry your session token. The extension
checks whether our server is reachable about once a minute while your browser
is open; that request carries no content.

## What we keep, and for how long

On our server:

| what | keyed by | kept |
|---|---|---|
| Usage counts (checks, source searches, automatic lookups, flow checks and resume reviews per day and month; spend against your plan's allowance) | account id, or the hashed install id | 13 months, then deleted automatically |
| Try-out counts (checks, source searches and reviews used on the try-out page that day) | a hash of the try-out cookie's random id | 13 months, then deleted automatically |
| Account link: Stripe customer id, plan, the email used to pay | account id | while the account exists |
| Payment events from Stripe: event id, type, plan, outcome | account id | while the account exists; the payer's name, address and phone are removed before the event is stored |
| An unclaimed purchase (plan and payer email) awaiting its account | payer email | until claimed, or until the subscription ends |
| The desktop app's results (the claims found in a draft, its structure, critiques, suggested rewrites, grades and source lists), which can include sentences from the draft, so that the same request is not paid for twice | a hash of the request | 1 day (claims found, structure) or 7 days (the rest), then deleted automatically within the hour |
| Request logs kept by our host, Railway (IP address, time, path) | — | deleted by Railway at the end of its log-retention period |

Our application logs record which route was called and whether it succeeded —
never your text, email, tokens or IP address.

Apart from the desktop app's results in the table above, we keep **no copy of
the text you check, no documents, and no record of which pages or documents
you use Tracely on.** Our server never receives a page's URL, only the text.

On your device, in the extension's storage: your settings, the sites you have
switched on, whether Docs is on, the install id, your session token and plan
details. Since version 2.21.62 also:
- the outcome of the last 20 edits Tracely made in a Doc, for Help's
  diagnostics, without any of the document's text, and since 2.21.74 a few
  counts from the last Doc you opened (how many sentences were checked, how
  many another of your Docs had already checked, how many were gone again
  soon after), never which sentences;
- since 2.21.64, a list of the Google Docs it has checked: each one's title,
  link, how many findings were open, and your own settings for it;
- the sentences you told it never to flag again.

These stay on your device and are never sent to us. Settings → Memory shows
each one and clears it, and Privacy and data exports them. Chrome removes all
of it when you uninstall. Tracely also caches
verdicts and source lists for each page it has checked in that page's own
browser storage, so reopening the page does not re-check unchanged text;
turning a site off clears its cache, and clearing the site's data in Chrome
removes the rest.

## Who else processes your data

- **OpenAI** (api.openai.com) — judges the text and runs source searches, on
  our API key, under OpenAI's API data-usage terms: it does not train on the
  text, every request asks it not to store it, and it may keep requests for up
  to 30 days in its abuse-monitoring logs.
- **Crossref** (api.crossref.org), **OpenAlex** (api.openalex.org) and **the
  publishers of the sources we find** — after a source search, our server
  looks up each source's DOI at Crossref and reads the source's own web page
  to complete its citation (authors, date, journal), and reads a scholarly
  source's abstract from OpenAlex — and the open-access copy OpenAlex lists
  for it, which may be on a university or repository site — or the page's
  text, to check that the source really says what the sentence claims before
  offering it (that check is made by OpenAI, above), and whether the work has
  been retracted. A PubMed source is looked up the same way at NCBI
  (eutils.ncbi.nlm.nih.gov). They receive that source's DOI, PubMed id or
  address, never your text or the sentence being cited, except OpenAlex's
  search when our server has it turned on (below). When you click "Find the cited work",
  our server sends that citation's words (author, title words, year), or the
  matching entry from your reference list, to Crossref and Open Library
  (openlibrary.org) to look the work up.
- **OpenAlex's search** (api.openalex.org) and **Brave Search**
  (api.search.brave.com), when our server has them turned on, for finding
  sources: each receives the sentence being looked up, with its citation
  taken out, as a search query, and never the document, the text around it or
  anything about you. We keep none of what they return except the links our
  server then reads.
- **Supabase** — sign-in and account records (email, account id, plan).
- **Stripe** — payments; we receive plan, customer id and payer email, never
  card details.
- **Google** — Google Docs is read through your own session; Google sign-in
  through Supabase; Google's own diagnostics may note the extension's presence.
  When sources are shown, your browser loads each source's small site icon
  from Google's public favicon service (www.google.com/s2/favicons), which
  receives that source's domain name — never your text or the sentence being
  cited.
- **Railway** — hosts our server (since 23 October 2026), and with it the text
  passing through for the seconds a check takes, and the records in the table
  above.
- **Vercel** — hosts the website, jointracely.com, and receives the requests
  a web host does (IP address, page, browser).
- **Google Fonts** — serves the website's typeface (above).

None of them receives more than the feature needs, and none is permitted to
use it for anything else.

## Do Not Track

Tracely does not follow you across other websites, and no other company tracks
you through the extension, the desktop app, our server or the website. So
there is nothing for a browser's Do Not Track signal to switch off: Tracely
works the same whether or not your browser sends it.

## Security

Every connection to our server and the website is encrypted (HTTPS). Card
details are held by Stripe and never reach us, and sign-in is handled by
Google through Supabase, so we hold no passwords. Access to our server,
database and accounts is limited to the people who run Tracely, and keys are
kept out of the code. If a breach exposes your personal information, we will
tell you as the law requires.

## Your controls

- **Turn it off:** per site in the widget, for Google Docs on the options
  page. Off means nothing is read.
- **Sign out:** options page. The session token is deleted from your device.
- **Delete your account and data:** options page → "Delete my account and
  data". This removes your usage counts, account links and unclaimed
  purchases, strips the payer details from your payment record, and deletes
  the sign-in account. Cancel a paid plan first (Manage subscription), so the
  card is not charged for an account that no longer exists.
- **Uninstall:** Chrome removes the extension's storage. Anything cached in a
  page's own storage is cleared with that site's data.

## Limited Use

Tracely's use of information received from Google APIs, and of any user data
it handles, adheres to the Chrome Web Store User Data Policy, including the
Limited Use requirements. Data is used only to provide and improve the
extension's fact-checking, sourcing and account features that you see; it is
not sold, not used for advertising, and not transferred except to the
processors above for those features, or as required by law.

## Children

Tracely is for people **13 and older**. If you are under 18, you need a parent
or guardian's permission to use it, and a parent or guardian must buy any paid
plan. We do not knowingly collect personal information from children under 13;
if we learn that we have, we delete it. A parent who believes their child under
13 has used Tracely can email us at the address below.

## Changes and contact

Changes to this policy are published here, with the effective date at the
top. A change to how your data is used is also announced in Tracely or by
email before it takes effect.

Questions, and requests to see, correct or delete what we keep about you:
email **info@jointracely.com**. Please don't put personal details in a
public GitHub issue.

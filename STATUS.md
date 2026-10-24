# STATUS — what is live where

The one file to read before asking "is my change out yet?". Updated by whoever
deploys or ships, in the same PR or right after. Dates are UTC.

| Surface | Live version | Since | How it got there | Who can do it |
|---|---|---|---|---|
| **Server** `api.jointracely.com` | main `3b438b3`, **on Railway** (project `protective-serenity`, service `Tracely`, volume at `/data`). Since `24e253d` this brings live JoinTracely #27 and #28 (the `/try` engine, `extension/content.js`) and #29 (the extension's lookups: `verify: true`, `VERIFY_LIMITS`, their own hourly windows). Everything server-side since `0945487` came live with `24e253d` on 2026-10-23: Tracely-app #378/#379, and JoinTracely #10, #13–#16, #18, #19, #22–#25 | 2026-10-24 04:01 (on Railway since 2026-10-23 03:51: DNS moved 03:12, certificate issued 03:51) | Railway builds `server/Dockerfile` from `main` on every merge that touches `server/` or `extension/content.js` (`server/DEPLOY.md`, "Railway"). DNS in Vercel: `api` CNAME `bb08wim7.up.railway.app`, plus TXT `_railway-verify.api`. `healthcheck.sh` green on `3b438b3` (release.commit checked). A fresh database (the Linode's was not copied); Stripe is not configured yet | Merrick (Railway; clicks Deploy when a variable changes) |
| Server — the old Linode | `0945487`, no longer receiving traffic | until 2026-10-23 03:12 | — | Herrick revokes its OpenAI key; Sam removes `/srv/tracely`, the `tracely` user and the vhost |
| **Chrome extension** (Web Store, id `dffmoeebkkghhgcklkbmaibfhgiegmdm`) | **2.21.1** published | early October 2026 (store zip of 10-01) | store zip from `server/scripts/pack-extension.sh` | Sam (publisher account) |
| Chrome extension — store draft | 2.21.18 **submitted from the beta zip — cancel it**; `Tracely-2.21.27-store.zip` is built from main `a71e4aa` and waits in Sam's Downloads | 2026-10-09 | Developer Dashboard | Sam |
| Chrome extension — testers | 2.21.18-beta (Merrick's zip); main is 2.21.27 | 2026-10-04 | `pack-extension.sh --beta` + Load unpacked | either (beta token is in the server's `.env`) |
| **Desktop app** stable | v0.3.102 (main `ed29afc`; **the bridge**: reads updates from `JoinTracely/Tracely` (JoinTracely#1), plus Tracely-app/Tracely#379's pinned search query) | 2026-10-21 06:31 | `npm run ship` passed preflight, bumped (JoinTracely#2) and built, then the publish got the `.env.release` 403; published to `JoinTracely/Tracely` with `npm run release:win` and the gh CLI's token, `TRACELY_ENV=production`. The same three files were copied to a v0.3.102 release on `Tracely-app/Tracely`, which installs on v0.3.101 and older still read (`docs/RELEASING.md`, "The v0.3.102 bridge"). Checked on both repos: latest release v0.3.102, `latest.yml` 0.3.102 with the installer's sha512; the build's `app-update.yml` says `owner: JoinTracely` | Merrick |
| Desktop app preview | `v0.3.102-preview.2` (numbering restarted in `JoinTracely/Tracely`) | 2026-10-21 | `preview.yml` on push. A preview install from before the move reads `Tracely-app`'s preview channel and is never offered these: reinstall it from `JoinTracely/Tracely` Releases | CI |
| **Website** `jointracely.com` | JoinTracely/Tracely-Website main `d82c05e` (#7: checkout paused, so `/order` shows "Opening soon" until Tracely's own Stripe is live) | 2026-10-23 03:04 | Vercel CLI from `git archive origin/main` (the project's Git link is still broken since the org move) | Merrick (Vercel) |

## Not yet deployed / pending

- **Try Tracely** is live at `https://api.jointracely.com/try` (demo pool $2/day, 10 checks / 2 source searches / 2 reviews per visitor; settings `TRACELY_DEMO_*` and `TRACELY_PUBLIC_ORIGIN` in the server `.env`). The website's `/try/` page that frames it, plus the hero/nav/download entry points, is Tracely-app/Tracely-Website#16 — waiting on Merrick to merge and deploy. **Every server deploy must copy `extension/content.js`** (runbook) or `/try` stops working.
- Website (JoinTracely/Tracely-Website) waits on the Vercel reconnect above: #8 is the site rebuild with the pricing copy; #9 the `/privacy` and `/terms` pages (supersedes #7, held for legal review); #10 puts Explain in depth back on Pro once extension 2.21.24 is live.
- Repo PR #297 (launch legal documents) — drafts for legal review, do not merge until read by a lawyer.

## How to update this file

- Deployed the server? Replace the server row: commit, time, backup name.
- Shipped an installer? Replace the desktop row.
- Uploaded or published on the Web Store? Replace the extension rows.
- Everything else here is a pointer; the runbooks are `server/DEPLOY.md` and `docs/RELEASING.md`; `server/scripts/healthcheck.sh` checks the server.

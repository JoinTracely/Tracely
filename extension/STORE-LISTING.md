# The Web Store listing

What to type into each field of the Chrome Web Store Developer Dashboard for
Tracely's listing, `pkaihmliboboiafoodfaoflflcpipcnd`, on Merrick's
developer account. It is still a draft: nothing has been published from it
(2026-10-24). Written 2026-10-21 for the first submission. When a field
changes in the dashboard, change it here too, so the next person submitting
starts from what is live.

Every claim here has to stay true of the code and of `PRIVACY.md`. A listing
that promises more than the extension does is a rejection, and the data
answers are a policy commitment.

## Store listing

**Name** comes from `manifest.json` `name`:
Tracely — live fact-check while you write

**Summary** comes from `manifest.json` `description` (132 characters at most):
Live AI fact-checking as you write. Underlines false or shaky sentences in any text field and suggests fixes with sources.

**Description:**

```
Tracely checks the facts in what you're writing, while you write it.

Turn it on for Google Docs, or for any site where you write, and Tracely reads each sentence a few seconds after you finish it. When a sentence is wrong, it says so and offers a fix: one sentence for one sentence, which you accept or skip.

What the underlines mean
• Red: the sentence is wrong, or doesn't make sense.
• Blue: it needs evidence. Tracely searches for some first, and tells you what it found.
• Amber: the source is missing, or the citation doesn't match.

Sources you can check
Find a source looks for work that backs your sentence and shows you the words it found there, so you can see for yourself. In Google Docs, Cite in doc adds the citation and the Works Cited entry in your document's style (MLA, APA or Chicago), with one Undo.

Made for the kind of writing you're doing
Tracely reads what you're writing (an essay, a lab report, a DBQ, an email) and checks it the way that kind of writing is checked. It stays quiet on writing such as poems and stories, which have no facts to check.

Plans
Starter is free and flags mistakes with their fixes and sources. Student and Pro also suggest evidence that would make your writing stronger, with more source searches each day.

Privacy
Nothing is read until you turn Tracely on for Docs or for a site. The text you check is sent to Tracely's server and on to OpenAI to be judged, and it isn't stored. No account is needed. Read the full policy at https://github.com/JoinTracely/Tracely/blob/main/PRIVACY.md
```

**Category:** Education.
**Language:** English.

**Graphics**, from `Desktop/Tracely store images` (built per the
store-listing-images note):
- Icon: `extension/icons/icon128.png`.
- Screenshots: the five 1280×800 PNGs.
- Small promo tile: 440×280.
- Marquee: 1400×560.

**Official URL:** https://jointracely.com
**Support:** the support email shown on jointracely.com.

## Privacy practices

**Single purpose:**
Tracely checks the facts and citations in what the user is writing, in Google Docs and in text boxes on sites the user turns it on for, and suggests one-sentence fixes and sources for them.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `storage` | Keeps the user's settings, the checks already made for each document (so a sentence isn't sent twice), the optional sign-in session, and the plan's usage shown in Settings. |
| `identity` | Signs the user in with Google (`chrome.identity.launchWebAuthFlow`), which is optional and only needed for the Student and Pro plans. |
| Host `https://api.jointracely.com/*` | Tracely's own server, which checks the text the user is writing and finds sources for it. |
| Host `https://sxifbtelrtbsgnnwnmdf.supabase.co/*` | Tracely's sign-in and account service, which holds the account's email address and plan. |
| Content scripts on all sites | To check the text a user is writing in a text box on any site. Nothing is read from a page until the user turns Tracely on for that site, and Google Docs only after the user turns Tracely on for Docs. |
| Content script in the page on Google Docs | Google Docs draws text onto a canvas, so this script reads where the words are, to place underlines, and makes the edits the user accepts. It never sends anything. |

**Remote code:** No. All of the extension's code ships in the package. The
server answers with data (JSON), never code.

**Data usage.** Tick these, matching `PRIVACY.md`:
- **Personally identifiable information:** the email address, if the user signs in with Google.
- **Authentication information:** the sign-in session.
- **Website content:** the text the user is checking.
- **Personal communications:** tick it too. A user who turns Tracely on for a mail or chat site sends the message they are writing to be checked.

Leave the rest unticked: health, financial and payment information (payment
happens on jointracely.com through Stripe, never in the extension), location,
web history, and user activity (no keystroke or click logging).

**Certify all three:** not sold to third parties; not used for purposes
unrelated to the single purpose; not used for creditworthiness or lending.

**Privacy policy URL:** https://github.com/JoinTracely/Tracely/blob/main/PRIVACY.md

## Distribution

Public, all regions.

## Notes for the reviewer (Test instructions)

```
This listing replaces dffmoeebkkghhgcklkbmaibfhgiegmdm, which was published from a former co-developer's account. It is the same product, moved to its owner's own developer account; the old listing is no longer updated.

No account is needed to test. Open any Google Doc, click the Tracely button at the bottom right of the page and turn Tracely on for Docs, then type "The Eiffel Tower is in Berlin." Within a few seconds it is underlined in red with a fix. In a text box on any other site, turn Tracely on for that site from the same button.
```

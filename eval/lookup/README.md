# eval/lookup/ — does "look it up before flagging it" flag the right sentences

Work in progress (see the draft PR). A labelled set of student-style essays,
a runner that sends each one through production the way the extension's
lookup-first flow does (`/api/check`, then `/api/sources` with
`verify: true` for the sentences it would look up), and a free scorer.

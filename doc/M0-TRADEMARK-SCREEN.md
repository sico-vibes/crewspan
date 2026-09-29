# M0 trademark screen — "Crewspan" name and mark

Status: M0 evidence artifact (`CREW-10`, deliverable 3). Scope authority:
[`doc/plans/2026-09-24-crewspan-e2e-v3.md`](plans/2026-09-24-crewspan-e2e-v3.md)
§3.4 (the "Crewspan" trademark screen) and §15.

**This is not legal advice and draws no legal conclusion.** It is a light
knock-out screen of the name as it stands today, recorded so the Board can
commission a proper clearance search and decide. Any trademark or branding call
is escalated to the Board (`CREW-10` constraints).

Screen date: 2026-09-29. Screeners: Crewspan QA & Release (agent).

## 1. What "Crewspan" is today

- "Crewspan" is the product name used in this fork's own plan and contract
  corpus ([`doc/CREWSPAN-PRODUCT-CONTRACT.md`](CREWSPAN-PRODUCT-CONTRACT.md),
  `doc/plans/2026-09-24-*`). It is **not** a registered mark claimed anywhere in
  the repository, and no `™`/`®` is asserted for it.
- At the pinned baseline the tracked tree mentioned `crewspan` **0** times;
  Crewspan references are working-tree additions, not upstream content
  ([`doc/FORK-BOUNDARY.md`](FORK-BOUNDARY.md) §1).
- The user-facing product is still branded **Paperclip** throughout: browser
  title and manifest, icons, in-app wordmark, ~182 distinct UI strings, docs and
  CLI copy (`doc/FORK-BOUNDARY.md` §3.1). The current UI shows "Paperclip", not
  "Crewspan".
- `LICENSE` is MIT, "Copyright (c) 2025 Paperclip AI". MIT grants a copyright
  licence to the *software*; it grants **no** trademark rights. Reusing the
  Paperclip name/marks in a shipped product is a separate question from the code
  licence ([`LICENSE`](../LICENSE)).

## 2. Method (and its limits)

1. Repository inventory of name/mark usage (paths above; `doc/FORK-BOUNDARY.md`
   §3.1, §3.3).
2. A light open-web knock-out search on 2026-09-29 for `"Crewspan"` and
   `Crewspan trademark company name`.
3. **Not done:** no USPTO/EUIPO/UKIPO registry search, no formal clearance
   search, no counsel review, no domain/trademark watch. Results below are
   indicative only.

## 3. Screen results

No **exact** web match for the word mark "Crewspan" was found in this light
search, and no registry record was surfaced. The search did surface near
neighbours worth flagging:

| Hit | What it is | Why it is flagged |
|---|---|---|
| **CrewSnap** (`crewsnap.app`, `crewsnap.com`, "Crewsnap Systems Inc.") | Workforce/resource-scheduling and staffing SaaS; sites assert `CREWSNAP®` is a registered trademark of Crewsnap Systems Inc. | Closest conceptual and phonetic neighbour, in an adjacent B2B software/workforce category. A registered mark in an overlapping class is the main confusion risk. |
| **CREOSPAN PRIVATE LIMITED** | Indian private company (Pune, incorporated 2022), marble/granite supplier | Name similarity only; appears to be a different industry/class. |
| **CrewSpine** (`crewspine.app`), **Crewscope** (`crewscope.com`) | Other "Crew*" software/health products | Adjacent naming space, different strings. |
| **"CrewSpan"** (informal, Houston workforce business) | Social post using "CrewSpan"; `crewspan.shop` appears to host unrelated job listings | Unregistered informal use; shows the name is in use by others without a clearance check. |

## 4. Risks flagged for the Board

1. **No clearance search has been performed.** This screen is not a substitute
   for a counsel-led search in the target classes (software / SaaS / workflow),
   the relevant jurisdictions, and for the intended logo mark.
2. **Potential confusion with CrewSnap**, whose site claims a registered mark in
   an adjacent workforce-software space. This is the highest-signal finding and
   warrants counsel review.
3. **Inherited Paperclip marks.** The shipped product still presents Paperclip
   branding, which the MIT licence does not license as a trademark. A public
   Crewspan release should decide the brand-migration sequence before shipping
   (`doc/FORK-BOUNDARY.md` §6.4, §8).
4. **Domain / package availability unverified.** `crewspan.shop` exists and is
   unrelated; `crewspan` domain and npm/package availability were not checked.
5. **Unregistered-name risk.** Until a mark is registered, protection depends on
   common-law rights and the chosen jurisdiction; nothing in this repository
   establishes any rights in the "Crewspan" name.

## 5. For the Board

- Commission a proper trademark clearance search plus a counsel opinion before
  the name is used publicly and before any rebrand effort is funded.
- Decide the mark's scope (word mark and/or logo), classes, and jurisdictions.
- Sequence the Tier-A brand migration ([`doc/FORK-BOUNDARY.md`](FORK-BOUNDARY.md)
  §8) so Paperclip marks are not shipped indefinitely in a Crewspan product.
- Engineering takes no further action on this finding until the Board rules.

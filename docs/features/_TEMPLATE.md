# Feature: <name>

**Status:** draft | designed | in-progress | in-review | done
**Owner sections:** PM → §1–2 · UX → §2.5 · Architect → §3 · Backend/Frontend → §4 · QA → §5

---

## 1. Story (PM)
As the farm owner, I want … so that …

**Why now / spec reference:** (link to docs/egg-farm-app-*.md section)

## 2. Acceptance criteria (PM)
Testable, numbered. Include empty/error states and mobile.
- [ ] AC1 —
- [ ] AC2 —

**Out of scope:**
**Open questions for owner:**

## 2.5 UX design (UX Designer)
_Skip for features with no UI._
- **Flow:** entry point → done; main-path tap count
- **Layouts:** mobile (~375px) and desktop wireframes
- **States:** default / loading / empty / validation error / server error / success
- **Copy:** labels, buttons, toasts, empty & error messages
- **Data the UI needs:** (for the architect)
- **Decisions for owner:**

## 3. Technical design (Architect)
- **Data:** tables/columns/constraints/views touched (migrations needed)
- **RLS:** policies added/changed
- **Server API:** routes, method, request/response shapes (egg counts, never tenant_id)
- **Frontend:** pages/components, which Nuxt UI components, shared helpers
- **Invariants at risk:** which CLAUDE.md rules this feature touches and how they're protected
- **Tasks:** ordered checklist split into `[BE]` / `[FE]`
- **Decisions:** anything non-obvious and why

## 4. Implementation notes (Devs)
- [BE] what was built, files, deviations from design (and why)
- [FE] what was built, files, deviations from design (and why)

## 5. QA report (QA)
**Verdict:** PASS | FAIL
- AC results (AC1 ✅/❌ + evidence)
- Invariant/security findings (Blocking / Should fix / Notes) with file:line
- Tests run + output summary

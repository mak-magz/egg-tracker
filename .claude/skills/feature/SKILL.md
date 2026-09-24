---
name: feature
description: Run the dev-team pipeline for a feature — PM → UX → Architect → Backend/Frontend → QA — through one feature doc in docs/features/, pausing for the user's approval at each handoff. Use when the user runs /feature, or asks to build a new feature "with the team". Pass a feature idea to start a new one, or an existing doc name/number to resume.
argument-hint: <feature idea | NN-feature-name to resume>
disable-model-invocation: true
---

# /feature: run the dev team pipeline

Input: `$ARGUMENTS`

You're the team lead. You run the subagents in order and each fills its section of one feature doc (`docs/features/NN-<name>.md`, created from `_TEMPLATE.md`). Subagents can't talk to each other, so give each one the doc path and anything the user decided at the last checkpoint.

## 0. Start or resume
- If `$ARGUMENTS` matches an existing doc in `docs/features/`, read it and resume from the step its **Status** implies: `draft` → UX, `designed` → build, `in-progress` → build (remaining tasks) or QA, `in-review` → QA, `done` → tell the user it's done and stop.
- Otherwise, it's a new feature idea. Go to step 1.
- If no app scaffold exists yet (no `package.json`) and this feature isn't the scaffold itself, tell the user the scaffold feature has to come first and offer to run it instead.

## 1. PM
Run `product-manager` with the idea. It writes §1–2.
**Checkpoint:** show the user the story, the acceptance criteria (condensed), and any open owner questions. Put the questions to the user with AskUserQuestion when they have clear options. Write the answers into the doc. Wait for approval of the ACs before going on.

## 2. UX (skip if the feature has no UI)
Run `ux-designer` on the doc. It writes §2.5.
**Checkpoint:** show the mobile wireframe, the main-path tap count, and any decisions for the owner. Wait for approval.

## 3. Architect
Run `architect` on the doc. It writes §3.
**Checkpoint:** show the data changes, the API routes, the task list, and any decisions that need the user's call. Wait for approval. This is the last cheap point to change course.

## 4. Build
- Run `backend-dev` for the `[BE]` tasks. When the §3 API contract is fixed and the FE tasks don't depend on BE output, run `frontend-dev` for the `[FE]` tasks **at the same time** (both calls in one message). Otherwise, run it after BE finishes.
- If the build touches tooling, CI, env, or deploy config, run `devops` for those parts.
- If a dev reports the design is ambiguous or wrong, **stop** and bring it to the user (or send it back to `architect`). Don't let the devs improvise the design.
- Set Status to `in-review` when all tasks are ticked.

## 5. QA
Run `qa-reviewer` on the doc. It writes §5 with PASS/FAIL.
- **FAIL:** send each Blocking and Should-fix finding to the dev who owns it (backend-dev or frontend-dev) with the finding text, then run QA again. After **2** failed rounds, stop and bring the remaining findings to the user.
- **PASS:** go on.

If this feature changed auth, middleware, RLS helpers, or the repository layer, also run `security-auditor` and bring any Critical/High findings to the user before calling the feature done.

## 6. Wrap up
Summarize for the user: the feature, the files changed, the QA verdict, the tests run, and any follow-ups. Offer to commit. Don't commit without a yes, and never push or deploy.

## Rules
- The checkpoints are required unless the user says to skip them (e.g. "run it straight through"). Even then, stop for open owner questions and for design decisions.
- Relay each agent's results in a short summary. The doc holds the detail, so don't paste whole sections.
- Report failures and skipped steps plainly.

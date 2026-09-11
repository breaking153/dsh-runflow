## Context

See proposal.md. Existing application styling remains a graphite Blueprint workbench. The current mark duplicates a detailed play/branch symbol in React, favicon and documentation; its detail is weak at sidebar sizes. Existing screenshots include obsolete editor surfaces.

## Goals / Non-Goals

**Goals:** Recognizable small-size identity, truthful current documentation, four purposeful real-Host screenshots, reusable demos for common workflows, real DSH Web acceptance checks, and a concise architecture explanation.

**Non-Goals:** New node behavior, a replacement application theme, new libraries, external services, commits or user Host restarts.

## Decisions

- Ruling: use a simplified pair of input paths converging into a forward arrow — the mark describes RunFlow's execution composition and multi-trigger feature — preserve DSH blue and monochrome compatibility at small sizes; a decorative illustration or raster logo would be less legible.
- Ruling: update the shared React mark and equivalent standalone SVG geometry together — all plugin entry points already reuse RunFlowMark — inconsistent copies would fragment identity, so verify all variants side by side.
- Ruling: capture a small HTTP processing demo using the real isolated DSH Host and loopback endpoint — shows current ports, promotion and execution evidence without model credentials — label demo data and clean the task workflow/processes afterward.
- Ruling: edit only bounded presentation files in the current checkout — prior Blueprint implementation is intentionally uncommitted and already integrated — preserve it and verify no unrelated behavior changed.
- Ruling: omit delta specs for this documentation/demo change — RunFlow engine and public contracts are unchanged — retain OpenSpec tasks and evidence without inventing new engine requirements. Correct defects in the shipped demo fixture when acceptance review finds them.

## Demo acceptance and corrections

Exercise data processing, both condition outcomes, two Trigger inputs into shared HTTP, HTTP 503 and recovery, and bounded loop interrupt/resume with both boolean values through DSH Web. UI actions start and resume runs; read-only Host records and durable Storage files provide assertions. The HTTP fixture is loopback-only, requires no credentials and returns 400 for malformed request targets instead of exiting. Correct documentation paths and duplicate-ID loading guidance against actual repository behavior.

## Risks / Trade-offs

- Stale or staged screenshots → rebuild the linked plugin first, perform actual UI execution, keep raw screenshots and provenance.
- Documentation overclaims → check source/CLI behavior, preserve Alpha limitations and distinguish recommendations from enforced policy.
- Small icon detail → inspect 16/20/32px plus light/dark documentation rendering.
- Existing workspace edits → limit owned files; no reset, commit, broad formatting or production restart.

# RunFlow Frontend v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor RunFlow into an AI-review-first frontend with isolated state responsibilities and a backend-v2-ready Host gateway.

**Architecture:** Preserve React Flow and existing graph helpers, compose four Zustand slices behind the current `useFlowStore` facade, and route all Host I/O through `RunFlowGatewayV2`. Reorganize the inspector around Review, Parameters, and Execution evidence without changing the DSH blue visual identity.

**Tech Stack:** TypeScript 5.9, React 18, Zustand 5, React Flow 12, Vitest 4, jsdom, Vite 6.

**Spec:** `docs/superpowers/specs/2026-09-02-runflow-frontend-v2-design.md`

## Global Constraints

- Frontend v2 is completed before backend v2.
- Existing graph interactions and real Host execution remain functional.
- No migration or publish workflow is added.
- DSH locale, DSH blue identity, keyboard access, and responsive behavior remain first-class.
- New production behavior follows failing-test-first TDD.

---

### Task 1: Versioned frontend gateway

**Files:**
- Create: `src/client/application/runflow-gateway.ts`
- Modify: `src/client/runtime.ts`
- Test: `tests/runflow-gateway.client.spec.ts`

**Interfaces:**
- Produces: `RunFlowGatewayV2`, `RunFlowClientContext`, `getRunFlowGateway()`, and the Host Remote adapter.
- Consumes: existing `FlowRuntimeClient` behavior and RunFlow contracts.

- [x] Write a failing test that installs a runtime client, calls gateway v2 workflow and execution methods, and asserts the exact mapped arguments and offline error.
- [ ] Run `pnpm vitest run tests/runflow-gateway.client.spec.ts` and confirm the gateway module is missing.
- [x] Implement the typed gateway and Host v2 adapter.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: AI workflow review domain

**Files:**
- Create: `src/client/application/workflow-review.ts`
- Test: `tests/workflow-review.client.spec.ts`

**Interfaces:**
- Produces: `WorkflowReviewSession`, `WorkflowChange`, `createWorkflowReview()`, and `markReviewEdited()`.
- Consumes: immutable `WorkflowDefinition` values.

- [ ] Write failing table-driven tests for node, edge, metadata, and configuration changes plus stale base revisions.
- [ ] Run `pnpm vitest run tests/workflow-review.client.spec.ts` and confirm the imports fail.
- [ ] Implement deterministic diff ordering and review state transitions.
- [ ] Re-run the focused tests and confirm they pass.

### Task 3: Composed store slices

**Files:**
- Create: `src/client/state/store-types.ts`
- Create: `src/client/state/review-slice.ts`
- Create: `src/client/state/selectors.ts`
- Modify: `src/client/store.ts`
- Test: `tests/flow-store-slices.client.spec.ts`

**Interfaces:**
- Produces: review actions on `FlowState`, narrow selectors, and the existing `useFlowStore` facade.
- Consumes: Task 2 review domain and existing graph/session actions.

- [ ] Write failing tests for staging, editing, accepting, and clearing reviews without corrupting selection or run evidence.
- [ ] Run the focused store test and verify expected missing actions.
- [ ] Add the review slice and selectors, then route every graph mutation through one `markEditorChanged` transition.
- [ ] Re-run focused and existing graph-store tests.

### Task 4: Contextual review-first inspector

**Files:**
- Create: `src/client/InspectorPanel.tsx`
- Create: `src/client/ReviewPanel.tsx`
- Modify: `src/client/Panels.tsx`
- Modify: `src/client/App.tsx`
- Test: `tests/review-inspector.client.spec.tsx`

**Interfaces:**
- Produces: inspector tabs `review`, `parameters`, and `execution`; review acceptance actions; node-context routing.
- Consumes: Task 3 selectors and existing property form fields.

- [ ] Write failing component tests for default-tab priority, no generic output on unexecuted nodes, acceptance, and announced errors.
- [ ] Run the focused component test and verify failures describe absent UI behavior.
- [ ] Implement the new inspector and reuse current schema-specific parameter editors.
- [ ] Re-run focused tests and existing UI component tests.

### Task 5: Resizable workspace shell and visual hierarchy

**Files:**
- Create: `src/client/use-resizable-panel.ts`
- Modify: `src/client/App.tsx`
- Modify: `src/client/WorkflowSidebar.tsx`
- Modify: `src/client/runflow-v2-styles.ts`
- Modify: `src/client/responsive-styles.ts`
- Test: `tests/workspace-shell.client.spec.tsx`

**Interfaces:**
- Produces: keyboard and pointer resizable inspector, responsive overlay behavior, compact header hierarchy.
- Consumes: Task 4 inspector and existing window shell.

- [ ] Write failing tests for separator semantics, arrow-key resizing, min/max clamping, and compact workspace landmarks.
- [ ] Run the focused shell test and verify the missing behavior.
- [ ] Implement the panel hook and layout, preserving canvas pointer/keyboard interactions.
- [ ] Re-run focused tests plus responsive layout tests.

### Task 6: Verification and visual evidence

**Files:**
- Modify only files implicated by verification failures.
- Capture: `.impeccable/review/desktop.png`
- Capture: `.impeccable/review/tablet.png`
- Capture: `.impeccable/review/mobile.png`

**Interfaces:**
- Consumes: completed frontend v2.
- Produces: test, build, accessibility-detector, and screenshot evidence.

- [ ] Run `pnpm run typecheck`, `pnpm run test`, and `pnpm run build` independently and fix root causes only.
- [ ] Run the Impeccable detector once over changed client targets and fix mechanical findings in one batch.
- [ ] Capture and inspect 1440, 1024, 768, and 375 pixel layouts in one browser pass.
- [ ] Apply one bounded visual fix batch if required, rebuild, and capture a final confirmation set.
- [ ] Provide the validated screenshots to the user before beginning backend v2.

# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

DSH users who ask an AI Agent to assemble executable workflows, then inspect, adjust, run, and debug the result inside the existing DeepSeek Harness interface.

## Product Purpose

DSH RunFlow turns DSH Agent, tool, script, and Cordis node capabilities into persistent visual workflows. New workflows use a state graph with Blueprint semantics: flow ports control effectful operations, while pure nodes supply data on demand. Bounded loops, shared state and explicit pause/resume support repeatable tasks. AI can draft a workflow; users can inspect and adjust it before execution. Review is a recommended working practice, not an automatic approval gate for every saved definition.

## Positioning

RunFlow is a workflow surface inside DSH: child Agents reuse live Harness providers, JavaScript executes through the parent Agent's `run_code`, and trusted Node/Script Cordis plugins receive the Host `ctx` directly. Developers and automation users can inspect execution order, parameter sources and saved results in the same workspace.

## Operating Context

- RunFlow opens from the DSH sidebar and defaults to a maximized workspace.
- Users manage multiple workflows, inspect execution history, edit typed node connections, and debug node outputs and artifacts.
- Creation-mode Agents can create and test temporary workflows, Node providers, and Script providers before their files are finalized.
- Normal live Agents can inspect and run existing workflows through the plugin-owned `runflow` tool. Authoring remains confined to the configured creation preset.
- Authenticated webhooks use the existing Host web service and an explicitly enabled live Agent binding; external JSON input cannot select execution authority.
- Workflow data and run outputs live under `~/.dsh_agent_workflow`, outside the DSH project directory.

## Capabilities and Constraints

- React 18, Zustand, and React Flow are the current frontend stack.
- The editor must support typed ports, multi-output nodes, drag-to-connect creation, marquee selection, keyboard editing, groups, reroutes, subflows, templates, and source editing.
- Saved workflows are durable files and autosave after meaningful edits; there is no publish lifecycle.
- The frontend follows the active DSH Chinese or English locale.
- Frontend v2 must depend on a versioned Host gateway so backend v2 can replace the transport without restructuring UI features.
- New workflows default to `execution.mode: 'state-graph'`, `execution.semantics: 'blueprint'` and `maxSteps: 100`. Definitions without execution settings remain legacy DAGs; missing semantics retain the existing runtime behavior. Earlier development formats still have no migration layer.
- Typed text, number, boolean and JSON values and `state.get` are pure inputs. Properties can be promoted to typed data ports with saved fallback values. Multiple Trigger calls can share a flow input; explicit Join nodes coordinate branches within one call.
- State graphs use JSON state, fixed reducers, bounded steps, and explicit checkpoints. They do not claim LangGraph API compatibility, arbitrary crash recovery, or exactly-once side effects.
- Runtime tools, skills, and webhook routes follow plugin lifecycle and recheck availability. Disabling the plugin does not delete user-maintained skill files.
- Webhook bindings expire with the Host/plugin or live owner. There is no durable delivery queue, retry, or deduplication guarantee.

## Brand Commitments

The product name is DSH RunFlow. Its mark uses two input paths converging into a forward arrow, with the same geometry in the shared React icon, favicon and documentation SVG. Preserve the DSH blue family, graphite workbench, restrained developer-tool styling and familiar workflow-editor interaction patterns. n8n, ComfyUI and Unreal Engine Blueprints inform interaction patterns without dictating a copied visual skin.

## Evidence on Hand

The repository contains a runnable DSH client integration, real Host Remote calls, executable built-in nodes, hot-loaded Node/Script providers, automated client tests, and browser screenshots under `docs/assets/evidence/playwright/`. Four [credential-free demos](docs/DEMOS.md) cover data processing, conditions, shared HTTP and loop/approval flows; their actual DSH Web results are recorded in the [presentation verification report](docs/PRESENTATION_REFRESH.md). No production customer claims or performance benchmarks are available and none should be invented.

## Product Principles

1. AI drafts; humans retain review authority.
2. The graph is the primary working surface, while configuration and evidence stay contextual.
3. Every visible run action executes through the real DSH Host or clearly states why it cannot.
4. Typed contracts and durable files prevent silent workflow corruption.
5. Advanced power remains discoverable without crowding the default path.

## Accessibility & Inclusion

All editor functions must have visible keyboard focus, meaningful accessible names, non-color status cues, reduced-motion behavior, and usable responsive layouts at 375, 768, 1024, and 1440 CSS pixels.

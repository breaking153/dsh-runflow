# Workflow Node Observability — Page Overrides

> Project: DSH RunFlow
> Page type: developer workflow IDE
> These rules override the generated master whenever the workflow editor is implemented or reviewed.

## Layout

- Keep a persistent three-region editor on desktop: 280px Node Library, fluid graph canvas, 320px Inspector.
- The top toolbar stays compact; execution history is a bottom dock and must not compete with the canvas.
- Node Details uses a centered, focus-trapped dialog with tabs: Overview, Input, Output, Logs, Files.
- On mobile, Node Library and Inspector are mutually exclusive drawers; Details becomes a near-full-screen sheet.
- Never use horizontal-scroll storytelling, landing-page sections, floating marketing CTAs, or large hero typography in the editor.

## Typed ports

- Align input ports left and output ports right; keep each hit target at least 24px with a visible 10–12px handle.
- Encode type with label plus restrained color; color must never be the only signal.
- Delay hover preview by 500ms to avoid flicker while moving across the graph.
- Preview is capped to a short excerpt and offers an explicit expand action. Keyboard focus reveals the same preview immediately.
- Mobile must not require hover; tapping the port or node opens Details.

## Execution observability

- Use status icon + text + duration. Errors receive the highest visual priority without hiding successful outputs.
- Show the resolved execution output directory near the run summary.
- Separate final node artifacts from intermediate debug artifacts in both language and file paths.
- Long JSON belongs in a scrollable monospace panel; summaries remain scannable.

## Interaction and accessibility

- All icon-only controls need accessible names and tooltips.
- Preserve visible focus rings, Escape close, focus trap/restore, and 44px mobile targets.
- Avoid layout-shifting hover transforms. Respect `prefers-reduced-motion`.
- Meet WCAG AA contrast and never rely on status color alone.
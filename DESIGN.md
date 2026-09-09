# RunFlow design system

RunFlow is an operating workspace inside DSH. Preserve the existing graph-first interface and the product facts in PRODUCT.md.

## Direction

Use a compact DSH blue workbench: a persistent workflow rail, typed graph canvas, contextual inspector and execution evidence. A tile dashboard was rejected because it reduces useful canvas space; a terminal-only surface was rejected because it makes graph review less discoverable. Neither alternative changes the product's scope.

## Visual language

- Reuse the existing RunFlow SVG mark and Lucide icons. Existing project assets are retained; no new external artwork, fonts or component library is introduced.
- Use the established `--rf-canvas`, `--rf-surface`, `--rf-line`, `--rf-ink`, `--rf-muted`, and `--rf-accent` CSS variables, backed by DSH Host theme aliases. Canvas geometry is meaningful graph content.
- Use the existing system sans stack for controls and prose, monospace for code and identifiers. Hierarchy comes from size, weight and spacing; errors and execution states include words or icons.
- Preserve the existing compact control rhythm and panel resizing bounds. Dense desktop chrome must still expose visible focus and fit supported viewports; narrow layouts prioritize canvas and contextual panels.
- Use subtle borders and restrained elevation to separate overlays from the graph. Keep loading, empty, disabled, error and selected states distinguishable without color alone.

## Interaction rules

- The Host connection state and save failure state must remain visible and truthful.
- Treat browser storage as best-effort preference/cache storage. Preserve active edits when a remote save is delayed or fails.
- Dialogs have accessible names, contained keyboard focus, unhandled Escape dismissal and trigger focus restoration. Shortcut recording consumes Escape before dialog dismissal.
- Respect reduced motion. Do not remove useful status text or keyboard focus to simplify animation.
- Keep all supported workflows and editing capabilities available. Templates and command search are contextual tools, not a replacement home page.

## Verification

Inspect desktop and narrow screens in a single batch after implementation (375, 768, 1024, 1440 CSS pixels), then one correction pass if needed. Measure real overflow and focus behavior. Document limitations of the standalone preview and do not claim complete WCAG or real-Host certification from component tests.

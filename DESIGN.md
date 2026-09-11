# RunFlow design system

RunFlow is an operating workspace inside DSH. Preserve the existing graph-first interface and the product facts in PRODUCT.md.

## Direction

Use a graphite workbench inspired by Unreal Engine Blueprint graph editing, with DSH blue selection and restrained category headers. Keep the persistent workflow rail, typed graph canvas, contextual inspector and execution evidence. The graph remains the main working surface inside DSH.

The previous dense pale editor did not meet the requested visual direction. A glowing cinematic treatment would compete with port labels and execution evidence, so it was also rejected. Blueprint is an interaction and shape reference; do not copy Unreal assets or add decorative animation.

## Visual language

- RunFlow's mark uses two rounded input paths converging into a forward arrow, reflecting shared executable logic. Use the same geometry in `RunFlowLogo.tsx`, the favicon and documentation SVGs; small in-app marks inherit `currentColor`, while standalone tiles use DSH blue `#356AC3`. Retain Lucide for action and node icons. No external artwork, fonts or component library is introduced.
- Keep the established CSS variable names while defining the graph's scoped graphite palette in `src/client/blueprint-styles.ts`: canvas `#1b2028`, surface `#252b34`, border `#3a424f`, text `#e2e7ee`, muted text `#a1acbd`, primary action `#4279cb` and focus `#9dc5ff`. DSH blue remains the selection and action cue; the surrounding Host keeps its own styling.
- Use the existing system sans stack for controls and prose, monospace for code and identifiers. Hierarchy comes from size, weight and spacing; errors and execution states include words or icons.
- Execution `flow` pins have pointed geometry; data pins are circular and retain visible type labels. Pin and wire colors come from `src/client/port-presentation.ts`, with shape and text carrying meaning alongside color.
- Use a fixed 28px transparent pin target with a separate visual glyph. Hover and drag must not move its center, scale the hit area or animate node coordinates. Temporary connection paths have `fill: none`.
- Node bodies, pins and graph structural rules have one owner in `blueprint-styles.ts`; remove superseded node selectors instead of adding more competing compact overrides. Use system fonts without a Google Fonts request or new font dependency.
- Preserve the existing compact control rhythm and panel resizing bounds. Dense desktop chrome must still expose visible focus and fit supported viewports; narrow layouts prioritize canvas and contextual panels.
- Use subtle borders and restrained elevation to separate overlays from the graph. Keep loading, empty, disabled, error and selected states distinguishable without color alone.

## Interaction rules

- Show one general Host connection indicator and one set of zoom controls. Save failures and connection-dependent settings may keep their specific explanations; do not repeat a general “Host connected” banner.
- Dragging nodes, dragging wires and active marquee selection must preserve canvas bounds and inspector geometry. Explicit node clicks or keyboard selection may open the inspector. Completed group resize persists its dimensions and supports one-step undo/redo.
- Frontend connection preview and Host execution use the same type policy: `flow` connects only to `flow`; known data connects to the same type or an explicit `any` data input; an `any` output connects only to `any`.
- Invalid target pins show a red wire and a localized reason immediately. Release adds no edge and retains accessible feedback. Reverse drags normalize output to input; releasing on empty canvas may open the compatible-node chooser.
- Keep mode-specific graph rules: DAG rejects cycles and occupied single-input ports; state graphs retain bounded cycles and message-based convergence. Do not turn shared type validation into a different scheduler.
- Treat browser storage as best-effort preference/cache storage. Preserve active edits when a remote save is delayed or fails.
- Dialogs have accessible names, contained keyboard focus, unhandled Escape dismissal and trigger focus restoration. Shortcut recording consumes Escape before dialog dismissal.
- Respect reduced motion. Do not remove useful status text or keyboard focus to simplify animation.
- Keep all supported workflows and editing capabilities available. Templates and command search are contextual tools, not a replacement home page.

## Verification

Inspect desktop and narrow screens after implementation (375, 768, 1024, 1440 CSS pixels). Measure canvas bounds throughout a drag, pin centers before and after hover, invalid-wire feedback, group resize/undo, overflow and focus. Report final evidence in [the Blueprint UI report](docs/BLUEPRINT_UI_REPORT.md). Document limitations of the standalone preview and do not claim complete WCAG, production performance or real-Host certification from component tests.

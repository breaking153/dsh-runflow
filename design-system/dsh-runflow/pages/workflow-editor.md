# Workflow Editor Page Overrides

> **Project:** DSH RunFlow
> **Page:** Visual workflow editor
> **Priority:** Operational clarity over landing-page conversion patterns

## Interaction model

1. Add a node from the left library by click or drag.
2. The new/selected node becomes active and its Inspector opens on compact screens.
3. Configure node fields in the right Inspector; edits immediately mark the workflow dirty.
4. Save persists a local draft and exposes failure state; Preview never claims to be a Host execution.
5. Preview results appear in a collapsible dock without covering primary controls.

## Layout

- Desktop: fixed three-column application shell: 270px library, fluid canvas, 318px Inspector.
- Tablet: canvas remains primary; Inspector becomes an overlay panel.
- Mobile: two-row action bar; library and Inspector are mutually exclusive drawers with a dismissible scrim.
- Never use a horizontal-scroll journey, landing-page sections, or decorative content tracks in the editor.
- Keep the canvas free of permanent overlays except navigation, zoom controls, and the execution dock.

## Feedback and state

- Use green only for primary Run/Success signals; amber for unsaved state; red for failures.
- Disabled actions must remain visible with reduced opacity and a non-interactive cursor.
- Hover/focus transitions stay within 150–200ms and must not move layout.
- Show explicit empty, loading, success, error, and running states with text plus icons.

## Accessibility

- Modal editor traps focus and returns focus to its launcher when closed.
- Compact drawers expose `aria-expanded`, `aria-controls`, close buttons, scrim dismissal, and Escape dismissal.
- All fields keep visible labels; numeric fields request a numeric mobile keyboard.
- Maintain the skip link, visible focus rings, semantic header/main/aside regions, and reduced-motion behavior.
- Minimum touch target is 40px; prefer 44px where space permits.

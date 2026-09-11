# Blueprint node UI verification

Scope: property Promote/Restore, node execution/data lanes, pure value presentation, call counts, workflow navigation and the actual DSH inspector. This is a focused review of the changed UI, not a full accessibility certification of DSH.

## Evidence

The actual DSH 0.1.5-rc.1 plugin was inspected after each functional slice. Screenshots are in the primary checkout's `docs/assets/evidence/playwright/blueprint-phase*.png`; private runtime fixtures are excluded from source control.

- Property pins were created with adjacent controls, connected by dragging, restored, undone and persisted across a browser reload.
- Two Trigger flow wires entered one operation. Execution evidence showed two separate calls and the node footer displayed “已调用 2 次”.
- HTTP completion was connected to Storage in the browser; the real run completed HTTP, Storage and Continue twice. Pure text/JSON inputs supplied each HTTP call.
- Trigger, Action and Pure labels supplement color. Execution pins occupy a separate row above data pins; pure constants use compact cards with value previews.
- Keyboard: click URL field → Shift+Tab focused “断开并还原 · URL”, with a visible 2px focus outline. Space removed its pin; Ctrl+Z restored the pin and connected source.
- Inspector/title contrast was corrected and visually rechecked. Measured title foreground/background: `rgb(226,231,239)` and `rgb(29,35,45)`.
- Actual inspector screenshots at 375×812, 768×900, 1024×768 and 1440×900. At 375px the document scroll width was exactly 375px; all four Promote/Restore controls remained inside the viewport. The inspector scrolls to lower fields.
- Fresh browser console: zero errors and zero warnings. The one informational log is not a failure. Disconnect messages from the deliberately restarted previous Host are excluded from this fresh page check.
- Impeccable's bundled static detector returned `[]` for the changed PropertyField, property-port helper, WorkflowNode and Blueprint styles. This result supplements visual inspection; it does not prove accessibility or design quality.

## Review notes

The graphite palette, existing icons, pointed flow pins and circular typed data pins remain consistent with DESIGN.md. No runtime UI dependency or image asset was added. Value fallback and source information remain editable and visible. Reduced-motion rules retain meaningful state indicators while removing affected transitions.

Real inspection found and resolved two layout issues: initial workflow fitting could run before all nodes were measured, and the selection toolbar could cover narrow inspector tabs. The final main-checkout build waits for node measurement and viewport initialization, and places the narrow toolbar below the inspector. Actual DSH rechecks confirmed all seven nodes inside the canvas on first entry and unobstructed tabs at 375px/768px. See `blueprint-final-autofit.png`, `blueprint-final-375.png` and `blueprint-final-768.png`.

## Assessment

| Dimension | Score / 4 | Evidence and limit |
| --- | --- | --- |
| Accessibility | 3 | Named controls, keyboard restoration/undo and visible focus verified; no whole-Host WCAG certification |
| Performance | 3 | Memoized node rows, bounded previews, existing store selectors, split preview bundle; no large-graph load benchmark |
| Responsive layout | 3 | Inspector usable at all four widths; final toolbar/initial-fit rechecks passed |
| Theming | 4 | Existing tokens and node color meanings preserved; inspector title contrast fixed |
| Implementation integrity | 4 | Shared declared properties and effective pins, live Host execution, no fabricated results; detector findings none |
| Total | 17 / 20 | Good; no unresolved actionable finding in the changed interaction path |

Desktop graph editing remains the primary interaction. Existing compact pin targets and mouse-oriented wire dragging are not claimed to be fully optimized for touch-only editing.

## Context and direction
The runnable baseline is commit e7e8dd5. Chromium reproduced canvas width changing from 1188 to 828 during node drag. The port handle receives a 28px transparent hit area in one style layer, then a 12px filled circle in another while retaining its pseudo-element. The preview has duplicate Host connection labels and duplicate zoom controls.

Ruling: Use a graphite Blueprint workbench with DSH blue selection, pointed flow pins and color-coded data pins — explicitly requested by the user and appropriate for graph inspection — the graph remains a distinct operating surface inside the Host.

Alternatives considered: retain the dense pale editor (does not answer visual rejection); full cinematic or glowing Blueprint skin (reduces readability and adds irrelevant motion); graphite workbench with restrained category headers (selected). Keep product facts and existing SVG/Lucide assets; no new font or animation dependency.

## Engineering
Ruling: Freeze inspector geometry across pointer gestures and separate inspecting from dragging — pointer selection must not resize its coordinate space — explicit click/keyboard selection still exposes parameters.

Ruling: One shared compatibility function for client and engine, with flow separated from data and explicit wildcard data semantics — visual denial and executable validation must agree — previously loose connections require clear validation instead of implicit casts.

Ruling: Validate during wire preview and once on commit — show a red wire and localized reason before release; invalid release leaves the graph untouched — no generic creator popover on invalid target pins.

Group size belongs to persisted UI metadata and graph undo snapshots. Hover and dragging change color/elevation only, never the pin anchor or node transform. Node wrappers remain owned by React Flow.

## Constraints and verification
Use existing React 18/React Flow/Zustand architecture and offline preview. Preserve state graph modes, loops, pause/resume, tools and ownership. Type mismatches, occupied single inputs, same-direction pins, legacy DAG cycles and duplicate edges have explanatory rejection. Empty-canvas release may open a compatible node chooser. Check 1440/1024/768/375 widths, keyboard focus, long labels, reduced motion and offline state. Full type/tests/build gate plus independent code review and browser gesture evidence. No new production dependencies; preview gzip growth budget 10% over 189.33 kB. Measure interaction geometry and bounded drag samples rather than inventing production performance claims.

## Rollback
Code ships on an isolated branch. Keep definitions and explicit port IDs stable where possible; metadata evolution must be covered by fixtures. Do not rewrite user workflow files or remove skills. Retain original working directory. Document unsupported old connections and validation remedies in the delivery guide.

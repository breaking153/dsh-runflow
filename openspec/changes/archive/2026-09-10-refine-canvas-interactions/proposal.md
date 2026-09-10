## Why
Dragging a node currently opens the inspector and shrinks the canvas by 360 pixels. Port hit targets have conflicting CSS, connection rejection is silent, and stacked compact styling makes the editor difficult to read. The user requests Blueprint-inspired flow pins, explicit type matching and immediate invalid-wire feedback, with less repeated Host status chrome.

## What Changes
- Adopt a restrained graphite Blueprint workbench, readable node headers, typed circular data pins and pointed execution pins.
- Keep canvas geometry stable during node and selection gestures; preserve group size edits and undo.
- Share frontend/backend port compatibility, distinguish execution from data, and reject invalid direction, type, occupied input and cycle connections immediately with a red preview and explanation.
- Consolidate connection status and canvas controls, preserve all existing state-graph and authoring capabilities.

## Capabilities
### New Capabilities
- `canvas-interaction`: Stable graph gestures, typed connections, immediate feedback and legible Blueprint presentation.

## Impact
Client node rendering, styles, graph gesture handling and connection planning; shared port validation and control-node descriptors. Existing data and owner boundaries remain authoritative. No new dependencies or production execution.

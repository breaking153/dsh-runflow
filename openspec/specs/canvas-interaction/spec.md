# canvas-interaction Specification

## Purpose
Make RunFlow graph editing predictable through stable pointer gestures, shared executable port types, immediate connection feedback and a legible Blueprint-inspired canvas with restrained Host status chrome.

## Requirements

### Requirement: Stable graph manipulation
Node drag and marquee selection SHALL NOT open, close or resize the inspector during the active pointer gesture. A completed group resize SHALL persist its dimensions and support one-step undo/redo.

#### Scenario: Drag an uninspected node
- **WHEN** a user starts dragging a node while the inspector is closed
- **THEN** the canvas bounds remain unchanged through the gesture and the node follows the pointer.

#### Scenario: Resize a group
- **WHEN** a user resizes a group and releases the pointer
- **THEN** saved UI metadata contains the new dimensions and undo restores the prior size.

### Requirement: Typed connection agreement and immediate feedback
Frontend and backend SHALL use the same type compatibility. Execution flow SHALL connect only to execution flow. A rejected type, direction, occupied single input, duplicate edge or prohibited cycle SHALL leave the graph unchanged. During an invalid wire drag the editor SHALL show a red wire and a textual reason; release SHALL retain an accessible explanation.

#### Scenario: Mismatched data pins
- **WHEN** a text output is dragged over a number input
- **THEN** the preview is red, explains the mismatch, and releasing creates no edge or node chooser.

#### Scenario: Valid reverse drag
- **WHEN** the user drags from an input to a compatible output
- **THEN** the saved edge is normalized from output to input.

#### Scenario: Paste an old template
- **WHEN** a saved fragment contains stale port metadata for a currently known workflow node
- **THEN** insertion uses the current catalog port descriptors while preserving configuration and existing edges for validation; unknown providers and visual helper nodes retain their metadata.

### Requirement: Blueprint presentation with restrained chrome
Execution pins SHALL use pointed geometry distinct from circular data pins. Ports SHALL expose type labels and stable pointer targets. The editor SHALL show a single general Host connection indicator and one set of zoom controls; connection-dependent settings may retain contextual explanations.

#### Scenario: Hover or drag a pin
- **WHEN** the pointer enters a pin or begins a wire
- **THEN** the pin center stays fixed and its shape identifies flow versus data without relying only on color.

#### Scenario: Narrow viewport
- **WHEN** the editor is used at 375 CSS pixels
- **THEN** primary controls remain reachable, overlays fit the available surface and the document has no horizontal overflow.

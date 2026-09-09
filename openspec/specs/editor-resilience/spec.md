# editor-resilience Specification

## Purpose
Keep workflow editing reliable when saves are delayed or fail, browser storage is unavailable, and users operate dialogs entirely by keyboard.

## Requirements

### Requirement: Drafts survive navigation and delayed persistence
The editor SHALL retain unsaved edits when reselecting the current workflow or switching between open workflows. A failed save MUST NOT close the edited workflow or mark it saved. Late responses MUST NOT overwrite newer drafts or a different session.

#### Scenario: Current workflow selected again
- **WHEN** a user edits a workflow and selects its active tab again
- **THEN** the edited content remains unchanged.

#### Scenario: Switching during a delayed save
- **WHEN** a user switches away from an edited workflow and returns before its save completes
- **THEN** the latest local draft is shown and remains eligible for persistence.

#### Scenario: Save failure during close
- **WHEN** closing a dirty workflow requires a save and the Host rejects it
- **THEN** the tab and edits remain available with failure state.

#### Scenario: Late save response
- **WHEN** a save response arrives after newer edits or a session change
- **THEN** it does not replace newer content or contaminate the new session.

#### Scenario: Delete while a save is pending
- **WHEN** a user deletes a workflow that still has a pending save
- **THEN** deletion follows the earlier save and later autosaves cannot recreate the deleted workflow.

#### Scenario: Save status before persistence
- **WHEN** a workflow has no confirmed save or exists only as an offline browser draft
- **THEN** its status identifies the unsaved or local state instead of claiming a Host save.

### Requirement: Browser cache failure is non-blocking
Unavailable browser storage SHALL NOT interrupt editing, panel resizing or Host saves. Optional preferences MAY reset after reload when caching is unavailable.

#### Scenario: Storage access denied or quota exceeded
- **WHEN** browser storage access or writes fail
- **THEN** the editor remains usable and an authorized Host save can still complete.

#### Scenario: Template storage fails
- **WHEN** saving a local template fails
- **THEN** the editor retains the input and previous template list and displays a save error.

### Requirement: Editor dialogs support keyboard operation
The command palette, template browser and keybinding settings SHALL have accessible names, move focus inside on open, contain Tab navigation, close on unhandled Escape, and restore focus to the surviving trigger on close. Shortcut recording SHALL consume Escape to cancel recording first.

#### Scenario: Open, cycle and dismiss a dialog
- **WHEN** a user opens a dialog, cycles Tab and Shift+Tab, then presses Escape
- **THEN** focus stays in that dialog until dismissal and returns to its trigger afterward.

#### Scenario: Cancel shortcut recording
- **WHEN** a user presses Escape while recording a shortcut
- **THEN** recording stops and the keybinding dialog remains open.

#### Scenario: Closed template browser
- **WHEN** the graph changes while the template browser is closed
- **THEN** no template content or template selection snapshot is mounted for that closed browser.

### Requirement: Narrow layouts preserve editor controls
At 375, 768, 1024 and 1440 CSS pixels the workspace SHALL avoid page-level horizontal overflow. A closed inspector SHALL NOT consume canvas width; at narrow widths an open inspector SHALL overlay the canvas with its close control operable. Save errors SHALL remain visible and controls SHALL retain accessible names when labels are hidden.

#### Scenario: Open and close a narrow inspector
- **WHEN** a user opens and closes the inspector at 375 CSS pixels
- **THEN** the canvas keeps its available width and the inspector's close action remains reachable without pointer obstruction.

#### Scenario: Save failure on a narrow screen
- **WHEN** saving fails at 375 CSS pixels
- **THEN** the visible error does not overlap the canvas toolbar.

#### Scenario: Reduced motion
- **WHEN** a user requests reduced motion and fits the graph to the canvas
- **THEN** the viewport updates without an animated pan.

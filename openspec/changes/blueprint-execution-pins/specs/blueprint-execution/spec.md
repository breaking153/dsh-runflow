## Purpose

Enable continuous Blueprint-style workflows with executable property inputs, independent execution signals and demand-evaluated pure values while preserving saved legacy graphs.

## ADDED Requirements

### Requirement: Executable property inputs
Users SHALL expose supported execution properties as stable typed input pins. A connected value SHALL override the saved fallback without mutating the definition, including false, zero, empty string and null where accepted by the property type. Promotion metadata SHALL survive save, reload, copy, paste, subflows and undo. Reserved or unknown property bindings MUST fail validation.

#### Scenario: Dynamic HTTP URL
- **WHEN** a text output connects to an exposed URL property and the request is invoked
- **THEN** the request uses that URL and the saved fallback remains unchanged.

#### Scenario: Restore a property
- **WHEN** a user restores a connected property
- **THEN** its binding and wires are removed in one undoable edit and the saved fallback is retained.

### Requirement: Independent flow activation
Under Blueprint execution, each ordinary flow input SHALL accept multiple sources and invoke independently for each arriving execution signal. Scalar data inputs SHALL remain single-source. Data outputs SHALL supply arguments without invoking effectful nodes. Explicit Join SHALL retain its all-channel barrier.

#### Scenario: Two triggers call a shared action
- **WHEN** either trigger starts a workflow with a shared action
- **THEN** that action and its flow successors run without waiting for the other trigger, and separate calls retain isolated inputs.

#### Scenario: Flow and data from one HTTP response
- **WHEN** HTTP completion flow and response data both connect to a downstream action
- **THEN** that action executes once with the available response.

### Requirement: Complete executable node model
Trigger nodes SHALL emit flow. Effectful operations SHALL provide execution input and completion output except deliberate terminators. Pure value and transformation nodes SHALL be classified explicitly, evaluated when a consumer needs them, and MUST NOT demand-execute effectful providers. Shared-state writes SHALL remain effectful.

#### Scenario: Pure value feeds an action
- **WHEN** a triggered action needs a property supplied by an otherwise inactive pure node
- **THEN** the pure dependency is evaluated and its value supplied before the action runs.

#### Scenario: HTTP continues
- **WHEN** an HTTP request completes successfully
- **THEN** response outputs are available before its completion flow invokes its successor; failure does not emit success flow.

### Requirement: Compatible bounded execution
Blueprint semantics SHALL be explicit for new workflows and selectable for existing graphs. Absent semantics SHALL preserve legacy behavior. Existing port identifiers and omitted-port edge meanings MUST remain stable. Blueprint cycles SHALL obey finite step limits; cancellation and authorized persisted resume SHALL retain execution evidence without replaying completed effects.

#### Scenario: Load a legacy graph
- **WHEN** an existing graph lacks the Blueprint semantics field
- **THEN** its prior data-driven behavior remains available and no edge is silently rewired.

#### Scenario: Paused shared call
- **WHEN** an owner resumes a saved Blueprint interrupt
- **THEN** committed predecessor effects are not replayed and pending call inputs remain isolated.

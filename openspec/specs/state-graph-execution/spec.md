# state-graph-execution Specification

## Purpose
Allow users to express stateful workflows with visible control flow, bounded repetition and recoverable pauses while preserving existing DAG definitions.

## Requirements

### Requirement: Deterministic stateful execution
State graphs SHALL run active nodes in bounded steps over a shared snapshot and apply successful state updates at a step barrier. Conflicting non-reduced concurrent writes MUST fail. Legacy DAGs SHALL remain executable without a format migration.

#### Scenario: Concurrent reducers
- **WHEN** parallel nodes update the same declared accumulating state key with different completion times
- **THEN** final state is deterministic and no node reads another node's uncommitted update.

### Requirement: Explicit control routing and bounded cycles
Branch, multiway selection, parallel fan-out, all-input join, bounded loop, state access and end controls SHALL be executable nodes. Inactive output ports and skipped branches MUST NOT activate successors. Every state graph MUST have a finite execution step limit.

#### Scenario: Selected branch
- **WHEN** a switch selects one output
- **THEN** only edges carrying that output activate their destinations.

#### Scenario: Non-terminating cycle
- **WHEN** a cyclic graph exceeds its configured step limit
- **THEN** execution fails with an explicit limit error and retained execution evidence.

### Requirement: Persisted pause and authorized resume
An explicit interrupt SHALL persist state and pending work before reporting a recoverable pause. Resume SHALL use the frozen workflow, verify the owner and reject simultaneous resumes. A failed checkpoint write MUST prevent the next step from starting.

#### Scenario: Resume a persisted pause
- **WHEN** the owner resumes a paused execution after the service reloads
- **THEN** committed predecessor nodes are not replayed and the supplied response continues the paused node.

### Requirement: Truthful editor state
The editor SHALL preserve execution settings through edits, persistence and navigation, allow state-graph cycles, and display step evidence and paused status without a false completed-node percentage.

#### Scenario: Editing a state graph
- **WHEN** a user changes state settings, switches workflows and returns
- **THEN** the latest settings and cycle connections remain available for persistence.

## Purpose

Preserve valid workflow and source records under cancellation, concurrent draft edits, malformed stored input, and local filesystem failures.

## ADDED Requirements

### Requirement: Already-cancelled executions remain cancelled
The Host SHALL honor an already-aborted parent signal before starting a workflow executor.

#### Scenario: Parent cancelled before start
- **WHEN** execution begins with an already-aborted signal
- **THEN** it reports cancellation and no node executor runs.

### Requirement: Test receipts certify exactly one source revision
A successful source test SHALL certify only the revision used when that test began. Editing a draft during its test MUST NOT certify the new revision.

#### Scenario: Edit during source test
- **WHEN** the source revision changes before an earlier test finishes
- **THEN** that earlier success does not make the new revision eligible for commit.

### Requirement: Failed persistence preserves prior valid state
Repository and node-source writes SHALL preserve the previously valid destination and published in-memory state if replacement fails. Successful writes SHALL publish their committed state only after persistence succeeds.

#### Scenario: Replacement fails
- **WHEN** writing a replacement record fails
- **THEN** the old valid record remains readable and memory does not report the failed version as persisted.

#### Scenario: New draft arrives during commit
- **WHEN** an earlier draft commit overlaps an edit to that draft
- **THEN** the newly edited draft is not silently removed or certified by the earlier commit.

### Requirement: Malformed records do not break a workspace
The Host SHALL validate persisted workflow and execution records before exposing them. Unreadable or malformed files SHALL be preserved on disk and excluded from listings while valid neighboring files remain available.

#### Scenario: Invalid persisted field shape
- **WHEN** one record contains invalid node, edge or timestamp fields
- **THEN** healthy records can still be listed and the malformed record is not returned as a valid workflow or execution.

## Why

The working tree already contains the RunFlow v2 editor and file-backed Host architecture, but unsaved tab changes, storage failures, stale node-test results, and partial file writes can still lose work or report misleading state. The user requests a verified full-stack refactor and removal of host-specific information from Markdown before an automatic Git push.

## What Changes

- Preserve the existing v2 feature baseline and DSH visual identity while separating draft persistence, browser cache access, dialog focus, and atomic file replacement into testable modules.
- Preserve edits during tab switching, delayed saves, failed saves, and unavailable browser storage.
- Give editor dialogs consistent keyboard focus, Escape behavior, accessible names, and focus restoration; avoid hidden template work during graph editing.
- Honor cancellation before execution, bind draft test receipts to the tested revision, and keep file and in-memory state consistent on persistence failure.
- Reject malformed persisted records without making healthy workspace records unavailable.
- Sanitize Markdown host paths and add a regression check; retain portable setup instructions and public project attribution.

## Capabilities

### New Capabilities

- `editor-resilience`: Safe draft persistence, optional browser caches, and keyboard-operable dialogs.
- `host-persistence`: Cancellation, revision-bound test receipts, atomic persistence, and defensive record loading.
- `documentation-privacy`: Portable documentation without host-specific paths or credentials.

### Modified Capabilities

None. This repository has no prior OpenSpec capability specifications.

## Impact

Touches the React/Zustand client, existing Cordis Host services, local JSON repositories, tests, and documentation. Remote method names, runtime formats, DSH authority, and user workflows remain compatible. No new production dependency, production execution, deployment, data migration, or history rewrite is required. Verification runs against mocks, temporary files, and the local preview. The resulting isolated branch will be committed and pushed under the user's explicit authorization.

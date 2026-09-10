## Why

RunFlow and Enhanced Settings target DSH 0.1.2-alpha.2 while the latest npm release is 0.1.5-rc.1. Their installed Web bundles need verified host and browser compatibility.

## What Changes

- Update both local plugins to the published DSH 0.1.5-rc.1 SDK and repair changed API consumers.
- Build and register the verified plugins in the local Web profile, preserving codex-connect and existing user settings.
- Verify an isolated Web boot and browser module loading before reporting compatibility.

## Capabilities

### New Capabilities

- `dsh-plugin-compatibility`: Supported DSH version and Web bundle integration.

### Modified Capabilities

None.

## Impact

Plugin manifests, lockfiles, API consumers, browser packaging, and the local Web profile. No workflow/session data migration, external publishing, or shared Git updates.

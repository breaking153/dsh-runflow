## Purpose

Make Flow callable by normal DSH Agents only while its plugin is active, with scoped authoring and runtime-owned skills that cleanly disappear on unload.

## ADDED Requirements

### Requirement: Runtime and authoring have distinct scopes
An active plugin SHALL expose runtime inspection, start, resume and cancellation to live normal Agents. Source and node authoring SHALL remain confined to the configured creation preset. Execution reads and changes MUST verify ownership.

#### Scenario: Normal Agent invocation
- **WHEN** a normal Agent calls the runtime tool
- **THEN** it can invoke an existing workflow without receiving source-authoring tools or selecting another Agent's identity.

### Requirement: Contributions follow plugin lifecycle
Tools, skills, fallback scopes and HTTP routes SHALL be owned by the plugin's lifecycle. Unload SHALL unregister them and abort active execution; cached invocation closures MUST reject new work after unload. Re-enabling SHALL not duplicate contributions.

#### Scenario: Disable and re-enable
- **WHEN** RunFlow is disabled while an Agent remains alive and later enabled again
- **THEN** old tools and skills disappear and exactly one current contribution is available after re-enablement.

### Requirement: Availability checks supplement registration
Runtime guidance SHALL require discovering the current Flow capability before invocation. It MUST NOT represent a saved skill file as proof of executable capability or remove user-maintained skill files when the plugin is disabled.

#### Scenario: Unavailable Flow
- **WHEN** a stale caller attempts an invocation after the plugin stops
- **THEN** it receives an explicit unavailable result instead of executing against a captured old service.

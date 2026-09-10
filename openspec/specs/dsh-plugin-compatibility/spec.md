# dsh-plugin-compatibility Specification

## Purpose
Keep the locally installed RunFlow plugin compatible with the selected DSH SDK release while preserving user configuration, existing capabilities and isolated verification of the Web runtime.

## Requirements

### Requirement: Published SDK compatibility

RunFlow and Enhanced Settings SHALL build and typecheck against DSH 0.1.5-rc.1 and preserve their existing tested behavior.

#### Scenario: Upgrade a local plugin

- **WHEN** its dependencies are installed and its verification commands run
- **THEN** host and browser typechecks, relevant behavior tests, and plugin builds pass

### Requirement: Web integration

The local Web profile SHALL resolve the updated plugins and load their client modules without modifying codex-connect.

#### Scenario: Compose and launch the upgraded plugins

- **WHEN** DSH loads an isolated Web profile containing the updated plugins
- **THEN** host activation succeeds and browser modules resolve their declared services

#### Scenario: Preserve local data and excluded plugins

- **WHEN** the user's Web profile is updated
- **THEN** existing settings and session/workflow data remain intact and codex-connect source and configuration remain unchanged

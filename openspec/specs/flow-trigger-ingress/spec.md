# flow-trigger-ingress Specification

## Purpose
Provide manual, Agent and webhook workflow entry points whose input is separated from trusted execution ownership and plugin availability.

## Requirements

### Requirement: Entry-specific activation
Manual, Agent and webhook ingress SHALL select their matching trigger entry and pass JSON business input. An unrelated trigger MUST NOT execute as a side effect of selecting another entry.

#### Scenario: Workflow with multiple entries
- **WHEN** an Agent invokes a workflow with both manual and Agent entries
- **THEN** only the Agent entry and its selected downstream graph are activated.

### Requirement: Authenticated live webhook binding
Webhook activation SHALL require a binding created by a trusted live Agent, bearer authentication, a valid bounded JSON body and an available Host listener. External input MUST NOT override the bound owner, workflow or execution options. Tokens MUST NOT be persisted in workflow content or diagnostic logs.

#### Scenario: Unauthorized request
- **WHEN** a request lacks the binding's bearer credential or exceeds the allowed input size
- **THEN** the server rejects it without starting a workflow.

#### Scenario: Plugin or owner disappears
- **WHEN** the plugin or bound Agent becomes unavailable
- **THEN** that binding cannot start an execution and the editor reports the capability as unavailable.

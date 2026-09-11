## ADDED Requirements

### Requirement: Property promotion controls
Execution property labels SHALL expose localized Promote/Restore controls with visible keyboard focus, a typed node input and an explanation of connected-source versus fallback behavior. Adding a pin MUST update wire geometry without moving the pin on hover. Flow rows SHALL remain visually distinct and ordered first.

#### Scenario: Promote an unconnected property
- **WHEN** a user activates Promote beside a property
- **THEN** the node shows a matching typed input and the inspector identifies the saved value as its fallback.

#### Scenario: Connect another flow source
- **WHEN** a second distinct flow output is dragged onto an ordinary flow input
- **THEN** the connection is accepted while duplicate edges and invalid data types remain rejected.

### Requirement: Real Host verification per feature slice
Each logical feature slice SHALL be visually checked in a real DSH plugin session. Temporary debug providers or plugin registrations SHALL be removed after verification.

#### Scenario: Complete verification
- **WHEN** all feature slices have been checked
- **THEN** retained evidence identifies the real Host and no task-owned debug plugin remains registered.

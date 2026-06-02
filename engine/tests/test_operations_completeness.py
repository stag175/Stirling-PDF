"""Architectural meta-tests for the tool -> parameter-model registries.

`ToolOperationStep.validate_tool_parameter_pairing` resolves the expected parameter type with
`OPERATIONS[self.tool]` (or `AGENT_OPERATIONS[self.tool]`). If a new `ToolEndpoint`/`AgentToolId`
is added without a matching registry entry, that lookup KeyErrors at runtime. These tests pin the
invariant that every enum member is mapped (and only valid members are), so the gap is caught at
test time instead.
"""

from __future__ import annotations

from stirling.models import OPERATIONS, ToolEndpoint
from stirling.models.agent_tool_models import AGENT_OPERATIONS, AgentToolId


def test_operations_maps_exactly_the_tool_endpoints() -> None:
    # No endpoint missing a parameter model, and no stray (non-enum) keys.
    assert set(OPERATIONS) == set(ToolEndpoint)


def test_every_tool_endpoint_is_resolvable() -> None:
    # Mirrors the runtime access pattern in validate_tool_parameter_pairing.
    for endpoint in ToolEndpoint:
        assert endpoint in OPERATIONS


def test_operations_values_are_model_classes() -> None:
    assert OPERATIONS  # non-empty, so the check below isn't vacuous
    assert all(isinstance(model, type) for model in OPERATIONS.values())


def test_agent_operations_maps_exactly_the_agent_tool_ids() -> None:
    assert set(AGENT_OPERATIONS) == set(AgentToolId)


def test_agent_operations_values_are_model_classes() -> None:
    assert AGENT_OPERATIONS  # non-empty
    assert all(isinstance(model, type) for model in AGENT_OPERATIONS.values())

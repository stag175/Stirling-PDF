"""Tests for the tool↔parameters pairing validator on ToolOperationStep.

The success path is exercised by tests/test_stirling_contracts.py; this pins the failure branch of
ToolOperationStep.validate_tool_parameter_pairing (mismatched parameter model -> ValidationError).
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from stirling.contracts import ToolOperationStep
from stirling.models.tool_models import Angle, RotatePdfParams, ToolEndpoint


def test_matching_tool_and_parameters_is_accepted() -> None:
    step = ToolOperationStep(
        tool=ToolEndpoint.ROTATE_PDF,
        parameters=RotatePdfParams(angle=Angle(90)),
    )
    assert step.tool == ToolEndpoint.ROTATE_PDF


def test_mismatched_parameter_model_is_rejected() -> None:
    # ROTATE_PDF expects RotatePdfParams; pairing a different tool with RotatePdfParams must fail.
    with pytest.raises(ValidationError, match="must be"):
        ToolOperationStep(
            tool=ToolEndpoint.PDF_TO_CSV,
            parameters=RotatePdfParams(angle=Angle(90)),
        )

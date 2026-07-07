"""Tests for the pure operation-prompt formatters on PdfEditAgent.

`_get_operations_prompt` renders a flat comma-joined ``NAME (endpoint)`` list (used to tell the
model which tools are unavailable). `_get_supported_operations_prompt` renders each operation as a
``- NAME (endpoint)`` head (plus its schema description if any) followed by 4-space-indented lines
for each parameter. Both are static and pure over the supplied endpoints, so they're exercised
directly on the class.
"""

from __future__ import annotations

from stirling.agents.pdf_edit import PdfEditAgent
from stirling.models import ToolEndpoint

_ROTATE = ToolEndpoint.ROTATE_PDF


class TestGetOperationsPrompt:
    def test_single_operation_renders_name_and_endpoint(self) -> None:
        assert (
            PdfEditAgent._get_operations_prompt([_ROTATE])
            == f"{_ROTATE.name} ({_ROTATE.value})"
        )

    def test_empty_is_empty_string(self) -> None:
        assert PdfEditAgent._get_operations_prompt([]) == ""

    def test_multiple_operations_are_comma_joined(self) -> None:
        other = ToolEndpoint.PDF_TO_CSV
        expected = (
            f"{_ROTATE.name} ({_ROTATE.value}), {other.name} ({other.value})"
        )
        assert PdfEditAgent._get_operations_prompt([_ROTATE, other]) == expected


class TestGetSupportedOperationsPrompt:
    def test_renders_head_and_indented_params(self) -> None:
        # RotatePdfParams exposes a single `angle` param (no description) and the op/schema carry
        # no description, so the render is exactly the head line + one 4-space-indented param.
        assert PdfEditAgent._get_supported_operations_prompt([_ROTATE]) == (
            f"- {_ROTATE.name} ({_ROTATE.value})\n    angle"
        )

    def test_empty_is_empty_string(self) -> None:
        assert PdfEditAgent._get_supported_operations_prompt([]) == ""

    def test_each_operation_gets_a_dash_head_line(self) -> None:
        out = PdfEditAgent._get_supported_operations_prompt(
            [_ROTATE, ToolEndpoint.PDF_TO_CSV]
        )
        head_lines = [ln for ln in out.splitlines() if ln.startswith("- ")]
        assert f"- {_ROTATE.name} ({_ROTATE.value})" in head_lines
        assert any(ln.startswith("- PDF_TO_CSV (") for ln in head_lines)
        # Parameter lines (if any) are indented, never flush-left.
        for line in out.splitlines():
            if not line.startswith("- "):
                assert line.startswith("    ")

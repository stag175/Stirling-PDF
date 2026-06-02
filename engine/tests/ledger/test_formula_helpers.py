"""Tests for the pure static cell helpers on FormulaEvaluator.

`_parse_col_ref` turns a ``colN`` reference into its 0-based column index (or None for anything that
doesn't start with ``col`` + digits). `_get_cell` reads a row cell as Decimal, returning None when
the column is out of bounds or the cell isn't numeric. Both are static, so they're exercised
directly on the class.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from stirling.agents.ledger.validators.formula import FormulaEvaluator


class TestParseColRef:
    @pytest.mark.parametrize(
        ("ref", "expected"),
        [
            ("col0", 0),
            ("col3", 3),
            ("col12", 12),
            ("  col2  ", 2),  # leading/trailing whitespace is stripped
            ("col5x", 5),  # re.match anchors at start, trailing chars ignored
        ],
    )
    def test_parses_valid_column_references(self, ref: str, expected: int) -> None:
        assert FormulaEvaluator._parse_col_ref(ref) == expected

    @pytest.mark.parametrize(
        "ref",
        [
            "xcol5",  # does not start with "col"
            "col",  # no digits
            "COL5",  # case-sensitive
            "row3",  # different prefix
            "",  # empty
        ],
    )
    def test_returns_none_for_non_column_references(self, ref: str) -> None:
        assert FormulaEvaluator._parse_col_ref(ref) is None


class TestGetCell:
    def test_reads_in_bounds_numeric_cells(self) -> None:
        row = ["1", "2", "3"]
        assert FormulaEvaluator._get_cell(row, 0) == Decimal("1")
        assert FormulaEvaluator._get_cell(row, 2) == Decimal("3")

    def test_reads_a_decimal_cell(self) -> None:
        assert FormulaEvaluator._get_cell(["1.5"], 0) == Decimal("1.5")

    def test_out_of_bounds_column_returns_none(self) -> None:
        assert FormulaEvaluator._get_cell(["1", "2", "3"], 3) is None

    def test_empty_row_returns_none(self) -> None:
        assert FormulaEvaluator._get_cell([], 0) is None

    def test_non_numeric_cell_returns_none(self) -> None:
        assert FormulaEvaluator._get_cell(["abc"], 0) is None

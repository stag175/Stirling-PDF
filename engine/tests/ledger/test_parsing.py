"""Tests for the shared ledger parsing helpers (stirling.agents.ledger.validators._parsing)."""

from __future__ import annotations

from decimal import Decimal

import pytest

from stirling.agents.ledger.validators._parsing import parse_csv, to_decimal


class TestToDecimal:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("1,234.56", Decimal("1234.56")),  # thousands separator stripped
            ("$1,000", Decimal("1000")),  # currency symbol stripped
            ("£99.99", Decimal("99.99")),
            ("€42", Decimal("42")),
            ("¥500", Decimal("500")),
            ("  42  ", Decimal("42")),  # surrounding whitespace
            ("0", Decimal("0")),
            ("3.14", Decimal("3.14")),
            ("(123.45)", Decimal("-123.45")),  # parenthesised negative
            ("(1,000)", Decimal("-1000")),  # paren negative + separator
        ],
    )
    def test_parses_numeric_cells(self, raw: str, expected: Decimal) -> None:
        assert to_decimal(raw) == expected

    @pytest.mark.parametrize(
        "raw",
        ["", "   ", "-", "—", "n/a", "N/A", "na", "NA", "abc", "12.3.4"],
    )
    def test_non_numeric_cells_return_none(self, raw: str) -> None:
        assert to_decimal(raw) is None

    def test_returns_decimal_type(self) -> None:
        result = to_decimal("10")
        assert isinstance(result, Decimal)


class TestParseCsv:
    def test_basic_rows(self) -> None:
        assert parse_csv("a,b,c\n1,2,3") == [["a", "b", "c"], ["1", "2", "3"]]

    def test_drops_blank_lines(self) -> None:
        assert parse_csv("a,b\n\n1,2") == [["a", "b"], ["1", "2"]]

    def test_drops_rows_of_only_empty_cells(self) -> None:
        assert parse_csv("x,y\n,,\n1,2") == [["x", "y"], ["1", "2"]]

    def test_strips_outer_whitespace(self) -> None:
        assert parse_csv("  \na,b\n  ") == [["a", "b"]]

    def test_single_row(self) -> None:
        assert parse_csv("x,y") == [["x", "y"]]

    def test_empty_input_yields_no_rows(self) -> None:
        assert parse_csv("") == []
        assert parse_csv("   \n  ") == []

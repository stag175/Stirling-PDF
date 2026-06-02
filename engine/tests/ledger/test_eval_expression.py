"""Tests for the additive-expression evaluator in ledger arithmetic validation."""

from __future__ import annotations

from decimal import Decimal

import pytest

from stirling.agents.ledger.validators.arithmetic import _eval_expression, _parse


class TestEvalExpression:
    @pytest.mark.parametrize(
        ("expr", "expected"),
        [
            ("1 + 2 + 3", Decimal(6)),
            ("10 - 4", Decimal(6)),
            ("100 - 30 - 20", Decimal(50)),
            ("5", Decimal(5)),
            ("2.5 + 2.5", Decimal("5.0")),
            ("$1,000 + $234.56", Decimal("1234.56")),  # currency/separators stripped
            ("-5 + 10", Decimal(5)),  # leading negative (empty first token skipped)
            ("(100) + 50", Decimal(-50)),  # parenthesised-negative token
            ("", Decimal(0)),  # empty expression evaluates to zero
            ("  £20  -  £5  ", Decimal(15)),  # whitespace + currency stripped
        ],
    )
    def test_evaluates_additive_expressions(self, expr: str, expected: Decimal) -> None:
        assert _eval_expression(expr) == expected

    @pytest.mark.parametrize("expr", ["1 + abc", "foo", "abc + 1", "2 + 3x"])
    def test_unparseable_operand_returns_none(self, expr: str) -> None:
        assert _eval_expression(expr) is None

    def test_empty_operators_are_skipped_not_failed(self) -> None:
        # extra '+' produces empty tokens that are skipped, so this still evaluates
        assert _eval_expression("1 + + 2") == Decimal(3)


class TestParse:
    def test_delegates_to_to_decimal(self) -> None:
        assert _parse("1,234") == Decimal(1234)
        assert _parse("(50)") == Decimal(-50)
        assert _parse("n/a") is None

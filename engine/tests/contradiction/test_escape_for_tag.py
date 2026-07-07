"""Tests for the JSON-payload tag-escaping prompt-injection guard in contradiction.detector.

`_escape_for_tag` rewrites ``<``/``>`` to their JSON unicode escapes (a backslash followed by
``u003c``/``u003e``) so a JSON payload interpolated inside a ``<verdict>``/``<subjects>``/``<claims>``
/``<content>`` envelope cannot prematurely close the wrapping tag (``json.dumps`` does NOT escape
``<``/``>``). This is the detector's variant of the guard; the sibling
contradiction.capability._escape_for_xml_tag uses HTML entities (``&lt;``/``&gt;``) instead and is
tested in test_capability_escape.py. The two MUST stay distinct, so this test also pins that
_escape_for_tag does NOT emit HTML entities.

The expected escape sequences are built from ``chr(92)`` (a literal backslash) joined with the
``u003c``/``u003e`` suffixes, to keep backslash escaping unambiguous in this source file.
"""

from __future__ import annotations

import pytest

from stirling.agents.contradiction.detector import _escape_for_tag

_LT = chr(92) + "u003c"  # the 6-char sequence: backslash + u003c
_GT = chr(92) + "u003e"  # the 6-char sequence: backslash + u003e


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("safe text", "safe text"),  # nothing to escape
        ("", ""),
        ("<", _LT),
        (">", _GT),
        ("<content>", _LT + "content" + _GT),
        ("a < b > c", "a " + _LT + " b " + _GT + " c"),
        # the docstring's injection example: text trying to close the verdict tag early
        ("</verdict>", _LT + "/verdict" + _GT),
        # multiple occurrences are all rewritten
        ("<<>>", _LT + _LT + _GT + _GT),
    ],
)
def test_escape_for_tag(raw: str, expected: str) -> None:
    assert _escape_for_tag(raw) == expected


def test_uses_json_unicode_escapes_not_html_entities() -> None:
    # Distinct from capability._escape_for_xml_tag, which would emit &lt;/&gt;.
    out = _escape_for_tag("<a>")
    assert out == _LT + "a" + _GT
    assert "&lt;" not in out
    assert "&gt;" not in out
    # The output really does contain a backslash (the JSON unicode escape), not a raw '<'.
    assert chr(92) in out
    assert "<" not in out

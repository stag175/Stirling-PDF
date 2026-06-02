"""Tests for the pure layout-formatting helper _format_layout in the pdf_to_markdown agent."""

from __future__ import annotations

from stirling.agents.pdf_to_markdown.agent import _format_layout
from stirling.contracts.pdf_to_markdown import LayoutFragment, LayoutLine, PageLayout


def _frag(
    text: str,
    *,
    x: float = 0.0,
    y: float = 0.0,
    fs: float = 12.0,
    bold: bool = False,
    width: float = 10.0,
) -> LayoutFragment:
    return LayoutFragment(text=text, x=x, y=y, width=width, font_size=fs, bold=bold)


def _line(y: float, *frags: LayoutFragment) -> LayoutLine:
    return LayoutLine(y=y, fragments=list(frags))


def _page(n: int, *lines: LayoutLine) -> PageLayout:
    return PageLayout(page_number=n, lines=list(lines))


def test_empty_pages_returns_none_marker() -> None:
    assert _format_layout([]) == "None"


def test_single_non_bold_fragment() -> None:
    result = _format_layout([_page(1, _line(100.0, _frag("Hello", x=10.0, y=100.0, fs=12.0)))])
    assert result == "--- Page 1 ---\ny=100 | Hello@(10,100) fs=12"


def test_bold_fragment_is_wrapped_in_double_asterisks() -> None:
    result = _format_layout([_page(2, _line(50.0, _frag("Bold", x=5.0, y=50.0, fs=14.0, bold=True)))])
    assert result == "--- Page 2 ---\ny=50 | **Bold**@(5,50) fs=14"


def test_multiple_fragments_on_a_line_are_space_joined() -> None:
    result = _format_layout(
        [_page(1, _line(10.0, _frag("A", x=1.0, y=10.0), _frag("B", x=20.0, y=10.0)))]
    )
    assert result == "--- Page 1 ---\ny=10 | A@(1,10) fs=12 B@(20,10) fs=12"


def test_multiple_lines_are_newline_joined() -> None:
    result = _format_layout(
        [
            _page(
                1,
                _line(100.0, _frag("top", x=0.0, y=100.0)),
                _line(80.0, _frag("bot", x=0.0, y=80.0)),
            )
        ]
    )
    assert result == "--- Page 1 ---\ny=100 | top@(0,100) fs=12\ny=80 | bot@(0,80) fs=12"


def test_multiple_pages_are_blank_line_joined() -> None:
    result = _format_layout(
        [
            _page(1, _line(10.0, _frag("p1", x=0.0, y=10.0))),
            _page(2, _line(20.0, _frag("p2", x=0.0, y=20.0))),
        ]
    )
    assert result == (
        "--- Page 1 ---\ny=10 | p1@(0,10) fs=12\n\n--- Page 2 ---\ny=20 | p2@(0,20) fs=12"
    )


def test_coordinates_and_font_size_are_rounded_to_integers() -> None:
    result = _format_layout([_page(1, _line(20.6, _frag("R", x=10.4, y=20.6, fs=11.7)))])
    assert result == "--- Page 1 ---\ny=21 | R@(10,21) fs=12"

"""Tests for the pure _build_reconstruction_prompt builder in the pdf_to_markdown agent."""

from __future__ import annotations

from stirling.agents.pdf_to_markdown.agent import _build_reconstruction_prompt
from stirling.contracts import ConversationMessage, PdfToMarkdownRequest
from stirling.contracts.pdf_to_markdown import LayoutFragment, LayoutLine, PageLayout


def _one_page_layout() -> list[PageLayout]:
    frag = LayoutFragment(text="Title", x=0.0, y=100.0, width=50.0, font_size=18.0, bold=True)
    return [PageLayout(page_number=1, lines=[LayoutLine(y=100.0, fragments=[frag])])]


def test_unknown_files_when_none_provided() -> None:
    prompt = _build_reconstruction_prompt(PdfToMarkdownRequest(user_message="Convert this"))
    assert prompt.startswith("Files: Unknown files\n\n")


def test_file_names_are_comma_joined() -> None:
    prompt = _build_reconstruction_prompt(
        PdfToMarkdownRequest(user_message="x", file_names=["a.pdf", "b.pdf"])
    )
    assert "Files: a.pdf, b.pdf" in prompt


def test_user_message_and_empty_history_and_layout() -> None:
    prompt = _build_reconstruction_prompt(
        PdfToMarkdownRequest(user_message="Convert this document")
    )
    assert "User request: Convert this document" in prompt
    assert "Conversation history:\nNone" in prompt  # empty history -> "None"
    assert prompt.endswith("None")  # empty page layout -> "None"


def test_conversation_history_is_formatted() -> None:
    prompt = _build_reconstruction_prompt(
        PdfToMarkdownRequest(
            user_message="x",
            conversation_history=[ConversationMessage(role="user", content="hello")],
        )
    )
    assert "Conversation history:\n- user: hello" in prompt


def test_includes_layout_instructions_and_formatted_layout() -> None:
    prompt = _build_reconstruction_prompt(
        PdfToMarkdownRequest(user_message="x", page_layout=_one_page_layout())
    )
    assert "PAGE LAYOUT (structural source — x/y fragment positions):" in prompt
    # the formatted layout (from _format_layout) is appended at the end
    assert "--- Page 1 ---" in prompt
    assert "**Title**@(0,100) fs=18" in prompt

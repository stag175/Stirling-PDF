"""Tests for the pure contract helpers in stirling.contracts.common."""

from __future__ import annotations

from stirling.contracts import AiFile, ConversationMessage
from stirling.contracts.common import (
    drop_unknown_tool_endpoints,
    format_conversation_history,
    format_file_names,
)
from stirling.models.base import FileId
from stirling.models.tool_models import ToolEndpoint


class TestFormatConversationHistory:
    def test_empty_returns_none_marker(self) -> None:
        assert format_conversation_history([]) == "None"

    def test_single_message(self) -> None:
        history = [ConversationMessage(role="user", content="hi")]
        assert format_conversation_history(history) == "- user: hi"

    def test_multiple_messages_joined_by_newline(self) -> None:
        history = [
            ConversationMessage(role="user", content="hi"),
            ConversationMessage(role="assistant", content="yo"),
        ]
        assert format_conversation_history(history) == "- user: hi\n- assistant: yo"


class TestFormatFileNames:
    def test_empty_returns_explanatory_message(self) -> None:
        assert format_file_names([]) == "No file names were provided."

    def test_single_file(self) -> None:
        assert format_file_names([AiFile(id=FileId("1"), name="a.pdf")]) == "a.pdf"

    def test_multiple_files_comma_separated(self) -> None:
        files = [
            AiFile(id=FileId("1"), name="a.pdf"),
            AiFile(id=FileId("2"), name="b.pdf"),
        ]
        assert format_file_names(files) == "a.pdf, b.pdf"


class TestDropUnknownToolEndpoints:
    def test_empty_input(self) -> None:
        assert drop_unknown_tool_endpoints([]) == []

    def test_all_unknown_dropped(self) -> None:
        assert drop_unknown_tool_endpoints(["definitely-not-an-endpoint-xyz"]) == []

    def test_keeps_valid_value_and_drops_unknown(self) -> None:
        sample = next(iter(ToolEndpoint))
        result = drop_unknown_tool_endpoints([sample.value, "bogus-endpoint-xyz"])
        assert result == [sample]
        assert all(isinstance(e, ToolEndpoint) for e in result)

    def test_accepts_actual_enum_members(self) -> None:
        sample = next(iter(ToolEndpoint))
        assert drop_unknown_tool_endpoints([sample]) == [sample]

import { describe, it, expect } from "vitest";

import { buildOAuthCallbackHtml } from "@app/utils/oauthCallbackHtml";

/**
 * buildOAuthCallbackHtml is a pure, dependency-free string builder. It branches
 * on `isError` (icon glyph + light/dark icon colors) and `errorPlaceholder`
 * (whether an `.error-details` block + its dark-mode CSS are emitted), and
 * interpolates `title`/`message` verbatim into the markup.
 *
 * No external/native deps are touched, so these assertions are fully
 * deterministic and run against the real implementation.
 */

const SUCCESS_ICON = "✓"; // ✓
const ERROR_ICON = "✗"; // ✗

describe("buildOAuthCallbackHtml", () => {
  describe("structure (common to all branches)", () => {
    const html = buildOAuthCallbackHtml({
      title: "My Title",
      message: "My Message",
    });

    it("emits a complete HTML document scaffold", () => {
      expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
      expect(html).toContain("<html>");
      expect(html.trimEnd().endsWith("</html>")).toBe(true);
      expect(html).toContain('<meta charset="utf-8">');
      expect(html).toContain(
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
      );
    });

    it("includes the responsive + dark-mode media queries", () => {
      expect(html).toContain("@media (prefers-color-scheme: dark)");
      expect(html).toContain("@media (max-width: 480px)");
    });

    it("renders the container/icon/h1/p shell", () => {
      expect(html).toContain('<div class="container">');
      expect(html).toContain('<div class="icon">');
      expect(html).toContain("<h1>My Title</h1>");
      expect(html).toContain("<p>My Message</p>");
    });
  });

  describe("title/message interpolation", () => {
    it("places the title in both the <title> tag and the <h1>", () => {
      const html = buildOAuthCallbackHtml({
        title: "Sign-in complete",
        message: "ignored",
      });
      expect(html).toContain("<title>Sign-in complete</title>");
      expect(html).toContain("<h1>Sign-in complete</h1>");
    });

    it("places the message verbatim inside the <p>", () => {
      const html = buildOAuthCallbackHtml({
        title: "ignored",
        message: "You can close this window.",
      });
      expect(html).toContain("<p>You can close this window.</p>");
    });

    it("interpolates raw values without escaping (no sanitization layer)", () => {
      // The builder does not HTML-escape; this documents that behavior so a
      // future change that adds escaping is caught.
      const html = buildOAuthCallbackHtml({
        title: "<b>T&'\"</b>",
        message: "a < b & c",
      });
      expect(html).toContain("<title><b>T&'\"</b></title>");
      expect(html).toContain("<h1><b>T&'\"</b></h1>");
      expect(html).toContain("<p>a < b & c</p>");
    });

    it("handles empty strings for title and message", () => {
      const html = buildOAuthCallbackHtml({ title: "", message: "" });
      expect(html).toContain("<title></title>");
      expect(html).toContain("<h1></h1>");
      expect(html).toContain("<p></p>");
    });
  });

  describe("isError branch (success default)", () => {
    it("uses the success icon and green light/dark icon colors by default", () => {
      const html = buildOAuthCallbackHtml({ title: "t", message: "m" });
      expect(html).toContain(`<div class="icon">${SUCCESS_ICON}</div>`);
      expect(html).not.toContain(ERROR_ICON);
      // Light-mode icon color
      expect(html).toContain("color: #2e7d32;");
      // Dark-mode icon color
      expect(html).toContain("color: #66bb6a;");
      // None of the error palette should leak in.
      expect(html).not.toContain("#d32f2f");
      expect(html).not.toContain("#ef5350");
    });

    it("treats explicit isError:false identically to the default", () => {
      const def = buildOAuthCallbackHtml({ title: "t", message: "m" });
      const explicit = buildOAuthCallbackHtml({
        title: "t",
        message: "m",
        isError: false,
      });
      expect(explicit).toBe(def);
    });
  });

  describe("isError branch (error)", () => {
    const html = buildOAuthCallbackHtml({
      title: "Failed",
      message: "Something broke",
      isError: true,
    });

    it("uses the error icon glyph", () => {
      expect(html).toContain(`<div class="icon">${ERROR_ICON}</div>`);
      expect(html).not.toContain(SUCCESS_ICON);
    });

    it("uses the red light + dark icon colors", () => {
      expect(html).toContain("color: #d32f2f;");
      expect(html).toContain("color: #ef5350;");
      // Success palette must be absent.
      expect(html).not.toContain("#2e7d32");
      expect(html).not.toContain("#66bb6a");
    });

    it("does NOT add the error-details block when errorPlaceholder is false", () => {
      expect(html).not.toContain(".error-details");
      expect(html).not.toContain("{error}");
    });
  });

  describe("errorPlaceholder branch", () => {
    it("omits the error-details block and its CSS by default", () => {
      const html = buildOAuthCallbackHtml({ title: "t", message: "m" });
      expect(html).not.toContain(".error-details");
      expect(html).not.toContain('<div class="error-details">');
      expect(html).not.toContain("{error}");
      // Error-details-specific palette should not be present.
      expect(html).not.toContain("#ffebee");
      expect(html).not.toContain("#3d2020");
    });

    it("adds the error-details block, light CSS, and dark CSS when enabled", () => {
      const html = buildOAuthCallbackHtml({
        title: "t",
        message: "m",
        errorPlaceholder: true,
      });
      // The rendered placeholder element with the literal {error} token.
      expect(html).toContain('<div class="error-details">{error}</div>');
      // Light-mode error-details rule.
      expect(html).toContain(".error-details {");
      expect(html).toContain("background: #ffebee;");
      expect(html).toContain("border: 1px solid #ffcdd2;");
      expect(html).toContain("color: #c62828;");
      // Dark-mode error-details rule.
      expect(html).toContain("background: #3d2020;");
      expect(html).toContain("border: 1px solid #5d3030;");
      expect(html).toContain("color: #ef9a9a;");
    });

    it("emits exactly two .error-details CSS rules (light + dark) when enabled", () => {
      const html = buildOAuthCallbackHtml({
        title: "t",
        message: "m",
        errorPlaceholder: true,
      });
      const ruleCount = html.split(".error-details {").length - 1;
      expect(ruleCount).toBe(2);
    });

    it("is orthogonal to isError: placeholder can appear on a success page", () => {
      const html = buildOAuthCallbackHtml({
        title: "t",
        message: "m",
        isError: false,
        errorPlaceholder: true,
      });
      // Success icon + colors, yet the error-details placeholder is present.
      expect(html).toContain(`<div class="icon">${SUCCESS_ICON}</div>`);
      expect(html).toContain("color: #2e7d32;");
      expect(html).toContain('<div class="error-details">{error}</div>');
    });
  });

  describe("full error page (isError + errorPlaceholder)", () => {
    const html = buildOAuthCallbackHtml({
      title: "Authentication failed",
      message: "Please try again.",
      isError: true,
      errorPlaceholder: true,
    });

    it("combines the error icon, red palette, and error-details placeholder", () => {
      expect(html).toContain(`<div class="icon">${ERROR_ICON}</div>`);
      expect(html).toContain("<h1>Authentication failed</h1>");
      expect(html).toContain("<p>Please try again.</p>");
      expect(html).toContain("color: #d32f2f;");
      expect(html).toContain("color: #ef5350;");
      expect(html).toContain('<div class="error-details">{error}</div>');
    });

    it("returns a non-empty string and is referentially stable across calls", () => {
      const again = buildOAuthCallbackHtml({
        title: "Authentication failed",
        message: "Please try again.",
        isError: true,
        errorPlaceholder: true,
      });
      expect(html.length).toBeGreaterThan(0);
      expect(again).toBe(html);
    });
  });
});

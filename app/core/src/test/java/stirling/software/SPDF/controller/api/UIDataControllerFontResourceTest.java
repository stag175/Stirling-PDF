package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Pins the font-extension → CSS @font-face format mapping in UIDataController.FontResource. The
 * mapping is exercised through the public constructor (which derives {@code type} from the
 * extension), so no production change is needed. Unknown extensions and case mismatches map to "".
 */
class UIDataControllerFontResourceTest {

    private static String typeFor(String extension) {
        return new UIDataController.FontResource("Font", extension).getType();
    }

    @Test
    @DisplayName("known font extensions map to their @font-face format")
    void knownExtensions() {
        assertEquals("truetype", typeFor("ttf"));
        assertEquals("woff", typeFor("woff"));
        assertEquals("woff2", typeFor("woff2"));
        assertEquals("embedded-opentype", typeFor("eot"));
        assertEquals("svg", typeFor("svg"));
    }

    @Test
    @DisplayName("unknown or empty extension maps to an empty format")
    void unknownExtension() {
        assertEquals("", typeFor("otf"));
        assertEquals("", typeFor("pfb"));
        assertEquals("", typeFor(""));
    }

    @Test
    @DisplayName("the extension switch is case-sensitive")
    void caseSensitive() {
        assertEquals("", typeFor("TTF"));
        assertEquals("", typeFor("WOFF2"));
    }

    @Test
    @DisplayName("name and extension are preserved alongside the derived type")
    void preservesNameAndExtension() {
        UIDataController.FontResource r = new UIDataController.FontResource("Roboto", "woff2");
        assertEquals("Roboto", r.getName());
        assertEquals("woff2", r.getExtension());
        assertEquals("woff2", r.getType());
    }
}

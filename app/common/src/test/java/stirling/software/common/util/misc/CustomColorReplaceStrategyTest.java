package stirling.software.common.util.misc;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.api.misc.HighContrastColorCombination;
import stirling.software.common.model.api.misc.ReplaceAndInvert;

class CustomColorReplaceStrategyTest {

    private CustomColorReplaceStrategy strategy;
    private MultipartFile mockFile;

    @BeforeEach
    void setUp() {
        // Create a mock file
        mockFile =
                new MockMultipartFile(
                        "file",
                        "test.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        "test pdf content".getBytes());

        // Initialize strategy with custom colors
        strategy =
                new CustomColorReplaceStrategy(
                        mockFile,
                        ReplaceAndInvert.CUSTOM_COLOR,
                        "000000", // Black text color
                        "FFFFFF", // White background color
                        null); // Not using high contrast combination for CUSTOM_COLOR
    }

    @Test
    void testConstructor() {
        // Test the constructor sets values correctly
        assertNotNull(strategy, "Strategy should be initialized");
        assertEquals(mockFile, strategy.getFileInput(), "File input should be set correctly");
        assertEquals(
                ReplaceAndInvert.CUSTOM_COLOR,
                strategy.getReplaceAndInvert(),
                "ReplaceAndInvert should be set correctly");
    }

    @Test
    void testCheckSupportedFontForCharacter() {
        // Package-private method: call directly (no reflection).
        // ASCII characters should be supported by the standard fonts.
        assertNotNull(
                strategy.checkSupportedFontForCharacter("A"),
                "Standard font should support ASCII character");
    }

    @Test
    void testHighContrastColors() {
        // Create a new strategy with HIGH_CONTRAST_COLOR setting
        CustomColorReplaceStrategy highContrastStrategy =
                new CustomColorReplaceStrategy(
                        mockFile,
                        ReplaceAndInvert.HIGH_CONTRAST_COLOR,
                        null, // These will be overridden by the high contrast settings
                        null,
                        HighContrastColorCombination.BLACK_TEXT_ON_WHITE);

        // replace() will throw IOException because the mock file has no real PDF content, but it
        // still resolves and assigns the colours from the high-contrast setting first.
        try {
            highContrastStrategy.replace();
        } catch (IOException e) {
            // Expected exception due to mock file
        }

        // Package-private fields: read directly (no reflection).
        // For BLACK_TEXT_ON_WHITE, text color should be "0" and background "16777215".
        assertEquals("0", highContrastStrategy.textColor, "Text color should be black (0)");
        assertEquals(
                "16777215",
                highContrastStrategy.backgroundColor,
                "Background color should be white (16777215)");
    }
}

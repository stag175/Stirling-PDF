package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Pins ScannerEffectController.blendColors — the per-channel RGB alpha blend used to composite the
 * scanner gradient. alpha is the foreground weight: 1.0 keeps fg, 0.0 keeps bg, 0.5 is the
 * round-half-up midpoint. The output is packed RGB only (no alpha byte).
 */
class ScannerEffectBlendColorsTest {

    @Test
    @DisplayName("alpha 1.0 keeps the foreground RGB and drops any input alpha byte")
    void alphaOneKeepsForeground() {
        assertEquals(0x112233, ScannerEffectController.blendColors(0x112233, 0x000000, 1.0f));
        // The top (alpha) byte of the input is ignored: 0xFF112233 -> 0x112233.
        assertEquals(0x112233, ScannerEffectController.blendColors(0xFF112233, 0x000000, 1.0f));
    }

    @Test
    @DisplayName("alpha 0.0 keeps the background RGB")
    void alphaZeroKeepsBackground() {
        assertEquals(0x445566, ScannerEffectController.blendColors(0xFFFFFF, 0x445566, 0.0f));
    }

    @Test
    @DisplayName("alpha 0.5 is the round-half-up midpoint per channel")
    void halfwayMidpoint() {
        // round(255*0.5) = round(127.5) = 128 = 0x80, on every channel.
        assertEquals(0x808080, ScannerEffectController.blendColors(0x000000, 0xFFFFFF, 0.5f));
        assertEquals(0x808080, ScannerEffectController.blendColors(0xFFFFFF, 0x000000, 0.5f));
    }

    @Test
    @DisplayName("channels blend independently")
    void perChannel() {
        // fg red, bg blue, 50/50 -> half red + half blue.
        assertEquals(0x800080, ScannerEffectController.blendColors(0xFF0000, 0x0000FF, 0.5f));
    }

    @Test
    @DisplayName("the result never carries an alpha (top) byte")
    void noAlphaByteInResult() {
        int[] alphas = {0, 1, 64, 128, 255};
        for (int a : alphas) {
            int result = ScannerEffectController.blendColors(0xABCDEF, 0x123456, a / 255.0f);
            assertEquals(0, result & 0xFF000000, "unexpected alpha byte for a=" + a);
        }
    }
}

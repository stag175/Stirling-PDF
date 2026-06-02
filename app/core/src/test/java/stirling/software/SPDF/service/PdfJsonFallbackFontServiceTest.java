package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

import org.apache.pdfbox.pdmodel.font.PDType3Font;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;

import stirling.software.SPDF.model.json.PdfJsonFont;
import stirling.software.common.model.ApplicationProperties;

/**
 * Pure unit tests for {@link PdfJsonFallbackFontService}. Only the two collaborators
 * (ResourceLoader and ApplicationProperties) are mocked; no Spring context or real font files are
 * required. The font program bytes returned by the mocked ResourceLoader are arbitrary - the
 * service treats them opaquely (Base64 encodes / caches them) for every code path exercised here.
 */
class PdfJsonFallbackFontServiceTest {

    private ResourceLoader resourceLoader;
    private ApplicationProperties applicationProperties;
    private PdfJsonFallbackFontService service;

    @BeforeEach
    void setUp() {
        resourceLoader = mock(ResourceLoader.class);
        applicationProperties = mock(ApplicationProperties.class);
        // Field declaration order on @RequiredArgsConstructor: resourceLoader,
        // applicationProperties
        service = new PdfJsonFallbackFontService(resourceLoader, applicationProperties);
    }

    // ---------------------------------------------------------------------
    // resolveFallbackFontId(String, int) - name based matching
    // ---------------------------------------------------------------------

    @Test
    void resolveByName_arialRegular_mapsToLiberationSans() {
        assertEquals("fallback-liberation-sans", service.resolveFallbackFontId("Arial", 'a'));
    }

    @Test
    void resolveByName_helveticaMapsToLiberationSans() {
        assertEquals("fallback-liberation-sans", service.resolveFallbackFontId("Helvetica", 'a'));
    }

    @Test
    void resolveByName_arialBold_appendsBoldSuffix() {
        assertEquals(
                "fallback-liberation-sans-bold", service.resolveFallbackFontId("Arial-Bold", 'a'));
    }

    @Test
    void resolveByName_arialItalic_appendsItalicSuffix() {
        assertEquals(
                "fallback-liberation-sans-italic",
                service.resolveFallbackFontId("Arial-Italic", 'a'));
    }

    @Test
    void resolveByName_arialBoldItalic_appendsBoldItalicSuffix() {
        assertEquals(
                "fallback-liberation-sans-bolditalic",
                service.resolveFallbackFontId("Arial-BoldItalic", 'a'));
    }

    @Test
    void resolveByName_subsetPrefixIsStripped() {
        // "PXAAAC+" subset prefix should be removed before alias lookup
        assertEquals(
                "fallback-liberation-serif",
                service.resolveFallbackFontId("PXAAAC+TimesNewRoman", 'a'));
    }

    @Test
    void resolveByName_spacesAreRemoved() {
        // "Times New Roman" -> "timesnewroman"
        assertEquals(
                "fallback-liberation-serif", service.resolveFallbackFontId("Times New Roman", 'a'));
    }

    @Test
    void resolveByName_commaDelimiterSplitsBaseName() {
        // "Arial,Bold" -> base "arial", style bold
        assertEquals(
                "fallback-liberation-sans-bold", service.resolveFallbackFontId("Arial,Bold", 'a'));
    }

    @Test
    void resolveByName_underscoreNumericWeightDetectedAsBold() {
        // "Arimo_700wght" -> base "arimo" (liberation-sans), 700 weight -> bold
        assertEquals(
                "fallback-liberation-sans-bold",
                service.resolveFallbackFontId("Arimo_700wght", 'a'));
    }

    @Test
    void resolveByName_heavyKeywordDetectedAsBold() {
        assertEquals(
                "fallback-liberation-sans-bold", service.resolveFallbackFontId("Arial-Heavy", 'a'));
    }

    @Test
    void resolveByName_blackKeywordDetectedAsBold() {
        assertEquals(
                "fallback-liberation-sans-bold", service.resolveFallbackFontId("Arial-Black", 'a'));
    }

    @Test
    void resolveByName_courierMapsToLiberationMono() {
        assertEquals("fallback-liberation-mono", service.resolveFallbackFontId("Courier", 'a'));
    }

    @Test
    void resolveByName_dejavuSansOblique_usesObliqueNotItalic() {
        // DejaVu sans uses "oblique" rather than "italic"
        assertEquals(
                "fallback-dejavu-sans-oblique",
                service.resolveFallbackFontId("DejaVuSans-Italic", 'a'));
    }

    @Test
    void resolveByName_dejavuSansBoldOblique() {
        assertEquals(
                "fallback-dejavu-sans-boldoblique",
                service.resolveFallbackFontId("DejaVuSans-BoldItalic", 'a'));
    }

    @Test
    void resolveByName_dejavuSerif_usesItalicNotOblique() {
        // DejaVu serif keeps "italic"
        assertEquals(
                "fallback-dejavu-serif-italic",
                service.resolveFallbackFontId("DejaVuSerif-Italic", 'a'));
    }

    @Test
    void resolveByName_obliqueKeywordDetectedAsItalic() {
        // "oblique" keyword in name triggers italic detection for a serif (uses -italic)
        assertEquals(
                "fallback-dejavu-serif-italic",
                service.resolveFallbackFontId("DejaVuSerif-Oblique", 'a'));
    }

    @Test
    void resolveByName_dejavuMonoBold() {
        assertEquals(
                "fallback-dejavu-mono-bold",
                service.resolveFallbackFontId("DejaVuSansMono-Bold", 'a'));
    }

    @Test
    void resolveByName_notoSansBoldItalic_supportsStyle() {
        assertEquals(
                "fallback-noto-sans-bolditalic",
                service.resolveFallbackFontId("NotoSans-BoldItalic", 'a'));
    }

    @Test
    void resolveByName_unsupportedFamilyCjkIgnoresStyle() {
        // simsun -> fallback-noto-cjk which is NOT a style-supported family, so suffix not applied
        assertEquals("fallback-noto-cjk", service.resolveFallbackFontId("SimSun-Bold", 'a'));
    }

    @Test
    void resolveByName_traditionalChineseAliasMingLiu() {
        assertEquals("fallback-noto-tc", service.resolveFallbackFontId("MingLiU", 'a'));
    }

    @Test
    void resolveByName_unknownNameFallsBackToCodePoint() {
        // Unknown font name -> Unicode-based selection. Latin 'a' -> default Noto Sans.
        assertEquals(
                PdfJsonFallbackFontService.FALLBACK_FONT_ID,
                service.resolveFallbackFontId("CompletelyUnknownFont", 'a'));
    }

    @Test
    void resolveByName_unknownNameWithCjkCodePoint() {
        // Unknown name -> falls through to codepoint resolution; CJK ideograph -> CJK font
        assertEquals(
                PdfJsonFallbackFontService.FALLBACK_FONT_CJK_ID,
                service.resolveFallbackFontId("Unknown", 0x4E00));
    }

    @Test
    void resolveByName_nullNameFallsBackToCodePoint() {
        assertEquals(
                PdfJsonFallbackFontService.FALLBACK_FONT_AR_ID,
                service.resolveFallbackFontId(null, 0x0627)); // Arabic letter alef
    }

    @Test
    void resolveByName_emptyNameFallsBackToCodePoint() {
        assertEquals(
                PdfJsonFallbackFontService.FALLBACK_FONT_ID,
                service.resolveFallbackFontId("", 'Z'));
    }

    // ---------------------------------------------------------------------
    // resolveFallbackFontId(int) - Unicode block / script based selection
    // ---------------------------------------------------------------------

    @Test
    void resolveByCodePoint_latin_returnsDefault() {
        assertEquals(
                PdfJsonFallbackFontService.FALLBACK_FONT_ID, service.resolveFallbackFontId('A'));
    }

    @Test
    void resolveByCodePoint_bopomofo_returnsTraditionalChinese() {
        // U+3105 is in the Bopomofo block
        assertEquals(
                PdfJsonFallbackFontService.FALLBACK_FONT_TC_ID,
                service.resolveFallbackFontId(0x3105));
    }

    @Test
    void resolveByCodePoint_cjkCompatibilityIdeograph_returnsTraditionalChinese() {
        // U+F900 is CJK Compatibility Ideographs
        assertEquals(
                PdfJsonFallbackFontService.FALLBACK_FONT_TC_ID,
                service.resolveFallbackFontId(0xF900));
    }

    @Test
    void resolveByCodePoint_cjkUnifiedIdeograph_returnsCjk() {
        // U+4E00 is CJK Unified Ideographs
        assertEquals(
                PdfJsonFallbackFontService.FALLBACK_FONT_CJK_ID,
                service.resolveFallbackFontId(0x4E00));
    }

    @Test
    void resolveByCodePoint_halfwidthFullwidthForms_returnsCjk() {
        // U+FF01 is Halfwidth and Fullwidth Forms
        assertEquals(
                PdfJsonFallbackFontService.FALLBACK_FONT_CJK_ID,
                service.resolveFallbackFontId(0xFF01));
    }

    @Test
    void resolveByCodePoint_hiragana_returnsJapanese() {
        // U+3042 HIRAGANA LETTER A
        assertEquals(
                PdfJsonFallbackFontService.FALLBACK_FONT_JP_ID,
                service.resolveFallbackFontId(0x3042));
    }

    @Test
    void resolveByCodePoint_katakana_returnsJapanese() {
        // U+30A2 KATAKANA LETTER A
        assertEquals(
                PdfJsonFallbackFontService.FALLBACK_FONT_JP_ID,
                service.resolveFallbackFontId(0x30A2));
    }

    @Test
    void resolveByCodePoint_hangul_returnsKorean() {
        // U+AC00 HANGUL SYLLABLE GA
        assertEquals(
                PdfJsonFallbackFontService.FALLBACK_FONT_KR_ID,
                service.resolveFallbackFontId(0xAC00));
    }

    @Test
    void resolveByCodePoint_arabic_returnsArabic() {
        assertEquals(
                PdfJsonFallbackFontService.FALLBACK_FONT_AR_ID,
                service.resolveFallbackFontId(0x0627));
    }

    @Test
    void resolveByCodePoint_thai_returnsThai() {
        // U+0E01 THAI CHARACTER KO KAI
        assertEquals(
                PdfJsonFallbackFontService.FALLBACK_FONT_TH_ID,
                service.resolveFallbackFontId(0x0E01));
    }

    @Test
    void resolveByCodePoint_devanagari_returnsDevanagari() {
        // U+0905 DEVANAGARI LETTER A
        assertEquals(
                PdfJsonFallbackFontService.FALLBACK_FONT_DEVANAGARI_ID,
                service.resolveFallbackFontId(0x0905));
    }

    @Test
    void resolveByCodePoint_malayalam_returnsMalayalam() {
        // U+0D05 MALAYALAM LETTER A
        assertEquals(
                PdfJsonFallbackFontService.FALLBACK_FONT_MALAYALAM_ID,
                service.resolveFallbackFontId(0x0D05));
    }

    @Test
    void resolveByCodePoint_tibetan_returnsTibetan() {
        // U+0F40 TIBETAN LETTER KA
        assertEquals(
                PdfJsonFallbackFontService.FALLBACK_FONT_TIBETAN_ID,
                service.resolveFallbackFontId(0x0F40));
    }

    // ---------------------------------------------------------------------
    // mapUnsupportedGlyph
    // ---------------------------------------------------------------------

    @Test
    void mapUnsupportedGlyph_heavyLeftAngleBracket_mapsToLessThan() {
        assertEquals("<", service.mapUnsupportedGlyph(0x276E));
    }

    @Test
    void mapUnsupportedGlyph_heavyRightAngleBracket_mapsToGreaterThan() {
        assertEquals(">", service.mapUnsupportedGlyph(0x276F));
    }

    @Test
    void mapUnsupportedGlyph_unmappedCodePoint_returnsNull() {
        assertNull(service.mapUnsupportedGlyph('a'));
    }

    // ---------------------------------------------------------------------
    // canEncode / canEncodeFully
    // ---------------------------------------------------------------------

    @Test
    void canEncode_nullFont_returnsFalse() {
        assertFalse(service.canEncode(null, "abc"));
    }

    @Test
    void canEncode_nullText_returnsFalse() {
        assertFalse(service.canEncode(mock(org.apache.pdfbox.pdmodel.font.PDFont.class), null));
    }

    @Test
    void canEncode_emptyText_returnsFalse() {
        assertFalse(service.canEncode(mock(org.apache.pdfbox.pdmodel.font.PDFont.class), ""));
    }

    @Test
    void canEncode_type3Font_returnsFalse() {
        // PDType3Font is always treated as unable to encode
        PDType3Font type3 = mock(PDType3Font.class);
        assertFalse(service.canEncode(type3, "abc"));
    }

    @Test
    void canEncode_fontEncodeThrows_returnsFalse() throws Exception {
        org.apache.pdfbox.pdmodel.font.PDFont font =
                mock(org.apache.pdfbox.pdmodel.font.PDFont.class);
        when(font.encode("abc")).thenThrow(new IOException("cannot encode"));
        assertFalse(service.canEncode(font, "abc"));
    }

    @Test
    void canEncode_fontEncodeSucceeds_returnsTrue() throws Exception {
        org.apache.pdfbox.pdmodel.font.PDFont font =
                mock(org.apache.pdfbox.pdmodel.font.PDFont.class);
        when(font.encode("abc")).thenReturn(new byte[] {1, 2});
        assertTrue(service.canEncode(font, "abc"));
    }

    @Test
    void canEncodeFully_delegatesToCanEncode() throws Exception {
        org.apache.pdfbox.pdmodel.font.PDFont font =
                mock(org.apache.pdfbox.pdmodel.font.PDFont.class);
        when(font.encode("xy")).thenReturn(new byte[] {3});
        assertTrue(service.canEncodeFully(font, "xy"));
    }

    @Test
    void canEncode_codePointOverload_delegates() throws Exception {
        org.apache.pdfbox.pdmodel.font.PDFont font =
                mock(org.apache.pdfbox.pdmodel.font.PDFont.class);
        when(font.encode("A")).thenReturn(new byte[] {65});
        assertTrue(service.canEncode(font, (int) 'A'));
    }

    // ---------------------------------------------------------------------
    // buildFallbackFontModel
    // ---------------------------------------------------------------------

    @Test
    void buildFallbackFontModel_unknownId_throwsIOException() {
        IOException ex =
                assertThrows(
                        IOException.class, () -> service.buildFallbackFontModel("does-not-exist"));
        assertTrue(ex.getMessage().contains("Unknown fallback font id"));
    }

    @Test
    void buildFallbackFontModel_builtInId_returnsModelWithBase64Program() throws Exception {
        byte[] fontBytes = "FAKEFONT".getBytes(StandardCharsets.UTF_8);
        Resource resource = mock(Resource.class);
        when(resource.exists()).thenReturn(true);
        when(resource.getInputStream()).thenReturn(new ByteArrayInputStream(fontBytes));
        // CJK built-in spec resource location
        when(resourceLoader.getResource("classpath:/static/fonts/NotoSansSC-Regular.ttf"))
                .thenReturn(resource);

        PdfJsonFont model =
                service.buildFallbackFontModel(PdfJsonFallbackFontService.FALLBACK_FONT_CJK_ID);

        assertNotNull(model);
        assertEquals(PdfJsonFallbackFontService.FALLBACK_FONT_CJK_ID, model.getId());
        assertEquals(PdfJsonFallbackFontService.FALLBACK_FONT_CJK_ID, model.getUid());
        assertEquals("NotoSansSC-Regular", model.getBaseName());
        assertEquals("TrueType", model.getSubtype());
        assertEquals(Boolean.TRUE, model.getEmbedded());
        assertEquals("ttf", model.getProgramFormat());
        assertEquals(Base64.getEncoder().encodeToString(fontBytes), model.getProgram());
    }

    @Test
    void buildFallbackFontModel_resourceMissing_throwsIOException() {
        Resource resource = mock(Resource.class);
        when(resource.exists()).thenReturn(false);
        when(resourceLoader.getResource(anyString())).thenReturn(resource);

        IOException ex =
                assertThrows(
                        IOException.class,
                        () ->
                                service.buildFallbackFontModel(
                                        PdfJsonFallbackFontService.FALLBACK_FONT_TH_ID));
        assertTrue(ex.getMessage().contains("Fallback font resource not found"));
    }

    @Test
    void buildFallbackFontModel_cachesBytesAfterFirstLoad() throws Exception {
        byte[] fontBytes = {10, 20, 30};
        Resource resource = mock(Resource.class);
        when(resource.exists()).thenReturn(true);
        when(resource.getInputStream()).thenReturn(new ByteArrayInputStream(fontBytes));
        when(resourceLoader.getResource("classpath:/static/fonts/NotoSansKR-Regular.ttf"))
                .thenReturn(resource);

        service.buildFallbackFontModel(PdfJsonFallbackFontService.FALLBACK_FONT_KR_ID);
        service.buildFallbackFontModel(PdfJsonFallbackFontService.FALLBACK_FONT_KR_ID);

        // Resource loaded only once because bytes are cached after first read
        verify(resourceLoader, times(1))
                .getResource("classpath:/static/fonts/NotoSansKR-Regular.ttf");
        verify(resource, times(1)).getInputStream();
    }

    @Test
    void buildFallbackFontModel_defaultId_usesInferredBaseNameAndFormat() throws Exception {
        // FALLBACK_FONT_ID uses the configured fallbackFontLocation field, which is normally set
        // in the @PostConstruct loadConfig(). Drive that path with a stubbed location.
        setField(service, "fallbackFontLocation", "classpath:/fonts/CustomFallback.otf");

        byte[] fontBytes = {1, 2, 3, 4};
        Resource resource = mock(Resource.class);
        when(resource.exists()).thenReturn(true);
        when(resource.getInputStream()).thenReturn(new ByteArrayInputStream(fontBytes));
        when(resourceLoader.getResource("classpath:/fonts/CustomFallback.otf"))
                .thenReturn(resource);

        PdfJsonFont model =
                service.buildFallbackFontModel(PdfJsonFallbackFontService.FALLBACK_FONT_ID);

        assertEquals("CustomFallback", model.getBaseName());
        assertEquals("otf", model.getProgramFormat());
    }

    // ---------------------------------------------------------------------
    // loadConfig (@PostConstruct) behaviour
    // ---------------------------------------------------------------------

    @Test
    void loadConfig_usesConfiguredFallbackFontWhenPresent() throws Exception {
        ApplicationProperties.PdfEditor pdfEditor = mock(ApplicationProperties.PdfEditor.class);
        when(pdfEditor.getFallbackFont()).thenReturn("classpath:/fonts/Configured.ttf");
        when(applicationProperties.getPdfEditor()).thenReturn(pdfEditor);

        invokeLoadConfig(service);

        assertEquals("classpath:/fonts/Configured.ttf", getField(service, "fallbackFontLocation"));
    }

    @Test
    void loadConfig_blankConfiguredFallsBackToLegacyLocation() throws Exception {
        ApplicationProperties.PdfEditor pdfEditor = mock(ApplicationProperties.PdfEditor.class);
        when(pdfEditor.getFallbackFont()).thenReturn("   ");
        when(applicationProperties.getPdfEditor()).thenReturn(pdfEditor);
        setField(service, "legacyFallbackFontLocation", "classpath:/legacy/Noto.ttf");

        invokeLoadConfig(service);

        assertEquals("classpath:/legacy/Noto.ttf", getField(service, "fallbackFontLocation"));
    }

    @Test
    void loadConfig_nullPdfEditorFallsBackToLegacyLocation() throws Exception {
        when(applicationProperties.getPdfEditor()).thenReturn(null);
        setField(service, "legacyFallbackFontLocation", "classpath:/legacy/Default.ttf");

        invokeLoadConfig(service);

        assertEquals("classpath:/legacy/Default.ttf", getField(service, "fallbackFontLocation"));
    }

    // ---------------------------------------------------------------------
    // inferBaseName / inferFormat (private) exercised directly via reflection
    // ---------------------------------------------------------------------

    @Test
    void inferBaseName_nullLocation_returnsDefault() throws Exception {
        assertEquals("DefName", invokeInferBaseName(null, "DefName"));
    }

    @Test
    void inferBaseName_blankLocation_returnsDefault() throws Exception {
        assertEquals("DefName", invokeInferBaseName("  ", "DefName"));
    }

    @Test
    void inferBaseName_stripsPathAndExtension() throws Exception {
        assertEquals(
                "MyFont", invokeInferBaseName("classpath:/static/fonts/MyFont.ttf", "DefName"));
    }

    @Test
    void inferBaseName_noExtension_returnsFileName() throws Exception {
        assertEquals("plainname", invokeInferBaseName("dir/plainname", "DefName"));
    }

    @Test
    void inferBaseName_emptyFileNameAfterStrip_returnsDefault() throws Exception {
        // Leading dot makes dot == 0, so the substring branch is skipped and the (non-empty)
        // ".hidden" filename is returned rather than the default.
        assertEquals(".hidden", invokeInferBaseName("dir/.hidden", "DefName"));
    }

    @Test
    void inferFormat_nullLocation_returnsDefault() throws Exception {
        assertEquals("ttf", invokeInferFormat(null, "ttf"));
    }

    @Test
    void inferFormat_blankLocation_returnsDefault() throws Exception {
        assertEquals("ttf", invokeInferFormat("", "ttf"));
    }

    @Test
    void inferFormat_lowercasesExtension() throws Exception {
        assertEquals("otf", invokeInferFormat("path/Font.OTF", "ttf"));
    }

    @Test
    void inferFormat_noDot_returnsDefault() throws Exception {
        assertEquals("ttf", invokeInferFormat("nodothere", "ttf"));
    }

    @Test
    void inferFormat_trailingDot_returnsDefault() throws Exception {
        // dot is the last char -> condition dot < length-1 fails -> default returned
        assertEquals("ttf", invokeInferFormat("font.", "ttf"));
    }

    // ---------------------------------------------------------------------
    // reflection helpers
    // ---------------------------------------------------------------------

    // Direct compile-checked calls to the package-private service helpers (was reflection).
    private static void invokeLoadConfig(PdfJsonFallbackFontService target) {
        target.loadConfig();
    }

    private String invokeInferBaseName(String location, String defaultName) {
        return service.inferBaseName(location, defaultName);
    }

    private String invokeInferFormat(String location, String defaultFormat) {
        return service.inferFormat(location, defaultFormat);
    }

    private static void setField(Object target, String fieldName, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(target, value);
    }

    private static String getField(Object target, String fieldName) throws Exception {
        Field field = target.getClass().getDeclaredField(fieldName);
        field.setAccessible(true);
        return (String) field.get(target);
    }
}

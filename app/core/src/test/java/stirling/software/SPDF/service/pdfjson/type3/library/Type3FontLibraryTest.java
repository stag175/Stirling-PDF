package stirling.software.SPDF.service.pdfjson.type3.library;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType3Font;
import org.apache.pdfbox.pdmodel.font.encoding.Encoding;
import org.apache.pdfbox.util.Matrix;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;

import stirling.software.SPDF.service.pdfjson.type3.Type3FontSignatureCalculator;
import stirling.software.common.model.ApplicationProperties;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Unit tests for {@link Type3FontLibrary}. Collaborators (ObjectMapper, ResourceLoader,
 * ApplicationProperties) are Mockito-mockable; no Spring context, DB, network, or real files are
 * required. The {@code initialise()} method is package-private and is invoked directly from this
 * mirrored test package.
 *
 * <p>Jackson 3 (tools.jackson) is used to match production. The RawEntry/RawPayload reflection
 * targets are public-field POJOs with no primitive fields, so FAIL_ON_NULL_FOR_PRIMITIVES does not
 * apply here; a plain JsonMapper (unknown properties ignored by default) mirrors app behaviour.
 */
class Type3FontLibraryTest {

    private static final String INDEX_LOCATION = "classpath:/type3/library/index.json";

    private final ObjectMapper objectMapper = JsonMapper.builder().build();

    private ResourceLoader resourceLoader;
    private ApplicationProperties applicationProperties;

    private ApplicationProperties.PdfEditor pdfEditor;
    private ApplicationProperties.PdfEditor.Type3 type3;
    private ApplicationProperties.PdfEditor.Type3.Library library;

    @BeforeEach
    void setUp() {
        resourceLoader = mock(ResourceLoader.class);
        applicationProperties = mock(ApplicationProperties.class);
        pdfEditor = mock(ApplicationProperties.PdfEditor.class);
        type3 = mock(ApplicationProperties.PdfEditor.Type3.class);
        library = mock(ApplicationProperties.PdfEditor.Type3.Library.class);
    }

    private Type3FontLibrary newLibrary() {
        return new Type3FontLibrary(objectMapper, resourceLoader, applicationProperties);
    }

    /** Wire the property chain so {@code getIndex()} returns the supplied location. */
    private void enableConfig(String indexLocation) {
        when(applicationProperties.getPdfEditor()).thenReturn(pdfEditor);
        when(pdfEditor.getType3()).thenReturn(type3);
        when(type3.getLibrary()).thenReturn(library);
        when(library.getIndex()).thenReturn(indexLocation);
    }

    /**
     * Build an index Resource whose stream returns the supplied JSON bytes. Uses a REAL
     * ByteArrayResource (exists()==true, getInputStream() returns the bytes) rather than a Mockito
     * mock: stubbing a mock inside the `when(loader.getResource(...)).thenReturn(jsonIndexResource(...))`
     * argument interleaves with the outer stubbing and trips UnfinishedStubbingException.
     */
    private Resource jsonIndexResource(String json) {
        return new org.springframework.core.io.ByteArrayResource(
                json.getBytes(StandardCharsets.UTF_8));
    }

    // ---------------------------------------------------------------------
    // initialise(): configuration-absent branches
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("initialise: null PdfEditor disables the library")
    void initialise_nullPdfEditor_disabled() {
        when(applicationProperties.getPdfEditor()).thenReturn(null);

        Type3FontLibrary lib = newLibrary();
        lib.initialise();

        assertFalse(lib.isLoaded());
        verify(resourceLoader, never()).getResource(anyString());
    }

    @Test
    @DisplayName("initialise: null Type3 disables the library")
    void initialise_nullType3_disabled() {
        when(applicationProperties.getPdfEditor()).thenReturn(pdfEditor);
        when(pdfEditor.getType3()).thenReturn(null);

        Type3FontLibrary lib = newLibrary();
        lib.initialise();

        assertFalse(lib.isLoaded());
    }

    @Test
    @DisplayName("initialise: null Library disables the library")
    void initialise_nullLibrary_disabled() {
        when(applicationProperties.getPdfEditor()).thenReturn(pdfEditor);
        when(pdfEditor.getType3()).thenReturn(type3);
        when(type3.getLibrary()).thenReturn(null);

        Type3FontLibrary lib = newLibrary();
        lib.initialise();

        assertFalse(lib.isLoaded());
    }

    // ---------------------------------------------------------------------
    // initialise(): resource missing / IO errors
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("initialise: missing index resource disables the library")
    void initialise_resourceMissing_disabled() {
        enableConfig(INDEX_LOCATION);
        Resource resource = mock(Resource.class);
        when(resource.exists()).thenReturn(false);
        when(resourceLoader.getResource(INDEX_LOCATION)).thenReturn(resource);

        Type3FontLibrary lib = newLibrary();
        lib.initialise();

        assertFalse(lib.isLoaded());
    }

    @Test
    @DisplayName("initialise: IOException while reading index leaves library unloaded")
    void initialise_inputStreamThrows_disabled() throws IOException {
        enableConfig(INDEX_LOCATION);
        Resource resource = mock(Resource.class);
        when(resource.exists()).thenReturn(true);
        when(resource.getInputStream()).thenThrow(new IOException("boom"));
        when(resourceLoader.getResource(INDEX_LOCATION)).thenReturn(resource);

        Type3FontLibrary lib = newLibrary();
        lib.initialise();

        assertFalse(lib.isLoaded());
        assertNull(lib.match(mockMinimalFont(), "uid"));
    }

    // ---------------------------------------------------------------------
    // initialise(): successful load + indexing
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("initialise: loads an entry with inline base64 program payload")
    void initialise_inlineBase64_loadsEntry() {
        enableConfig(INDEX_LOCATION);
        String json =
                "["
                        + "{\"id\":\"e1\",\"label\":\"Entry One\","
                        + "\"signatures\":[\"sha256:ABC\"],"
                        + "\"aliases\":[\"TimesNewRoman\"],"
                        + "\"program\":{\"base64\":\"AQID\",\"format\":\"TTF\"},"
                        + "\"source\":\"manual\"}"
                        + "]";
        when(resourceLoader.getResource(INDEX_LOCATION)).thenReturn(jsonIndexResource(json));

        Type3FontLibrary lib = newLibrary();
        lib.initialise();

        assertTrue(lib.isLoaded());
    }

    @Test
    @DisplayName("initialise: entries without any payload are dropped")
    void initialise_entryWithoutPayload_dropped() {
        enableConfig(INDEX_LOCATION);
        String json =
                "[{\"id\":\"noPayload\",\"label\":\"No Payload\","
                        + "\"signatures\":[\"sha256:XYZ\"]}]";
        when(resourceLoader.getResource(INDEX_LOCATION)).thenReturn(jsonIndexResource(json));

        Type3FontLibrary lib = newLibrary();
        lib.initialise();

        // hasAnyPayload() is false, so the entry is not retained -> library reports unloaded.
        assertFalse(lib.isLoaded());
    }

    @Test
    @DisplayName("initialise: entry with null id is skipped")
    void initialise_nullId_skipped() {
        enableConfig(INDEX_LOCATION);
        String json = "[{\"label\":\"No Id\",\"program\":{\"base64\":\"AQID\"}}]";
        when(resourceLoader.getResource(INDEX_LOCATION)).thenReturn(jsonIndexResource(json));

        Type3FontLibrary lib = newLibrary();
        lib.initialise();

        assertFalse(lib.isLoaded());
    }

    @Test
    @DisplayName("initialise: empty JSON array yields an unloaded library")
    void initialise_emptyArray_unloaded() {
        enableConfig(INDEX_LOCATION);
        when(resourceLoader.getResource(INDEX_LOCATION)).thenReturn(jsonIndexResource("[]"));

        Type3FontLibrary lib = newLibrary();
        lib.initialise();

        assertFalse(lib.isLoaded());
    }

    @Test
    @DisplayName("initialise: blank inline base64 falls through to no payload and entry is dropped")
    void initialise_blankBase64_noPayloadDropped() {
        enableConfig(INDEX_LOCATION);
        // base64 is blank and no resource -> loadPayload returns null -> no payload -> dropped.
        String json =
                "[{\"id\":\"e\",\"label\":\"Blank\",\"program\":{\"base64\":\"   \"}}]";
        when(resourceLoader.getResource(INDEX_LOCATION)).thenReturn(jsonIndexResource(json));

        Type3FontLibrary lib = newLibrary();
        lib.initialise();

        assertFalse(lib.isLoaded());
    }

    @Test
    @DisplayName("initialise: invalid base64 payload is rejected and entry dropped")
    void initialise_invalidBase64_dropped() {
        enableConfig(INDEX_LOCATION);
        // '@@@@' is not valid base64 -> IllegalArgumentException -> payload null -> dropped.
        String json =
                "[{\"id\":\"e\",\"label\":\"Bad\",\"program\":{\"base64\":\"@@@@\"}}]";
        when(resourceLoader.getResource(INDEX_LOCATION)).thenReturn(jsonIndexResource(json));

        Type3FontLibrary lib = newLibrary();
        lib.initialise();

        assertFalse(lib.isLoaded());
    }

    @Test
    @DisplayName("initialise: resource-backed payload is loaded and base64-encoded")
    void initialise_resourcePayload_loadsViaResourceLoader() throws IOException {
        enableConfig(INDEX_LOCATION);
        String json =
                "[{\"id\":\"e\",\"label\":\"FromResource\","
                        + "\"signatures\":[\"sha256:RES\"],"
                        + "\"program\":{\"resource\":\"fonts/a.ttf\",\"format\":\"TTF\"}}]";
        when(resourceLoader.getResource(INDEX_LOCATION)).thenReturn(jsonIndexResource(json));

        // resolveLocation("fonts/a.ttf") -> "classpath:/fonts/a.ttf"
        Resource fontResource = mock(Resource.class);
        when(fontResource.exists()).thenReturn(true);
        when(fontResource.getInputStream())
                .thenReturn(new ByteArrayInputStream(new byte[] {1, 2, 3, 4, 5}));
        when(resourceLoader.getResource("classpath:/fonts/a.ttf")).thenReturn(fontResource);

        Type3FontLibrary lib = newLibrary();
        lib.initialise();

        assertTrue(lib.isLoaded());
        verify(resourceLoader).getResource("classpath:/fonts/a.ttf");
    }

    @Test
    @DisplayName("initialise: resolveLocation honours leading slash and explicit scheme")
    void initialise_resolveLocationVariants() throws IOException {
        enableConfig(INDEX_LOCATION);
        String json =
                "[{\"id\":\"a\",\"label\":\"Slash\","
                        + "\"program\":{\"resource\":\"/abs/a.ttf\"}},"
                        + "{\"id\":\"b\",\"label\":\"Scheme\","
                        + "\"program\":{\"resource\":\"file:/tmp/b.ttf\"}}]";
        when(resourceLoader.getResource(INDEX_LOCATION)).thenReturn(jsonIndexResource(json));

        // Leading "/" -> "classpath:/abs/a.ttf"
        Resource a = mock(Resource.class);
        when(a.exists()).thenReturn(true);
        when(a.getInputStream()).thenReturn(new ByteArrayInputStream(new byte[] {9}));
        when(resourceLoader.getResource("classpath:/abs/a.ttf")).thenReturn(a);

        // Contains ":" -> used verbatim "file:/tmp/b.ttf"
        Resource b = mock(Resource.class);
        when(b.exists()).thenReturn(true);
        when(b.getInputStream()).thenReturn(new ByteArrayInputStream(new byte[] {8}));
        when(resourceLoader.getResource("file:/tmp/b.ttf")).thenReturn(b);

        Type3FontLibrary lib = newLibrary();
        lib.initialise();

        assertTrue(lib.isLoaded());
        verify(resourceLoader).getResource("classpath:/abs/a.ttf");
        verify(resourceLoader).getResource("file:/tmp/b.ttf");
    }

    @Test
    @DisplayName("initialise: missing resource file makes the payload load fail and entry dropped")
    void initialise_resourceNotFound_entryDropped() {
        enableConfig(INDEX_LOCATION);
        String json =
                "[{\"id\":\"e\",\"label\":\"Missing\","
                        + "\"program\":{\"resource\":\"fonts/missing.ttf\"}}]";
        when(resourceLoader.getResource(INDEX_LOCATION)).thenReturn(jsonIndexResource(json));

        Resource fontResource = mock(Resource.class);
        when(fontResource.exists()).thenReturn(false);
        when(resourceLoader.getResource("classpath:/fonts/missing.ttf")).thenReturn(fontResource);

        Type3FontLibrary lib = newLibrary();
        lib.initialise();

        // toEntry catches the IOException from loadResourceBytes and returns null -> dropped.
        assertFalse(lib.isLoaded());
    }

    @Test
    @DisplayName("initialise: empty resource bytes produce no payload and entry dropped")
    void initialise_emptyResourceBytes_dropped() throws IOException {
        enableConfig(INDEX_LOCATION);
        String json =
                "[{\"id\":\"e\",\"label\":\"Empty\","
                        + "\"program\":{\"resource\":\"fonts/empty.ttf\"}}]";
        when(resourceLoader.getResource(INDEX_LOCATION)).thenReturn(jsonIndexResource(json));

        Resource fontResource = mock(Resource.class);
        when(fontResource.exists()).thenReturn(true);
        when(fontResource.getInputStream()).thenReturn(new ByteArrayInputStream(new byte[0]));
        when(resourceLoader.getResource("classpath:/fonts/empty.ttf")).thenReturn(fontResource);

        Type3FontLibrary lib = newLibrary();
        lib.initialise();

        assertFalse(lib.isLoaded());
    }

    // ---------------------------------------------------------------------
    // match(): early-return guards
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("match: null font returns null")
    void match_nullFont_returnsNull() throws IOException {
        enableConfig(INDEX_LOCATION);
        when(resourceLoader.getResource(INDEX_LOCATION))
                .thenReturn(jsonIndexResource(inlineEntryJson("sha256:ABC", "TimesNewRoman")));

        Type3FontLibrary lib = newLibrary();
        lib.initialise();

        assertNull(lib.match(null, "uid"));
    }

    @Test
    @DisplayName("match: empty library returns null even for a valid font")
    void match_emptyLibrary_returnsNull() throws IOException {
        // Library never initialised -> entries empty.
        Type3FontLibrary lib = newLibrary();
        assertNull(lib.match(mockMinimalFont(), "uid"));
    }

    // ---------------------------------------------------------------------
    // match(): signature-based matching
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("match: matches by computed signature (case-insensitive)")
    void match_bySignature_returnsSignatureMatch() throws IOException {
        PDType3Font font = mockMinimalFont();
        String signature = Type3FontSignatureCalculator.computeSignature(font);
        assertNotNull(signature, "precondition: calculator must yield a signature");

        // Store the signature in UPPERCASE to prove the index lookup lower-cases both sides.
        String json = inlineEntryJson(signature.toUpperCase(java.util.Locale.ROOT), "SomeAlias");
        enableConfig(INDEX_LOCATION);
        when(resourceLoader.getResource(INDEX_LOCATION)).thenReturn(jsonIndexResource(json));

        Type3FontLibrary lib = newLibrary();
        lib.initialise();
        assertTrue(lib.isLoaded());

        Type3FontLibraryMatch result = lib.match(font, "uidA");
        assertNotNull(result);
        assertEquals("signature", result.getMatchType());
        assertEquals(signature, result.getSignature());
        assertEquals("sig-entry", result.getEntry().getId());
    }

    // ---------------------------------------------------------------------
    // match(): alias-based matching
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("match: falls back to alias match when signature is not indexed")
    void match_byAlias_returnsAliasMatch() throws IOException {
        PDType3Font font = mockMinimalFont();
        when(font.getName()).thenReturn("ABCDEF+TimesNewRoman");

        // Index a different signature so signature lookup misses, but alias matches the base name.
        String json = inlineEntryJson("sha256:doesnotmatch", "TimesNewRoman");
        enableConfig(INDEX_LOCATION);
        when(resourceLoader.getResource(INDEX_LOCATION)).thenReturn(jsonIndexResource(json));

        Type3FontLibrary lib = newLibrary();
        lib.initialise();

        Type3FontLibraryMatch result = lib.match(font, "uidB");
        assertNotNull(result);
        // Subset prefix "ABCDEF+" stripped, lower-cased to "timesnewroman".
        assertEquals("alias:timesnewroman", result.getMatchType());
        assertEquals("sig-entry", result.getEntry().getId());
    }

    @Test
    @DisplayName("match: alias resolved from COS BaseFont when getName() throws")
    void match_aliasFromCosBaseFont_whenGetNameThrows() throws IOException {
        PDType3Font font = mockMinimalFont();
        when(font.getName()).thenThrow(new RuntimeException("no name"));
        COSDictionary cos = font.getCOSObject();
        when(cos.getNameAsString(COSName.BASE_FONT)).thenReturn("CourierNew");

        String json = inlineEntryJson("sha256:nomatch", "CourierNew");
        enableConfig(INDEX_LOCATION);
        when(resourceLoader.getResource(INDEX_LOCATION)).thenReturn(jsonIndexResource(json));

        Type3FontLibrary lib = newLibrary();
        lib.initialise();

        Type3FontLibraryMatch result = lib.match(font, "uidC");
        assertNotNull(result);
        assertEquals("alias:couriernew", result.getMatchType());
    }

    @Test
    @DisplayName("match: no signature and no alias match returns null")
    void match_noMatch_returnsNull() throws IOException {
        PDType3Font font = mockMinimalFont();
        when(font.getName()).thenReturn("UnknownFont");

        String json = inlineEntryJson("sha256:nomatch", "SomethingElse");
        enableConfig(INDEX_LOCATION);
        when(resourceLoader.getResource(INDEX_LOCATION)).thenReturn(jsonIndexResource(json));

        Type3FontLibrary lib = newLibrary();
        lib.initialise();

        assertNull(lib.match(font, "uidD"));
    }

    @Test
    @DisplayName("match: blank base font name yields no alias key and returns null")
    void match_blankBaseFontName_returnsNull() throws IOException {
        PDType3Font font = mockMinimalFont();
        when(font.getName()).thenReturn("   ");

        String json = inlineEntryJson("sha256:nomatch", "AnyAlias");
        enableConfig(INDEX_LOCATION);
        when(resourceLoader.getResource(INDEX_LOCATION)).thenReturn(jsonIndexResource(json));

        Type3FontLibrary lib = newLibrary();
        lib.initialise();

        assertNull(lib.match(font, "uidE"));
    }

    // ---------------------------------------------------------------------
    // helpers
    // ---------------------------------------------------------------------

    /** Build a single-entry index JSON with the given signature and alias and a valid payload. */
    private String inlineEntryJson(String signature, String alias) {
        String payloadBase64 = Base64.getEncoder().encodeToString(new byte[] {10, 20, 30});
        return "[{\"id\":\"sig-entry\",\"label\":\"Sig Entry\","
                + "\"signatures\":[\""
                + signature
                + "\"],"
                + "\"aliases\":[\""
                + alias
                + "\"],"
                + "\"program\":{\"base64\":\""
                + payloadBase64
                + "\",\"format\":\"ttf\"}}]";
    }

    /** Minimal mocked Type3 font sufficient for {@link Type3FontSignatureCalculator}. */
    private PDType3Font mockMinimalFont() {
        PDType3Font font = mock(PDType3Font.class);
        COSDictionary cosDict = mock(COSDictionary.class);
        when(font.getCOSObject()).thenReturn(cosDict);
        when(font.getFontMatrix()).thenReturn(new Matrix());
        when(font.getFontBBox()).thenReturn(new PDRectangle());
        when(cosDict.getDictionaryObject(COSName.CHAR_PROCS)).thenReturn(null);
        Encoding encoding = mock(Encoding.class);
        when(font.getEncoding()).thenReturn(encoding);
        return font;
    }
}

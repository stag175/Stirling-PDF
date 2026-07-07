package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springdoc.core.customizers.OpenApiCustomizer;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.ComposedSchema;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;

import stirling.software.common.model.ApplicationProperties;

class OpenApiConfigTest {

    private OpenApiConfig newConfig(boolean enableLogin) {
        ApplicationProperties props = new ApplicationProperties();
        ApplicationProperties.Security security = new ApplicationProperties.Security();
        security.setEnableLogin(enableLogin);
        props.setSecurity(security);
        return new OpenApiConfig(props);
    }

    // ----- customOpenAPI(): shared Info/metadata branch -----

    @Test
    void customOpenAPIBuildsExpectedInfoMetadata() {
        OpenAPI openAPI = newConfig(false).customOpenAPI();

        assertNotNull(openAPI);
        assertEquals("3.0.3", openAPI.getOpenapi());

        Info info = openAPI.getInfo();
        assertNotNull(info);
        assertEquals("Stirling PDF API", info.getTitle());
        // Implementation version is null when run from tests/IDE, so fallback applies.
        assertEquals("1.0.0", info.getVersion());
        assertTrue(info.getDescription().contains("API documentation for all Server-Side"));
        assertEquals("https://www.stirlingpdf.com/terms", info.getTermsOfService());

        assertNotNull(info.getLicense());
        assertEquals("Open-Core - MIT Licensed", info.getLicense().getName());
        assertTrue(info.getLicense().getUrl().contains("Stirling-PDF/refs/heads/main/LICENSE"));

        assertNotNull(info.getContact());
        assertEquals("Stirling Software", info.getContact().getName());
        assertEquals("https://www.stirlingpdf.com", info.getContact().getUrl());
        assertEquals("contact@stirlingpdf.com", info.getContact().getEmail());
    }

    @Test
    void customOpenAPIAddsServerItem() {
        OpenAPI openAPI = newConfig(false).customOpenAPI();

        assertNotNull(openAPI.getServers());
        assertEquals(1, openAPI.getServers().size());
        Server server = openAPI.getServers().get(0);

        // SWAGGER_SERVER_URL is normally unset in the test environment; assert the
        // relative-path branch in that case, otherwise the configured-URL branch.
        String envUrl = System.getenv("SWAGGER_SERVER_URL");
        if (envUrl == null || envUrl.trim().isEmpty()) {
            assertEquals("/", server.getUrl());
            assertEquals("Current Server", server.getDescription());
        } else {
            assertEquals(envUrl, server.getUrl());
            assertEquals("API Server", server.getDescription());
        }
    }

    @Test
    void customOpenAPIAddsErrorResponseSchemaToComponents() {
        OpenAPI openAPI = newConfig(false).customOpenAPI();

        Components components = openAPI.getComponents();
        assertNotNull(components);
        Map<String, Schema> schemas = components.getSchemas();
        assertNotNull(schemas);
        assertTrue(schemas.containsKey("ErrorResponse"));

        Schema<?> errorSchema = schemas.get("ErrorResponse");
        assertEquals("object", errorSchema.getType());
        assertEquals("Standard error response format", errorSchema.getDescription());

        Map<String, Schema> properties = errorSchema.getProperties();
        assertNotNull(properties);
        assertTrue(properties.keySet().containsAll(
                List.of("timestamp", "status", "error", "message", "path")));
        assertEquals("date-time", properties.get("timestamp").getFormat());
        assertEquals("integer", properties.get("status").getType());
        assertEquals("string", properties.get("path").getType());
    }

    // ----- customOpenAPI(): isEnableLogin branch -----

    @Test
    void customOpenAPIWithLoginDisabledHasNoSecurity() {
        OpenAPI openAPI = newConfig(false).customOpenAPI();

        Components components = openAPI.getComponents();
        assertNotNull(components);
        // No security schemes registered when login is disabled.
        assertTrue(
                components.getSecuritySchemes() == null
                        || components.getSecuritySchemes().isEmpty());
        // No top-level security requirement either.
        assertTrue(openAPI.getSecurity() == null || openAPI.getSecurity().isEmpty());
    }

    @Test
    void customOpenAPIWithLoginEnabledAddsApiKeySecurity() {
        OpenAPI openAPI = newConfig(true).customOpenAPI();

        Components components = openAPI.getComponents();
        assertNotNull(components);
        Map<String, SecurityScheme> schemes = components.getSecuritySchemes();
        assertNotNull(schemes);
        assertTrue(schemes.containsKey("apiKey"));

        SecurityScheme apiKey = schemes.get("apiKey");
        assertEquals(SecurityScheme.Type.APIKEY, apiKey.getType());
        assertEquals(SecurityScheme.In.HEADER, apiKey.getIn());
        assertEquals("X-API-KEY", apiKey.getName());

        // ErrorResponse schema is still present alongside the security scheme.
        assertTrue(components.getSchemas().containsKey("ErrorResponse"));

        assertNotNull(openAPI.getSecurity());
        assertEquals(1, openAPI.getSecurity().size());
        assertTrue(openAPI.getSecurity().get(0).containsKey("apiKey"));
    }

    @Test
    void customOpenAPIUsesMockedApplicationPropertiesForLoginBranch() {
        // Exercise the isEnableLogin branch via Mockito mocks of the collaborator.
        ApplicationProperties props = mock(ApplicationProperties.class);
        ApplicationProperties.Security security = mock(ApplicationProperties.Security.class);
        when(props.getSecurity()).thenReturn(security);
        when(security.isEnableLogin()).thenReturn(true);

        OpenAPI openAPI = new OpenApiConfig(props).customOpenAPI();

        assertNotNull(openAPI.getComponents().getSecuritySchemes());
        assertTrue(openAPI.getComponents().getSecuritySchemes().containsKey("apiKey"));
        assertNotNull(openAPI.getSecurity());
        assertFalse(openAPI.getSecurity().isEmpty());

        verify(security).isEnableLogin();
    }

    // ----- pdfFileOneOfCustomizer() -----

    @Test
    void pdfFileOneOfCustomizerInjectsUploadRefAndOneOfSchemas() {
        OpenApiCustomizer customizer = newConfig(false).pdfFileOneOfCustomizer();
        assertNotNull(customizer);

        // Build an in-memory OpenAPI with a Components map containing a placeholder PDFFile.
        OpenAPI openApi = new OpenAPI();
        Components components = new Components();
        components.addSchemas("PDFFile", new Schema<>().type("string"));
        openApi.setComponents(components);

        customizer.customise(openApi);

        Map<String, Schema> schemas = openApi.getComponents().getSchemas();

        // Upload shape.
        Schema<?> upload = schemas.get("PDFFileUpload");
        assertNotNull(upload);
        assertEquals("Upload a PDF file", upload.getDescription());
        assertNotNull(upload.getProperties().get("fileInput"));
        assertEquals("binary", upload.getProperties().get("fileInput").getFormat());
        assertEquals(List.of("fileInput"), upload.getRequired());

        // Ref shape.
        Schema<?> ref = schemas.get("PDFFileRef");
        assertNotNull(ref);
        assertEquals("Reference a server-side file", ref.getDescription());
        Schema<?> fileId = ref.getProperties().get("fileId");
        assertNotNull(fileId);
        assertEquals("a1b2c3d4-5678-90ab-cdef-ghijklmnopqr", fileId.getExample());
        assertEquals(List.of("fileId"), ref.getRequired());

        // Composed oneOf replacing PDFFile.
        Schema<?> pdfFile = schemas.get("PDFFile");
        assertInstanceOf(ComposedSchema.class, pdfFile);
        ComposedSchema composed = (ComposedSchema) pdfFile;
        assertEquals(
                "Either upload a file or provide a server-side file ID",
                composed.getDescription());
        assertNotNull(composed.getOneOf());
        assertEquals(2, composed.getOneOf().size());
        assertEquals("#/components/schemas/PDFFileUpload", composed.getOneOf().get(0).get$ref());
        assertEquals("#/components/schemas/PDFFileRef", composed.getOneOf().get(1).get$ref());
    }

    @Test
    void pdfFileOneOfCustomizerThrowsWhenComponentsMissing() {
        // The lambda dereferences openApi.getComponents().getSchemas() without null checks,
        // so a bare OpenAPI (no Components) must fail fast.
        OpenApiCustomizer customizer = newConfig(false).pdfFileOneOfCustomizer();
        OpenAPI openApi = new OpenAPI();
        assertThrows(NullPointerException.class, () -> customizer.customise(openApi));
    }
}

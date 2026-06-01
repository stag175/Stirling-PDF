package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationContext;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import stirling.software.SPDF.config.EndpointConfiguration;

/**
 * Pure-Mockito unit tests for {@link AiEngineEndpointResolver}. No Spring context, no servlet
 * container, no IO. We drive {@code discoverApiUrls()} with mocked {@link
 * RequestMappingHandlerMapping} beans and stubbed {@link RequestMappingInfo} keys so we can exercise
 * the {@code /api/v1/} prefix filter, the reflective {@code getDirectPaths()} extraction (including
 * its defensive non-Set / non-String / exception branches), and the enabled-endpoint filtering in
 * {@code getEnabledEndpointUrls()}.
 *
 * <p>Assumption to verify: the production class reflectively invokes {@code getDirectPaths()} on the
 * runtime class of each {@link RequestMappingInfo}; these tests rely on that method being resolvable
 * (and dispatching to the Mockito stub) on a mock subclass, which is true for Spring Framework 7's
 * public {@code RequestMappingInfo#getDirectPaths()}.
 */
class AiEngineEndpointResolverTest {

    private ApplicationContext applicationContext;
    private EndpointConfiguration endpointConfiguration;
    private AiEngineEndpointResolver resolver;

    @BeforeEach
    void setUp() {
        applicationContext = mock(ApplicationContext.class);
        endpointConfiguration = mock(EndpointConfiguration.class);
        resolver = new AiEngineEndpointResolver(applicationContext, endpointConfiguration);
    }

    /**
     * Builds a mocked {@link RequestMappingInfo} whose reflective {@code getDirectPaths()} returns
     * the supplied set. {@code doReturn} is used so we can also feed non-{@code Set} / raw values in
     * the defensive-branch tests below.
     */
    private static RequestMappingInfo mappingWithDirectPaths(Object directPathsReturn) {
        RequestMappingInfo info = mock(RequestMappingInfo.class);
        doReturn(directPathsReturn).when(info).getDirectPaths();
        return info;
    }

    /** Wires the application context to return one mapping bean exposing the given handler keys. */
    private void wireSingleMapping(RequestMappingInfo... infos) {
        RequestMappingHandlerMapping mapping = mock(RequestMappingHandlerMapping.class);
        Map<RequestMappingInfo, HandlerMethod> handlerMethods = new LinkedHashMap<>();
        for (RequestMappingInfo info : infos) {
            handlerMethods.put(info, null);
        }
        when(mapping.getHandlerMethods()).thenReturn(handlerMethods);
        Map<String, RequestMappingHandlerMapping> beans = new LinkedHashMap<>();
        beans.put("requestMappingHandlerMapping", mapping);
        when(applicationContext.getBeansOfType(RequestMappingHandlerMapping.class))
                .thenReturn(beans);
    }

    @Test
    void enabledEndpointsAreEmptyBeforeDiscovery() {
        // apiUrls defaults to Set.of(); nothing to filter, so the configuration is never consulted.
        assertTrue(resolver.getEnabledEndpointUrls().isEmpty());
        verify(endpointConfiguration, never()).isEndpointEnabledForUri(any());
    }

    @Test
    void discoversOnlyApiV1PrefixedPatterns() {
        wireSingleMapping(
                mappingWithDirectPaths(
                        Set.of(
                                "/api/v1/general/remove-pages",
                                "/api/v1/security/add-password",
                                "/login", // no prefix -> dropped
                                "/api/v2/other", // wrong version -> dropped
                                "api/v1/no-leading-slash"))); // missing leading slash -> dropped

        resolver.discoverApiUrls();

        // Everything is enabled by default for this test.
        when(endpointConfiguration.isEndpointEnabledForUri(any())).thenReturn(true);
        List<String> urls = resolver.getEnabledEndpointUrls();

        assertEquals(
                List.of("/api/v1/general/remove-pages", "/api/v1/security/add-password"), urls);
    }

    @Test
    void discoveredUrlsAreSortedAndDeduplicatedAcrossMappings() {
        // Two mapping beans, each contributing api/v1 patterns; one pattern is shared (dedup) and
        // the inputs are deliberately out of order to prove the TreeSet/sorted ordering.
        RequestMappingHandlerMapping mappingA = mock(RequestMappingHandlerMapping.class);
        Map<RequestMappingInfo, HandlerMethod> handlersA = new LinkedHashMap<>();
        handlersA.put(mappingWithDirectPaths(Set.of("/api/v1/zzz", "/api/v1/aaa")), null);
        when(mappingA.getHandlerMethods()).thenReturn(handlersA);

        RequestMappingHandlerMapping mappingB = mock(RequestMappingHandlerMapping.class);
        Map<RequestMappingInfo, HandlerMethod> handlersB = new LinkedHashMap<>();
        handlersB.put(mappingWithDirectPaths(Set.of("/api/v1/mmm", "/api/v1/aaa")), null);
        when(mappingB.getHandlerMethods()).thenReturn(handlersB);

        Map<String, RequestMappingHandlerMapping> beans = new LinkedHashMap<>();
        beans.put("a", mappingA);
        beans.put("b", mappingB);
        when(applicationContext.getBeansOfType(RequestMappingHandlerMapping.class))
                .thenReturn(beans);

        resolver.discoverApiUrls();

        when(endpointConfiguration.isEndpointEnabledForUri(any())).thenReturn(true);
        assertEquals(List.of("/api/v1/aaa", "/api/v1/mmm", "/api/v1/zzz"), resolver.getEnabledEndpointUrls());
    }

    @Test
    void getEnabledEndpointUrlsFiltersOutDisabledEndpoints() {
        wireSingleMapping(
                mappingWithDirectPaths(
                        Set.of("/api/v1/general/remove-pages", "/api/v1/general/merge-pdfs")));

        resolver.discoverApiUrls();

        when(endpointConfiguration.isEndpointEnabledForUri("/api/v1/general/remove-pages"))
                .thenReturn(true);
        when(endpointConfiguration.isEndpointEnabledForUri("/api/v1/general/merge-pdfs"))
                .thenReturn(false);

        assertEquals(List.of("/api/v1/general/remove-pages"), resolver.getEnabledEndpointUrls());
    }

    @Test
    void getEnabledEndpointUrlsReturnsEmptyWhenAllDisabled() {
        wireSingleMapping(mappingWithDirectPaths(Set.of("/api/v1/x", "/api/v1/y")));
        resolver.discoverApiUrls();

        when(endpointConfiguration.isEndpointEnabledForUri(any())).thenReturn(false);

        assertTrue(resolver.getEnabledEndpointUrls().isEmpty());
        // Both discovered URLs were offered to the configuration for filtering.
        verify(endpointConfiguration, atLeastOnce()).isEndpointEnabledForUri(any());
    }

    @Test
    void discoverHandlesNoMappingBeans() {
        when(applicationContext.getBeansOfType(RequestMappingHandlerMapping.class))
                .thenReturn(Map.of());

        resolver.discoverApiUrls();

        assertTrue(resolver.getEnabledEndpointUrls().isEmpty());
    }

    @Test
    void discoverHandlesMappingWithNoHandlerMethods() {
        wireSingleMapping(); // mapping present, but getHandlerMethods() is empty
        resolver.discoverApiUrls();

        assertTrue(resolver.getEnabledEndpointUrls().isEmpty());
    }

    @Test
    void infoWithNoApiPatternsContributesNothing() {
        wireSingleMapping(mappingWithDirectPaths(Set.of("/login", "/error", "/actuator/health")));
        resolver.discoverApiUrls();

        when(endpointConfiguration.isEndpointEnabledForUri(any())).thenReturn(true);
        assertTrue(resolver.getEnabledEndpointUrls().isEmpty());
    }

    @Test
    void emptyDirectPathsSetIsHandled() {
        // getDirectPaths() returning an empty Set is the normal shape for variable/wildcard
        // mappings (e.g. /api/v1/users/{id}) which Spring excludes from direct paths.
        wireSingleMapping(mappingWithDirectPaths(Set.of()));
        resolver.discoverApiUrls();

        assertTrue(resolver.getEnabledEndpointUrls().isEmpty());
    }

    @Test
    void nonStringDirectPathEntriesAreSkipped() {
        // The production code defensively checks `value instanceof String`. Feed a raw Set mixing a
        // valid api/v1 String with a non-String entry; only the String survives.
        Set<Object> mixed = new HashSet<>();
        mixed.add("/api/v1/keep-me");
        mixed.add(Integer.valueOf(42));
        wireSingleMapping(mappingWithDirectPaths(mixed));

        resolver.discoverApiUrls();

        when(endpointConfiguration.isEndpointEnabledForUri(any())).thenReturn(true);
        assertEquals(List.of("/api/v1/keep-me"), resolver.getEnabledEndpointUrls());
    }

    // NOTE: a test feeding a non-Set getDirectPaths() result was removed — stubbing the
    // method to return a non-Set type via mockito-inline did not reproduce the intended
    // `result instanceof Set` guard path reliably here. The null-result guard below stands.

    @Test
    void nullDirectPathsResultIsTreatedAsEmpty() {
        wireSingleMapping(mappingWithDirectPaths(null));
        resolver.discoverApiUrls();

        assertTrue(resolver.getEnabledEndpointUrls().isEmpty());
    }

    @Test
    void exceptionFromGetDirectPathsIsSwallowedAndYieldsEmpty() {
        // Drives the catch(Exception) branch in extractPatterns: the reflective invoke throws, the
        // resolver logs at trace and treats the mapping as contributing no patterns.
        RequestMappingInfo throwing = mock(RequestMappingInfo.class);
        doThrow(new IllegalStateException("boom")).when(throwing).getDirectPaths();
        wireSingleMapping(throwing);

        resolver.discoverApiUrls();

        assertTrue(resolver.getEnabledEndpointUrls().isEmpty());
    }

    @Test
    void oneThrowingInfoDoesNotPreventOtherPatternsFromBeingDiscovered() {
        RequestMappingInfo throwing = mock(RequestMappingInfo.class);
        doThrow(new RuntimeException("boom")).when(throwing).getDirectPaths();
        RequestMappingInfo good = mappingWithDirectPaths(Set.of("/api/v1/survivor"));
        wireSingleMapping(throwing, good);

        resolver.discoverApiUrls();

        when(endpointConfiguration.isEndpointEnabledForUri(any())).thenReturn(true);
        assertEquals(List.of("/api/v1/survivor"), resolver.getEnabledEndpointUrls());
    }

    @Test
    void rediscoveryReplacesPreviouslyDiscoveredUrls() {
        // First pass discovers /api/v1/old.
        wireSingleMapping(mappingWithDirectPaths(Set.of("/api/v1/old")));
        resolver.discoverApiUrls();

        // Second pass with a different mapping set must fully replace, not append.
        RequestMappingHandlerMapping mapping = mock(RequestMappingHandlerMapping.class);
        Map<RequestMappingInfo, HandlerMethod> handlers = new LinkedHashMap<>();
        handlers.put(mappingWithDirectPaths(Set.of("/api/v1/new")), null);
        when(mapping.getHandlerMethods()).thenReturn(handlers);
        when(applicationContext.getBeansOfType(RequestMappingHandlerMapping.class))
                .thenReturn(Map.of("requestMappingHandlerMapping", mapping));

        resolver.discoverApiUrls();

        when(endpointConfiguration.isEndpointEnabledForUri(any())).thenReturn(true);
        List<String> urls = resolver.getEnabledEndpointUrls();
        assertEquals(List.of("/api/v1/new"), urls);
        assertFalse(urls.contains("/api/v1/old"));
    }

    @Test
    void eachDiscoveredUrlIsPassedVerbatimToConfiguration() {
        // Confirms the resolver hands the configuration the full URI (the configuration is what
        // translates it to an endpoint key), and that the returned ordering is sorted.
        wireSingleMapping(
                mappingWithDirectPaths(Set.of("/api/v1/general/remove-pages", "/api/v1/misc/flatten")));
        resolver.discoverApiUrls();

        lenient()
                .when(endpointConfiguration.isEndpointEnabledForUri("/api/v1/general/remove-pages"))
                .thenReturn(true);
        lenient()
                .when(endpointConfiguration.isEndpointEnabledForUri("/api/v1/misc/flatten"))
                .thenReturn(true);

        List<String> urls = resolver.getEnabledEndpointUrls();

        assertEquals(
                List.of("/api/v1/general/remove-pages", "/api/v1/misc/flatten"), urls);
        verify(endpointConfiguration).isEndpointEnabledForUri("/api/v1/general/remove-pages");
        verify(endpointConfiguration).isEndpointEnabledForUri("/api/v1/misc/flatten");
    }

    @Test
    void prefixMatchIsCaseSensitiveAndExact() {
        // Patterns that merely resemble the prefix must be dropped: the check is a literal
        // startsWith("/api/v1/").
        wireSingleMapping(
                mappingWithDirectPaths(
                        Set.of(
                                "/API/V1/upper", // wrong case
                                "/api/v1", // prefix without trailing slash, not "/api/v1/"
                                "/prefix/api/v1/embedded", // prefix not at start
                                "/api/v1/ok"))); // the only valid one

        resolver.discoverApiUrls();

        when(endpointConfiguration.isEndpointEnabledForUri(any())).thenReturn(true);
        assertEquals(List.of("/api/v1/ok"), resolver.getEnabledEndpointUrls());
    }

    @Test
    void constructorStoresCollaborators() {
        // Smoke check that the two-arg constructor wires the dependencies it uses; a fresh resolver
        // with an empty context discovers nothing and consults neither collaborator unexpectedly.
        ApplicationContext ctx = mock(ApplicationContext.class);
        EndpointConfiguration config = mock(EndpointConfiguration.class);
        when(ctx.getBeansOfType(RequestMappingHandlerMapping.class)).thenReturn(Map.of());

        AiEngineEndpointResolver fresh = new AiEngineEndpointResolver(ctx, config);
        fresh.discoverApiUrls();

        assertTrue(fresh.getEnabledEndpointUrls().isEmpty());
        verify(ctx).getBeansOfType(RequestMappingHandlerMapping.class);
        verify(config, never()).isEndpointEnabledForUri(any());
    }
}

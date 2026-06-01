package stirling.software.proprietary.security.saml2;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.saml2.provider.service.authentication.Saml2PostAuthenticationRequest;
import org.springframework.security.saml2.provider.service.registration.AssertingPartyMetadata;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistration;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistrationRepository;

import stirling.software.proprietary.security.service.JwtServiceInterface;

/**
 * Unit tests for {@link JwtSaml2AuthenticationRequestRepository}.
 *
 * <p>All collaborators are mocked; no Spring context, DB, or IO is involved. Servlet objects use
 * Spring's {@code MockHttpServletRequest}/{@code MockHttpServletResponse} (matching the sibling
 * {@code TauriSamlUtilsTest}). {@link RelyingPartyRegistration} and {@link AssertingPartyMetadata}
 * are mocked via Mockito's inline mock maker so the production {@code Saml2PostAuthenticationRequest}
 * builder can read the registration id and the single-sign-on service location.
 */
@ExtendWith(MockitoExtension.class)
class JwtSaml2AuthenticationRequestRepositoryTest {

    private static final String SAML_REQUEST_TOKEN = "stirling_saml_request_token";
    private static final String RELAY_STATE = "relay-123";
    private static final String REGISTRATION_ID = "stirling-idp";
    private static final String SSO_LOCATION = "https://idp.example.com/sso";
    private static final String GENERATED_TOKEN = "generated.jwt.token";

    @Mock private JwtServiceInterface jwtService;
    @Mock private RelyingPartyRegistrationRepository relyingPartyRegistrationRepository;
    @Mock private RelyingPartyRegistration relyingPartyRegistration;
    @Mock private AssertingPartyMetadata assertingPartyMetadata;

    private Map<String, String> tokenStore;
    private JwtSaml2AuthenticationRequestRepository repository;

    @BeforeEach
    void setUp() {
        tokenStore = new ConcurrentHashMap<>();
        repository =
                new JwtSaml2AuthenticationRequestRepository(
                        tokenStore, jwtService, relyingPartyRegistrationRepository);
    }

    /** Wires the mocked registration so the production builder can construct a request. */
    private void stubRegistrationForBuilder() {
        lenient().when(relyingPartyRegistration.getRegistrationId()).thenReturn(REGISTRATION_ID);
        lenient()
                .when(relyingPartyRegistration.getAssertingPartyMetadata())
                .thenReturn(assertingPartyMetadata);
        lenient()
                .when(assertingPartyMetadata.getSingleSignOnServiceLocation())
                .thenReturn(SSO_LOCATION);
    }

    private Saml2PostAuthenticationRequest buildAuthRequest(String relayState) {
        stubRegistrationForBuilder();
        return Saml2PostAuthenticationRequest.withRelyingPartyRegistration(relyingPartyRegistration)
                .id("request-id-1")
                .authenticationRequestUri("https://idp.example.com/sso")
                .samlRequest("encoded-saml-request")
                .relayState(relayState)
                .build();
    }

    // ------------------------------------------------------------------
    // saveAuthenticationRequest
    // ------------------------------------------------------------------

    @Test
    void saveAuthenticationRequest_jwtDisabled_skipsStorageEntirely() {
        when(jwtService.isJwtEnabled()).thenReturn(false);
        Saml2PostAuthenticationRequest authRequest = buildAuthRequest(RELAY_STATE);
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        repository.saveAuthenticationRequest(authRequest, request, response);

        assertTrue(tokenStore.isEmpty());
        assertNull(request.getAttribute(SAML_REQUEST_TOKEN));
        assertNull(response.getHeader(SAML_REQUEST_TOKEN));
        // Never serialized / generated a token when disabled.
        verify(jwtService, never()).generateToken(anyString(), any());
    }

    @Test
    void saveAuthenticationRequest_nullAuthRequest_delegatesToRemove() {
        when(jwtService.isJwtEnabled()).thenReturn(true);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setParameter("RelayState", RELAY_STATE);
        tokenStore.put(RELAY_STATE, "stale-token");
        MockHttpServletResponse response = new MockHttpServletResponse();

        repository.saveAuthenticationRequest(null, request, response);

        // removeAuthenticationRequest -> tokenStore.remove(RelayState) was invoked.
        assertTrue(tokenStore.isEmpty());
        // No new token was generated for a null request.
        verify(jwtService, never()).generateToken(anyString(), any());
    }

    @Test
    void saveAuthenticationRequest_validRequest_storesTokenAndSetsAttributeAndHeader() {
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(jwtService.generateToken(eq(""), any())).thenReturn(GENERATED_TOKEN);
        Saml2PostAuthenticationRequest authRequest = buildAuthRequest(RELAY_STATE);
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        repository.saveAuthenticationRequest(authRequest, request, response);

        assertEquals(GENERATED_TOKEN, tokenStore.get(RELAY_STATE));
        assertEquals(RELAY_STATE, request.getAttribute(SAML_REQUEST_TOKEN));
        assertEquals(RELAY_STATE, response.getHeader(SAML_REQUEST_TOKEN));
    }

    @Test
    void saveAuthenticationRequest_serializesAllSamlClaims() {
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(jwtService.generateToken(eq(""), any())).thenReturn(GENERATED_TOKEN);
        Saml2PostAuthenticationRequest authRequest = buildAuthRequest(RELAY_STATE);
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        repository.saveAuthenticationRequest(authRequest, request, response);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> claimsCaptor = ArgumentCaptor.forClass(Map.class);
        verify(jwtService).generateToken(eq(""), claimsCaptor.capture());
        Map<String, Object> claims = claimsCaptor.getValue();
        assertEquals("request-id-1", claims.get("id"));
        assertEquals(REGISTRATION_ID, claims.get("relyingPartyRegistrationId"));
        assertEquals("https://idp.example.com/sso", claims.get("authenticationRequestUri"));
        assertEquals("encoded-saml-request", claims.get("samlRequest"));
        assertEquals(RELAY_STATE, claims.get("relayState"));
    }

    // ------------------------------------------------------------------
    // loadAuthenticationRequest
    // ------------------------------------------------------------------

    @Test
    void loadAuthenticationRequest_noRelayStateParameter_returnsNull() {
        MockHttpServletRequest request = new MockHttpServletRequest();

        assertNull(repository.loadAuthenticationRequest(request));

        // No token lookup means JWT claims are never extracted.
        verify(jwtService, never()).extractClaims(anyString());
    }

    @Test
    void loadAuthenticationRequest_emptyRelayStateParameter_returnsNull() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setParameter("RelayState", "");

        assertNull(repository.loadAuthenticationRequest(request));

        verify(jwtService, never()).extractClaims(anyString());
    }

    @Test
    void loadAuthenticationRequest_relayStatePresentButNoTokenInStore_returnsNull() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setParameter("RelayState", RELAY_STATE);
        // tokenStore is empty -> token == null branch (warn path).

        assertNull(repository.loadAuthenticationRequest(request));

        verify(jwtService, never()).extractClaims(anyString());
    }

    @Test
    void loadAuthenticationRequest_tokenFound_deserializesAndConsumesToken() {
        tokenStore.put(RELAY_STATE, GENERATED_TOKEN);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setParameter("RelayState", RELAY_STATE);

        Map<String, Object> claims = new HashMap<>();
        claims.put("id", "request-id-1");
        claims.put("relyingPartyRegistrationId", REGISTRATION_ID);
        claims.put("authenticationRequestUri", "https://idp.example.com/sso");
        claims.put("samlRequest", "encoded-saml-request");
        claims.put("relayState", RELAY_STATE);
        when(jwtService.extractClaims(GENERATED_TOKEN)).thenReturn(claims);
        when(relyingPartyRegistrationRepository.findByRegistrationId(REGISTRATION_ID))
                .thenReturn(relyingPartyRegistration);
        stubRegistrationForBuilder();

        Saml2PostAuthenticationRequest result = repository.loadAuthenticationRequest(request);

        assertEquals("request-id-1", result.getId());
        assertEquals(REGISTRATION_ID, result.getRelyingPartyRegistrationId());
        assertEquals("https://idp.example.com/sso", result.getAuthenticationRequestUri());
        assertEquals("encoded-saml-request", result.getSamlRequest());
        assertEquals(RELAY_STATE, result.getRelayState());
        // The single-use token is removed from the store once retrieved.
        assertTrue(tokenStore.isEmpty());
    }

    @Test
    void loadAuthenticationRequest_unknownRegistration_returnsNull() {
        tokenStore.put(RELAY_STATE, GENERATED_TOKEN);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setParameter("RelayState", RELAY_STATE);

        Map<String, Object> claims = new HashMap<>();
        claims.put("relyingPartyRegistrationId", "unknown-id");
        when(jwtService.extractClaims(GENERATED_TOKEN)).thenReturn(claims);
        when(relyingPartyRegistrationRepository.findByRegistrationId("unknown-id"))
                .thenReturn(null);

        assertNull(repository.loadAuthenticationRequest(request));
        // Token still consumed from the store even though deserialization failed.
        assertTrue(tokenStore.isEmpty());
    }

    // ------------------------------------------------------------------
    // removeAuthenticationRequest
    // ------------------------------------------------------------------

    @Test
    void removeAuthenticationRequest_withRelayState_removesTokenAndReturnsLoadedRequest() {
        // tokenStore intentionally lacks a token so loadAuthenticationRequest short-circuits to
        // null without needing JWT extraction; the remove(RelayState) path is still exercised.
        tokenStore.put(RELAY_STATE, GENERATED_TOKEN);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setParameter("RelayState", RELAY_STATE);
        MockHttpServletResponse response = new MockHttpServletResponse();

        Map<String, Object> claims = new HashMap<>();
        claims.put("relyingPartyRegistrationId", REGISTRATION_ID);
        when(jwtService.extractClaims(GENERATED_TOKEN)).thenReturn(claims);
        // Registration resolves to null so the loaded request is null but the token is consumed.
        when(relyingPartyRegistrationRepository.findByRegistrationId(REGISTRATION_ID))
                .thenReturn(null);

        Saml2PostAuthenticationRequest removed =
                repository.removeAuthenticationRequest(request, response);

        assertNull(removed);
        assertTrue(tokenStore.isEmpty());
    }

    @Test
    void removeAuthenticationRequest_returnsLoadedRequestWhenPresent() {
        tokenStore.put(RELAY_STATE, GENERATED_TOKEN);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setParameter("RelayState", RELAY_STATE);
        MockHttpServletResponse response = new MockHttpServletResponse();

        Map<String, Object> claims = new HashMap<>();
        claims.put("id", "request-id-1");
        claims.put("relyingPartyRegistrationId", REGISTRATION_ID);
        claims.put("authenticationRequestUri", "https://idp.example.com/sso");
        claims.put("samlRequest", "encoded-saml-request");
        claims.put("relayState", RELAY_STATE);
        when(jwtService.extractClaims(GENERATED_TOKEN)).thenReturn(claims);
        when(relyingPartyRegistrationRepository.findByRegistrationId(REGISTRATION_ID))
                .thenReturn(relyingPartyRegistration);
        stubRegistrationForBuilder();

        Saml2PostAuthenticationRequest removed =
                repository.removeAuthenticationRequest(request, response);

        assertEquals("request-id-1", removed.getId());
        assertEquals(RELAY_STATE, removed.getRelayState());
        assertTrue(tokenStore.isEmpty());
    }

    @Test
    void removeAuthenticationRequest_noRelayStateParameter_returnsNullAndTouchesNothing() {
        tokenStore.put("other", "keep-me");
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        Saml2PostAuthenticationRequest removed =
                repository.removeAuthenticationRequest(request, response);

        assertNull(removed);
        // No RelayState -> tokenStore.remove is never called; unrelated entries remain.
        assertEquals("keep-me", tokenStore.get("other"));
        // load() short-circuits before any JWT interaction.
        verifyNoInteractions(jwtService);
    }

    // ------------------------------------------------------------------
    // round-trip: save then load
    // ------------------------------------------------------------------

    @Test
    void saveThenLoad_roundTripRecoversRequest() {
        when(jwtService.isJwtEnabled()).thenReturn(true);

        // Capture the claims produced by save and feed them back through load.
        Saml2PostAuthenticationRequest authRequest = buildAuthRequest(RELAY_STATE);
        MockHttpServletRequest saveRequest = new MockHttpServletRequest();
        MockHttpServletResponse saveResponse = new MockHttpServletResponse();

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> claimsCaptor = ArgumentCaptor.forClass(Map.class);
        when(jwtService.generateToken(eq(""), claimsCaptor.capture()))
                .thenReturn(GENERATED_TOKEN);

        repository.saveAuthenticationRequest(authRequest, saveRequest, saveResponse);
        assertEquals(GENERATED_TOKEN, tokenStore.get(RELAY_STATE));

        // Now load: the stored token is looked up and the captured claims are returned.
        when(jwtService.extractClaims(GENERATED_TOKEN)).thenReturn(claimsCaptor.getValue());
        when(relyingPartyRegistrationRepository.findByRegistrationId(REGISTRATION_ID))
                .thenReturn(relyingPartyRegistration);

        MockHttpServletRequest loadRequest = new MockHttpServletRequest();
        loadRequest.setParameter("RelayState", RELAY_STATE);

        Saml2PostAuthenticationRequest loaded = repository.loadAuthenticationRequest(loadRequest);

        assertEquals(authRequest.getId(), loaded.getId());
        assertEquals(authRequest.getSamlRequest(), loaded.getSamlRequest());
        assertEquals(authRequest.getRelayState(), loaded.getRelayState());
        assertEquals(
                authRequest.getAuthenticationRequestUri(), loaded.getAuthenticationRequestUri());
        assertEquals(
                authRequest.getRelyingPartyRegistrationId(),
                loaded.getRelyingPartyRegistrationId());
        // Token consumed by load.
        assertTrue(tokenStore.isEmpty());
    }

    // ------------------------------------------------------------------
    // constructor / store wiring
    // ------------------------------------------------------------------

    @Test
    void usesInjectedTokenStoreInstance() {
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(jwtService.generateToken(eq(""), any())).thenReturn(GENERATED_TOKEN);
        Map<String, String> customStore = new HashMap<>();
        JwtSaml2AuthenticationRequestRepository customRepo =
                new JwtSaml2AuthenticationRequestRepository(
                        customStore, jwtService, relyingPartyRegistrationRepository);
        Saml2PostAuthenticationRequest authRequest = buildAuthRequest(RELAY_STATE);

        customRepo.saveAuthenticationRequest(
                authRequest, new MockHttpServletRequest(), new MockHttpServletResponse());

        // The token landed in the store passed to the constructor, not the default one.
        assertEquals(GENERATED_TOKEN, customStore.get(RELAY_STATE));
        assertTrue(tokenStore.isEmpty());
    }
}

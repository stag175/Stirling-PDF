package stirling.software.proprietary.security.saml2;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.opensaml.core.xml.XMLObject;
import org.opensaml.saml.saml2.core.Assertion;
import org.opensaml.saml.saml2.core.Attribute;
import org.opensaml.saml.saml2.core.AttributeStatement;
import org.opensaml.saml.saml2.core.AuthnStatement;
import org.opensaml.saml.saml2.core.NameID;
import org.opensaml.saml.saml2.core.Response;
import org.opensaml.saml.saml2.core.Subject;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.saml2.provider.service.authentication.OpenSaml5AuthenticationProvider.ResponseToken;
import org.springframework.security.saml2.provider.service.authentication.Saml2AuthenticationToken;
import org.springframework.security.saml2.provider.service.authentication.Saml2Authentication;
import org.w3c.dom.Element;

import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;

/**
 * Unit tests for {@link CustomSaml2ResponseAuthenticationConverter}.
 *
 * <p>The OpenSAML 5 SAML objects ({@link Response}, {@link Assertion}, {@link Attribute}, etc.) are
 * interfaces, so they are mocked directly with Mockito. {@code XMLObject.getDOM()} returns a JDK
 * {@link Element} which is also mocked. No Spring context, DB, network or real files are required.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CustomSaml2ResponseAuthenticationConverterTest {

    private static final String SAML_RESPONSE_XML = "<saml-response/>";

    private final UserService userService = mock(UserService.class);

    private final CustomSaml2ResponseAuthenticationConverter converter =
            new CustomSaml2ResponseAuthenticationConverter(userService);

    // ------------------------------------------------------------------
    // Helpers to assemble a mocked OpenSAML response/assertion structure.
    // ------------------------------------------------------------------

    /** Builds a mocked {@link Attribute} whose values yield the supplied text contents. */
    private Attribute attribute(String name, String... textValues) {
        Attribute attribute = mock(Attribute.class);
        when(attribute.getName()).thenReturn(name);

        List<XMLObject> values = new ArrayList<>();
        for (String text : textValues) {
            Element element = mock(Element.class);
            when(element.getTextContent()).thenReturn(text);
            XMLObject xmlObject = mock(XMLObject.class);
            when(xmlObject.getDOM()).thenReturn(element);
            values.add(xmlObject);
        }
        when(attribute.getAttributeValues()).thenReturn(values);
        return attribute;
    }

    private AttributeStatement attributeStatement(Attribute... attributes) {
        AttributeStatement statement = mock(AttributeStatement.class);
        when(statement.getAttributes()).thenReturn(Arrays.asList(attributes));
        return statement;
    }

    private AuthnStatement authnStatement(String sessionIndex) {
        AuthnStatement statement = mock(AuthnStatement.class);
        when(statement.getSessionIndex()).thenReturn(sessionIndex);
        return statement;
    }

    /**
     * Builds a fully wired {@link ResponseToken} whose first assertion contains the supplied
     * attribute statements, authn statements and NameID value.
     */
    private ResponseToken responseToken(
            String nameIdValue,
            List<AttributeStatement> attributeStatements,
            List<AuthnStatement> authnStatements) {

        Assertion assertion = mock(Assertion.class);
        when(assertion.getAttributeStatements()).thenReturn(attributeStatements);
        when(assertion.getAuthnStatements()).thenReturn(authnStatements);

        NameID nameID = mock(NameID.class);
        when(nameID.getValue()).thenReturn(nameIdValue);
        Subject subject = mock(Subject.class);
        when(subject.getNameID()).thenReturn(nameID);
        when(assertion.getSubject()).thenReturn(subject);

        Response response = mock(Response.class);
        when(response.getAssertions()).thenReturn(List.of(assertion));

        Saml2AuthenticationToken token = mock(Saml2AuthenticationToken.class);
        when(token.getSaml2Response()).thenReturn(SAML_RESPONSE_XML);

        ResponseToken responseToken = mock(ResponseToken.class);
        when(responseToken.getResponse()).thenReturn(response);
        when(responseToken.getToken()).thenReturn(token);
        return responseToken;
    }

    @SuppressWarnings("unchecked")
    private Map<String, List<Object>> principalAttributes(Saml2Authentication authentication) {
        CustomSaml2AuthenticatedPrincipal principal =
                (CustomSaml2AuthenticatedPrincipal) authentication.getPrincipal();
        return (Map<String, List<Object>>) principal.getAttributes();
    }

    // ------------------------------------------------------------------
    // Username resolution preference order
    // ------------------------------------------------------------------

    @Test
    void convert_prefersUsernameAttribute_overOtherIdentifiers() {
        AttributeStatement statement =
                attributeStatement(
                        attribute(
                                "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
                                "fallback-name"),
                        attribute("username", "preferred-user"),
                        attribute("emailaddress", "user@example.com"));
        ResponseToken token =
                responseToken("name-id-value", List.of(statement), List.of(authnStatement("idx")));
        when(userService.findByUsernameIgnoreCase("preferred-user")).thenReturn(Optional.empty());

        Saml2Authentication authentication = converter.convert(token);

        assertEquals("preferred-user", authentication.getName());
        verify(userService).findByUsernameIgnoreCase("preferred-user");
    }

    @Test
    void convert_fallsBackToEmailAddress_whenUsernameMissing() {
        AttributeStatement statement =
                attributeStatement(
                        attribute("emailaddress", "user@example.com"),
                        attribute("name", "some-name"));
        ResponseToken token =
                responseToken("name-id", List.of(statement), List.of(authnStatement("idx")));
        when(userService.findByUsernameIgnoreCase("user@example.com")).thenReturn(Optional.empty());

        Saml2Authentication authentication = converter.convert(token);

        assertEquals("user@example.com", authentication.getName());
    }

    @Test
    void convert_fallsBackToName_whenUsernameAndEmailMissing() {
        AttributeStatement statement = attributeStatement(attribute("name", "display-name"));
        ResponseToken token =
                responseToken("name-id", List.of(statement), List.of(authnStatement("idx")));
        when(userService.findByUsernameIgnoreCase("display-name")).thenReturn(Optional.empty());

        Saml2Authentication authentication = converter.convert(token);

        assertEquals("display-name", authentication.getName());
    }

    @Test
    void convert_fallsBackToUpn_whenHigherPriorityAttributesMissing() {
        AttributeStatement statement = attributeStatement(attribute("upn", "user@corp.local"));
        ResponseToken token =
                responseToken("name-id", List.of(statement), List.of(authnStatement("idx")));
        when(userService.findByUsernameIgnoreCase("user@corp.local")).thenReturn(Optional.empty());

        Saml2Authentication authentication = converter.convert(token);

        assertEquals("user@corp.local", authentication.getName());
    }

    @Test
    void convert_fallsBackToUid_whenOnlyUidPresent() {
        AttributeStatement statement = attributeStatement(attribute("uid", "uid-1234"));
        ResponseToken token =
                responseToken("name-id", List.of(statement), List.of(authnStatement("idx")));
        when(userService.findByUsernameIgnoreCase("uid-1234")).thenReturn(Optional.empty());

        Saml2Authentication authentication = converter.convert(token);

        assertEquals("uid-1234", authentication.getName());
    }

    @Test
    void convert_fallsBackToNameId_whenNoRecognisedAttributes() {
        AttributeStatement statement =
                attributeStatement(attribute("unrelated", "irrelevant-value"));
        ResponseToken token =
                responseToken(
                        "subject-name-id", List.of(statement), List.of(authnStatement("idx")));
        when(userService.findByUsernameIgnoreCase("subject-name-id"))
                .thenReturn(Optional.empty());

        Saml2Authentication authentication = converter.convert(token);

        assertEquals("subject-name-id", authentication.getName());
    }

    @Test
    void convert_fallsBackToNameId_whenNoAttributeStatementsAtAll() {
        ResponseToken token =
                responseToken("only-name-id", List.of(), List.of(authnStatement("idx")));
        when(userService.findByUsernameIgnoreCase("only-name-id")).thenReturn(Optional.empty());

        Saml2Authentication authentication = converter.convert(token);

        assertEquals("only-name-id", authentication.getName());
    }

    // ------------------------------------------------------------------
    // Authority mapping
    // ------------------------------------------------------------------

    @Test
    void convert_assignsDefaultRoleUser_whenUserNotFound() {
        AttributeStatement statement = attributeStatement(attribute("username", "ghost"));
        ResponseToken token =
                responseToken("name-id", List.of(statement), List.of(authnStatement("idx")));
        when(userService.findByUsernameIgnoreCase("ghost")).thenReturn(Optional.empty());

        Saml2Authentication authentication = converter.convert(token);

        Collection<? extends GrantedAuthority> authorities = authentication.getAuthorities();
        assertEquals(1, authorities.size());
        assertEquals("ROLE_USER", authorities.iterator().next().getAuthority());
        // findRole must never be consulted when the user does not exist.
        verify(userService, never()).findRole(any(User.class));
    }

    @Test
    void convert_usesPersistedRole_whenUserFound() {
        AttributeStatement statement = attributeStatement(attribute("username", "real-user"));
        ResponseToken token =
                responseToken("name-id", List.of(statement), List.of(authnStatement("idx")));

        User user = new User();
        Authority adminAuthority = new Authority();
        adminAuthority.setAuthority("ROLE_ADMIN");
        when(userService.findByUsernameIgnoreCase("real-user")).thenReturn(Optional.of(user));
        when(userService.findRole(user)).thenReturn(adminAuthority);

        Saml2Authentication authentication = converter.convert(token);

        Collection<? extends GrantedAuthority> authorities = authentication.getAuthorities();
        assertEquals(1, authorities.size());
        assertEquals("ROLE_ADMIN", authorities.iterator().next().getAuthority());
        verify(userService).findRole(user);
    }

    // ------------------------------------------------------------------
    // Attribute extraction behaviour
    // ------------------------------------------------------------------

    @Test
    void convert_storesAttributesUnderBothFullUriAndShortName() {
        String fullUri =
                "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress";
        AttributeStatement statement = attributeStatement(attribute(fullUri, "user@example.com"));
        ResponseToken token =
                responseToken("name-id", List.of(statement), List.of(authnStatement("idx")));
        when(userService.findByUsernameIgnoreCase("user@example.com")).thenReturn(Optional.empty());

        Saml2Authentication authentication = converter.convert(token);

        Map<String, List<Object>> attributes = principalAttributes(authentication);
        assertTrue(attributes.containsKey(fullUri), "full URI key should be present");
        assertTrue(attributes.containsKey("emailaddress"), "short name key should be present");
        assertEquals(List.of("user@example.com"), attributes.get(fullUri));
        assertEquals(List.of("user@example.com"), attributes.get("emailaddress"));
        // The short name is used for identifier resolution (emailaddress).
        assertEquals("user@example.com", authentication.getName());
    }

    @Test
    void convert_attributeWithoutSlash_usesFullStringAsShortName() {
        // lastIndexOf('/') == -1 -> substring(0) keeps the whole string as the short name.
        AttributeStatement statement = attributeStatement(attribute("username", "plainuser"));
        ResponseToken token =
                responseToken("name-id", List.of(statement), List.of(authnStatement("idx")));
        when(userService.findByUsernameIgnoreCase("plainuser")).thenReturn(Optional.empty());

        Saml2Authentication authentication = converter.convert(token);

        Map<String, List<Object>> attributes = principalAttributes(authentication);
        assertEquals(List.of("plainuser"), attributes.get("username"));
        assertEquals("plainuser", authentication.getName());
    }

    @Test
    void convert_retainsMultipleValuesForAttribute() {
        AttributeStatement statement =
                attributeStatement(attribute("roles", "alpha", "beta", "gamma"));
        ResponseToken token =
                responseToken(
                        "subject-id", List.of(statement), List.of(authnStatement("idx")));
        when(userService.findByUsernameIgnoreCase("subject-id")).thenReturn(Optional.empty());

        Saml2Authentication authentication = converter.convert(token);

        Map<String, List<Object>> attributes = principalAttributes(authentication);
        assertEquals(List.of("alpha", "beta", "gamma"), attributes.get("roles"));
        // first value is used by getFirstAttributeValue if "roles" were a chosen identifier
        assertEquals("alpha", attributes.get("roles").get(0).toString());
    }

    @Test
    void convert_skipsNullAndBlankAttributeValues() {
        // Mixed values: only the non-blank one survives.
        AttributeStatement statement =
                attributeStatement(attribute("username", null, "   ", "kept-user"));
        ResponseToken token =
                responseToken("name-id", List.of(statement), List.of(authnStatement("idx")));
        when(userService.findByUsernameIgnoreCase("kept-user")).thenReturn(Optional.empty());

        Saml2Authentication authentication = converter.convert(token);

        Map<String, List<Object>> attributes = principalAttributes(authentication);
        assertEquals(List.of("kept-user"), attributes.get("username"));
        assertEquals("kept-user", authentication.getName());
    }

    @Test
    void convert_attributeWithOnlyBlankValues_isNotStored_fallsBackToNameId() {
        // All values blank -> values list empty -> attribute is not stored at all.
        AttributeStatement statement = attributeStatement(attribute("username", "  ", ""));
        ResponseToken token =
                responseToken("fallback-name-id", List.of(statement), List.of(authnStatement("idx")));
        when(userService.findByUsernameIgnoreCase("fallback-name-id"))
                .thenReturn(Optional.empty());

        Saml2Authentication authentication = converter.convert(token);

        Map<String, List<Object>> attributes = principalAttributes(authentication);
        assertTrue(attributes.isEmpty(), "blank-only attribute should not be stored");
        assertEquals("fallback-name-id", authentication.getName());
    }

    // ------------------------------------------------------------------
    // Session indexes & principal wiring
    // ------------------------------------------------------------------

    @Test
    void convert_collectsAllSessionIndexes() {
        AttributeStatement statement = attributeStatement(attribute("username", "u"));
        ResponseToken token =
                responseToken(
                        "name-id",
                        List.of(statement),
                        List.of(authnStatement("session-1"), authnStatement("session-2")));
        when(userService.findByUsernameIgnoreCase("u")).thenReturn(Optional.empty());

        Saml2Authentication authentication = converter.convert(token);

        CustomSaml2AuthenticatedPrincipal principal =
                (CustomSaml2AuthenticatedPrincipal) authentication.getPrincipal();
        assertEquals(List.of("session-1", "session-2"), principal.sessionIndexes());
    }

    @Test
    void convert_withNoAuthnStatements_producesEmptySessionIndexes() {
        AttributeStatement statement = attributeStatement(attribute("username", "u"));
        ResponseToken token = responseToken("name-id", List.of(statement), List.of());
        when(userService.findByUsernameIgnoreCase("u")).thenReturn(Optional.empty());

        Saml2Authentication authentication = converter.convert(token);

        CustomSaml2AuthenticatedPrincipal principal =
                (CustomSaml2AuthenticatedPrincipal) authentication.getPrincipal();
        assertTrue(principal.sessionIndexes().isEmpty());
    }

    @Test
    void convert_principalNameAndNameIdMatchIdentifier_andCredentialsAreRawResponse() {
        AttributeStatement statement = attributeStatement(attribute("username", "wired-user"));
        ResponseToken token =
                responseToken("name-id", List.of(statement), List.of(authnStatement("idx")));
        when(userService.findByUsernameIgnoreCase("wired-user")).thenReturn(Optional.empty());

        Saml2Authentication authentication = converter.convert(token);

        assertInstanceOf(
                CustomSaml2AuthenticatedPrincipal.class, authentication.getPrincipal());
        CustomSaml2AuthenticatedPrincipal principal =
                (CustomSaml2AuthenticatedPrincipal) authentication.getPrincipal();
        // The converter passes userIdentifier for both the name and the nameId arguments.
        assertEquals("wired-user", principal.getName());
        assertEquals("wired-user", principal.nameId());
        // Saml2Authentication exposes the raw SAML response via getSaml2Response()/credentials.
        assertEquals(SAML_RESPONSE_XML, authentication.getSaml2Response());
        assertEquals(SAML_RESPONSE_XML, authentication.getCredentials());
    }

    @Test
    void convert_returnsNonNullAuthentication() {
        AttributeStatement statement = attributeStatement(attribute("username", "u"));
        ResponseToken token =
                responseToken("name-id", List.of(statement), List.of(authnStatement("idx")));
        when(userService.findByUsernameIgnoreCase("u")).thenReturn(Optional.empty());

        Saml2Authentication authentication = converter.convert(token);

        assertNotNull(authentication);
    }

    // ------------------------------------------------------------------
    // Error / exception paths
    // ------------------------------------------------------------------

    @Test
    void convert_throws_whenResponseHasNoAssertions() {
        Response response = mock(Response.class);
        when(response.getAssertions()).thenReturn(List.of());
        ResponseToken token = mock(ResponseToken.class);
        when(token.getResponse()).thenReturn(response);

        // assertions.get(0) on an empty list throws IndexOutOfBoundsException.
        assertThrows(IndexOutOfBoundsException.class, () -> converter.convert(token));
    }

    @Test
    void convert_throws_whenNameIdMissingAndNoAttributes() {
        Assertion assertion = mock(Assertion.class);
        when(assertion.getAttributeStatements()).thenReturn(List.of());
        // No recognised attributes -> code dereferences subject.getNameID(); make it blow up.
        when(assertion.getSubject()).thenReturn(null);

        Response response = mock(Response.class);
        when(response.getAssertions()).thenReturn(List.of(assertion));
        ResponseToken token = mock(ResponseToken.class);
        when(token.getResponse()).thenReturn(response);

        assertThrows(NullPointerException.class, () -> converter.convert(token));
        // UserService is never consulted because resolution fails first.
        verify(userService, never()).findByUsernameIgnoreCase(any());
    }

    @Test
    void convert_doesNotShareAuthorityInstancesBetweenInvocations() {
        // Each conversion builds its own SimpleGrantedAuthority; the same converter can be reused.
        AttributeStatement s1 = attributeStatement(attribute("username", "alice"));
        AttributeStatement s2 = attributeStatement(attribute("username", "bob"));
        ResponseToken t1 = responseToken("n1", List.of(s1), List.of(authnStatement("i1")));
        ResponseToken t2 = responseToken("n2", List.of(s2), List.of(authnStatement("i2")));
        lenient().when(userService.findByUsernameIgnoreCase("alice")).thenReturn(Optional.empty());
        lenient().when(userService.findByUsernameIgnoreCase("bob")).thenReturn(Optional.empty());

        Saml2Authentication a1 = converter.convert(t1);
        Saml2Authentication a2 = converter.convert(t2);

        assertEquals("alice", a1.getName());
        assertEquals("bob", a2.getName());
        assertEquals("ROLE_USER", a1.getAuthorities().iterator().next().getAuthority());
        assertEquals("ROLE_USER", a2.getAuthorities().iterator().next().getAuthority());
    }
}

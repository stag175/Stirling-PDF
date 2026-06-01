package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.Locale;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;

/**
 * Unit tests for {@link CustomUserDetailsService#loadUserByUsername(String)}.
 *
 * <p>All collaborators are Mockito mocks; no Spring context, DB, or IO is used. The tests exercise
 * the not-found, locked, legacy auth-type migration (WEB / OAUTH2 / SAML2 / fallback) and
 * null-password validation branches.
 *
 * <p>Assumption to verify: {@link User#setAuthenticationType(AuthenticationType)} stores the value
 * lower-cased, and the service re-uppercases via {@link Locale#ROOT}, so the migration round-trips
 * correctly. These tests rely on the real {@link User} entity (a no-arg Lombok bean) rather than
 * mocking it.
 */
@ExtendWith(MockitoExtension.class)
class CustomUserDetailsServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private LoginAttemptService loginAttemptService;
    @Mock private ApplicationProperties.Security securityProperties;

    @Mock private ApplicationProperties.Security.OAUTH2 oauth2;
    @Mock private ApplicationProperties.Security.SAML2 saml2;

    @InjectMocks private CustomUserDetailsService service;

    private static User userWithPassword(String authType) {
        User user = new User();
        user.setUsername("alice");
        user.setPassword("hashed-secret");
        setRawAuthType(user, authType);
        return user;
    }

    private static User userWithoutPassword(String authType) {
        User user = new User();
        user.setUsername("bob");
        // no password set -> hasPassword() == false
        setRawAuthType(user, authType);
        return user;
    }

    /**
     * Sets the raw {@code authenticationType} string field directly via reflection. We bypass the
     * typed setter (which would reject null/empty and force enum semantics) so legacy null/empty
     * states can be reproduced. Must NOT go through setAuthenticationType — that re-applies enum
     * semantics and NPEs on a null argument.
     */
    private static void setRawAuthType(User user, String authType) {
        try {
            java.lang.reflect.Field f = User.class.getDeclaredField("authenticationType");
            f.setAccessible(true);
            f.set(user, authType);
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    @DisplayName("throws UsernameNotFoundException when repository has no matching user")
    void loadUserByUsername_userNotFound() {
        when(userRepository.findByUsername("ghost")).thenReturn(Optional.empty());

        UsernameNotFoundException ex =
                assertThrows(
                        UsernameNotFoundException.class,
                        () -> service.loadUserByUsername("ghost"));
        assertEquals("No user found with username: ghost", ex.getMessage());

        // Block check is never reached and no save happens on the not-found path.
        verifyNoInteractions(loginAttemptService);
        verify(userRepository, never()).save(any());
    }

    @Test
    @DisplayName("throws LockedException when login attempts have blocked the account")
    void loadUserByUsername_blocked() {
        User user = userWithPassword("web");
        when(userRepository.findByUsername("alice")).thenReturn(Optional.of(user));
        when(loginAttemptService.isBlocked("alice")).thenReturn(true);

        LockedException ex =
                assertThrows(LockedException.class, () -> service.loadUserByUsername("alice"));
        assertEquals(
                "Your account has been locked due to too many failed login attempts.",
                ex.getMessage());
        verify(userRepository, never()).save(any());
    }

    @Test
    @DisplayName("returns the user unchanged for a WEB account that already has a password")
    void loadUserByUsername_webWithPassword_returnsUser() {
        User user = userWithPassword("web");
        when(userRepository.findByUsername("alice")).thenReturn(Optional.of(user));
        when(loginAttemptService.isBlocked("alice")).thenReturn(false);

        UserDetails result = service.loadUserByUsername("alice");

        assertSame(user, result);
        // No legacy migration -> repository.save must not be called.
        verify(userRepository, never()).save(any());
    }

    @Test
    @DisplayName("non-legacy OAUTH2 user without a password is allowed through")
    void loadUserByUsername_oauth2WithoutPassword_returnsUser() {
        User user = userWithoutPassword("oauth2");
        when(userRepository.findByUsername("bob")).thenReturn(Optional.of(user));
        when(loginAttemptService.isBlocked("bob")).thenReturn(false);

        UserDetails result = service.loadUserByUsername("bob");

        assertSame(user, result);
        verify(userRepository, never()).save(any());
    }

    @Test
    @DisplayName("non-legacy WEB user without a password throws IllegalArgumentException")
    void loadUserByUsername_webWithoutPassword_throws() {
        User user = userWithoutPassword("web");
        when(userRepository.findByUsername("bob")).thenReturn(Optional.of(user));
        when(loginAttemptService.isBlocked("bob")).thenReturn(false);

        IllegalArgumentException ex =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> service.loadUserByUsername("bob"));
        assertEquals("Password must not be null", ex.getMessage());
        verify(userRepository, never()).save(any());
    }

    @Test
    @DisplayName("legacy user (null authType) with a password is migrated to WEB and saved")
    void loadUserByUsername_legacyNullWithPassword_migratesToWeb() {
        User user = userWithPassword(null);
        when(userRepository.findByUsername("alice")).thenReturn(Optional.of(user));
        when(loginAttemptService.isBlocked("alice")).thenReturn(false);

        UserDetails result = service.loadUserByUsername("alice");

        assertSame(user, result);
        // authenticationType was migrated; setter lower-cases the stored value.
        assertEquals("web", user.getAuthenticationType());

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(userRepository, times(1)).save(saved.capture());
        assertSame(user, saved.getValue());
        // securityProperties only consulted for password-less legacy users.
        verifyNoInteractions(securityProperties);
    }

    @Test
    @DisplayName("legacy user (empty authType) without password and OAUTH2 enabled -> OAUTH2")
    void loadUserByUsername_legacyEmptyNoPasswordOauthEnabled_migratesToOauth2() {
        User user = userWithoutPassword("");
        when(userRepository.findByUsername("bob")).thenReturn(Optional.of(user));
        when(loginAttemptService.isBlocked("bob")).thenReturn(false);
        when(securityProperties.getOauth2()).thenReturn(oauth2);
        when(oauth2.getEnabled()).thenReturn(true);

        UserDetails result = service.loadUserByUsername("bob");

        assertSame(user, result);
        assertEquals("oauth2", user.getAuthenticationType());
        verify(userRepository, times(1)).save(user);
    }

    @Test
    @DisplayName("legacy user without password, OAUTH2 disabled but SAML2 enabled -> SAML2")
    void loadUserByUsername_legacyNoPasswordSamlEnabled_migratesToSaml2() {
        User user = userWithoutPassword(null);
        when(userRepository.findByUsername("bob")).thenReturn(Optional.of(user));
        when(loginAttemptService.isBlocked("bob")).thenReturn(false);
        when(securityProperties.getOauth2()).thenReturn(oauth2);
        when(oauth2.getEnabled()).thenReturn(false);
        when(securityProperties.getSaml2()).thenReturn(saml2);
        when(saml2.getEnabled()).thenReturn(true);

        UserDetails result = service.loadUserByUsername("bob");

        assertSame(user, result);
        assertEquals("saml2", user.getAuthenticationType());
        verify(userRepository, times(1)).save(user);
    }

    @Test
    @DisplayName("legacy user without password and no SSO providers configured falls back to OAUTH2")
    void loadUserByUsername_legacyNoPasswordNoSsoConfigured_fallbackOauth2() {
        User user = userWithoutPassword(null);
        when(userRepository.findByUsername("bob")).thenReturn(Optional.of(user));
        when(loginAttemptService.isBlocked("bob")).thenReturn(false);
        // getOauth2() and getSaml2() both return null (default mock behavior) ->
        // both *Enabled flags are false -> fallback branch.
        when(securityProperties.getOauth2()).thenReturn(null);
        when(securityProperties.getSaml2()).thenReturn(null);

        UserDetails result = service.loadUserByUsername("bob");

        assertSame(user, result);
        assertEquals("oauth2", user.getAuthenticationType());
        verify(userRepository, times(1)).save(user);
    }

    @Test
    @DisplayName("authType comparison is case-insensitive (mixed-case stored value resolves)")
    void loadUserByUsername_mixedCaseAuthType_resolvesViaUpperCase() {
        // Stored value with unusual casing should still map to AuthenticationType.WEB
        // via toUpperCase(Locale.ROOT); since there is no password this triggers the
        // IllegalArgumentException branch, proving the enum resolution path executed.
        User user = userWithoutPassword("WeB");
        when(userRepository.findByUsername("bob")).thenReturn(Optional.of(user));
        when(loginAttemptService.isBlocked("bob")).thenReturn(false);

        assertThrows(
                IllegalArgumentException.class, () -> service.loadUserByUsername("bob"));
        verify(userRepository, never()).save(any());
    }
}

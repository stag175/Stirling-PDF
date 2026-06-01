package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;

/**
 * Unit tests for {@link AppUpdateAuthService#getShowUpdateOnlyAdmins()}.
 *
 * <p>Pure Mockito: {@link UserRepository} and {@link ApplicationProperties} (plus its nested {@code
 * System}) are mocked, and {@link SecurityContextHolder} is populated in-test. No Spring context, no
 * DB, no IO. The test lives in the same package because the target class is package-private.
 *
 * <p>Branches exercised by {@code getShowUpdateOnlyAdmins()}:
 *
 * <ul>
 *   <li>{@code showUpdate == false} -> short-circuits to {@code false}; neither auth nor repo touched
 *   <li>{@code showUpdate == true}, authentication {@code null} -> returns {@code !showUpdateOnlyAdmin}
 *   <li>authentication not authenticated -> returns {@code !showUpdateOnlyAdmin}
 *   <li>authentication name is {@code anonymousUser} -> returns {@code !showUpdateOnlyAdmin}
 *   <li>real authenticated user present, admins-only -> {@code true} iff role is {@code ROLE_ADMIN}
 *   <li>user present, admins-only -> {@code false} for a non-admin role
 *   <li>user present but {@code showUpdateOnlyAdmin == false} -> falls through to {@code showUpdate}
 *   <li>user absent from repo -> falls through to {@code showUpdate}
 * </ul>
 *
 * <p>Assumption to verify: the production code compares against the literal {@code "ROLE_ADMIN"} and
 * reads the role via {@link User#getRolesAsString()}; the admin user mock returns that exact string.
 */
@ExtendWith(MockitoExtension.class)
class AppUpdateAuthServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private ApplicationProperties applicationProperties;
    @Mock private ApplicationProperties.System system;

    private AppUpdateAuthService service;

    private void setUpService() {
        lenient().when(applicationProperties.getSystem()).thenReturn(system);
        service = new AppUpdateAuthService(userRepository, applicationProperties);
    }

    private void setAuthentication(Authentication authentication) {
        SecurityContext ctx = SecurityContextHolder.createEmptyContext();
        ctx.setAuthentication(authentication);
        SecurityContextHolder.setContext(ctx);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("showUpdate disabled short-circuits to false without touching auth or repo")
    void showUpdateDisabled_returnsFalse_andSkipsEverythingElse() {
        setUpService();
        when(system.isShowUpdate()).thenReturn(false);

        assertFalse(
                service.getShowUpdateOnlyAdmins(),
                "When showUpdate is off the method must return false immediately");

        // showUpdateOnlyAdmin is never consulted and the repository is never queried.
        verify(system, never()).isShowUpdateOnlyAdmin();
        verifyNoInteractions(userRepository);
    }

    @Test
    @DisplayName("null authentication + admins-only returns false (non-admins excluded)")
    void nullAuthentication_adminsOnly_returnsFalse() {
        setUpService();
        when(system.isShowUpdate()).thenReturn(true);
        when(system.isShowUpdateOnlyAdmin()).thenReturn(true);
        setAuthentication(null);

        assertFalse(
                service.getShowUpdateOnlyAdmins(),
                "No authentication while admins-only is on should hide the update");
        verifyNoInteractions(userRepository);
    }

    @Test
    @DisplayName("null authentication + not admins-only returns true (visible to all)")
    void nullAuthentication_notAdminsOnly_returnsTrue() {
        setUpService();
        when(system.isShowUpdate()).thenReturn(true);
        when(system.isShowUpdateOnlyAdmin()).thenReturn(false);
        setAuthentication(null);

        assertTrue(
                service.getShowUpdateOnlyAdmins(),
                "No authentication while admins-only is off should show the update");
        verifyNoInteractions(userRepository);
    }

    @Test
    @DisplayName("unauthenticated authentication + admins-only returns false")
    void unauthenticated_adminsOnly_returnsFalse() {
        setUpService();
        when(system.isShowUpdate()).thenReturn(true);
        when(system.isShowUpdateOnlyAdmin()).thenReturn(true);

        Authentication auth = mock(Authentication.class);
        when(auth.isAuthenticated()).thenReturn(false);
        setAuthentication(auth);

        assertFalse(
                service.getShowUpdateOnlyAdmins(),
                "Unauthenticated principal while admins-only is on should hide the update");
        verifyNoInteractions(userRepository);
    }

    @Test
    @DisplayName("unauthenticated authentication + not admins-only returns true")
    void unauthenticated_notAdminsOnly_returnsTrue() {
        setUpService();
        when(system.isShowUpdate()).thenReturn(true);
        when(system.isShowUpdateOnlyAdmin()).thenReturn(false);

        Authentication auth = mock(Authentication.class);
        when(auth.isAuthenticated()).thenReturn(false);
        setAuthentication(auth);

        assertTrue(
                service.getShowUpdateOnlyAdmins(),
                "Unauthenticated principal while admins-only is off should show the update");
        verifyNoInteractions(userRepository);
    }

    @Test
    @DisplayName("anonymousUser (case-insensitive) + admins-only returns false")
    void anonymousUser_adminsOnly_returnsFalse() {
        setUpService();
        when(system.isShowUpdate()).thenReturn(true);
        when(system.isShowUpdateOnlyAdmin()).thenReturn(true);

        // AnonymousAuthenticationToken is authenticated() == true, name "anonymousUser".
        Authentication auth =
                new AnonymousAuthenticationToken(
                        "key",
                        "anonymousUser",
                        java.util.List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS")));
        setAuthentication(auth);

        assertFalse(
                service.getShowUpdateOnlyAdmins(),
                "Anonymous principal while admins-only is on should hide the update");
        verifyNoInteractions(userRepository);
    }

    @Test
    @DisplayName("anonymousUser name matched case-insensitively + not admins-only returns true")
    void anonymousUser_caseInsensitive_notAdminsOnly_returnsTrue() {
        setUpService();
        when(system.isShowUpdate()).thenReturn(true);
        when(system.isShowUpdateOnlyAdmin()).thenReturn(false);

        // Different casing must still be treated as the anonymous principal.
        Authentication auth = mock(Authentication.class);
        when(auth.isAuthenticated()).thenReturn(true);
        when(auth.getName()).thenReturn("ANONYMOUSUSER");
        setAuthentication(auth);

        assertTrue(
                service.getShowUpdateOnlyAdmins(),
                "Anonymous principal (any casing) while admins-only is off should show the update");
        verifyNoInteractions(userRepository);
    }

    @Test
    @DisplayName("authenticated admin + admins-only returns true")
    void authenticatedAdmin_adminsOnly_returnsTrue() {
        setUpService();
        when(system.isShowUpdate()).thenReturn(true);
        when(system.isShowUpdateOnlyAdmin()).thenReturn(true);
        setAuthentication(
                new UsernamePasswordAuthenticationToken("admin", null, java.util.List.of()));

        User adminUser = mock(User.class);
        when(adminUser.getRolesAsString()).thenReturn("ROLE_ADMIN");
        when(userRepository.findByUsername("admin")).thenReturn(Optional.of(adminUser));

        assertTrue(
                service.getShowUpdateOnlyAdmins(),
                "An admin user while admins-only is on should see the update");
        verify(userRepository).findByUsername("admin");
    }

    @Test
    @DisplayName("authenticated non-admin + admins-only returns false")
    void authenticatedNonAdmin_adminsOnly_returnsFalse() {
        setUpService();
        when(system.isShowUpdate()).thenReturn(true);
        when(system.isShowUpdateOnlyAdmin()).thenReturn(true);
        setAuthentication(
                new UsernamePasswordAuthenticationToken("bob", null, java.util.List.of()));

        User normalUser = mock(User.class);
        when(normalUser.getRolesAsString()).thenReturn("ROLE_USER");
        when(userRepository.findByUsername("bob")).thenReturn(Optional.of(normalUser));

        assertFalse(
                service.getShowUpdateOnlyAdmins(),
                "A non-admin user while admins-only is on should not see the update");
        verify(userRepository).findByUsername("bob");
    }

    @Test
    @DisplayName("authenticated user present but not admins-only falls through to showUpdate (true)")
    void authenticatedUser_notAdminsOnly_returnsShowUpdate() {
        setUpService();
        when(system.isShowUpdate()).thenReturn(true);
        when(system.isShowUpdateOnlyAdmin()).thenReturn(false);
        setAuthentication(
                new UsernamePasswordAuthenticationToken("carol", null, java.util.List.of()));

        // The user is looked up, but because admins-only is off the role is never consulted and the
        // method falls through to returning showUpdate.
        User someUser = mock(User.class);
        when(userRepository.findByUsername("carol")).thenReturn(Optional.of(someUser));

        assertTrue(
                service.getShowUpdateOnlyAdmins(),
                "With admins-only off, any authenticated user should fall through to showUpdate");
        verify(userRepository).findByUsername("carol");
        verify(someUser, never()).getRolesAsString();
    }

    @Test
    @DisplayName("authenticated user absent from repo falls through to showUpdate (true)")
    void authenticatedUser_absentFromRepo_returnsShowUpdate() {
        setUpService();
        when(system.isShowUpdate()).thenReturn(true);
        when(system.isShowUpdateOnlyAdmin()).thenReturn(true);
        setAuthentication(
                new UsernamePasswordAuthenticationToken("ghost", null, java.util.List.of()));

        when(userRepository.findByUsername("ghost")).thenReturn(Optional.empty());

        assertTrue(
                service.getShowUpdateOnlyAdmins(),
                "An unknown user (not in repo) should fall through to returning showUpdate");
        verify(userRepository).findByUsername("ghost");
    }
}

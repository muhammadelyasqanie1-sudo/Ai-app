import assert from 'node:assert/strict';
import { canAccessAdminRoute, canManageUser, requiredAdminPermission } from '../src/security/adminPermissions.ts';

assert.equal(requiredAdminPermission('GET', '/api/admin/providers'), 'providers:read');
assert.equal(requiredAdminPermission('POST', '/api/admin/providers/custom'), 'providers:manage');
assert.equal(requiredAdminPermission('PATCH', '/api/admin/rate-limits'), 'security:manage');
assert.equal(requiredAdminPermission('GET', '/api/admin/users'), 'users:read');
assert.equal(requiredAdminPermission('POST', '/api/admin/users/123e4567-e89b-12d3-a456-426614174000/password-reset'), 'users:manage');
assert.equal(requiredAdminPermission('GET', '/api/admin/staff/roles'), 'staff:manage');
assert.equal(requiredAdminPermission('GET', '/api/admin/unmapped-route'), null);

assert.equal(canAccessAdminRoute('admin', {}, 'GET', '/api/admin/unknown'), true);
assert.equal(canAccessAdminRoute('superadmin', {}, 'GET', '/api/admin/unknown'), true);
assert.equal(canAccessAdminRoute('provider_manager', {'providers:read': true}, 'GET', '/api/admin/providers'), true);
assert.equal(canAccessAdminRoute('provider_manager', {'providers:read': true}, 'PATCH', '/api/admin/providers'), false);
assert.equal(canAccessAdminRoute('analyst', {'usage:read': true}, 'GET', '/api/admin/usage'), true);
assert.equal(canAccessAdminRoute('analyst', {'usage:read': true}, 'GET', '/api/admin/users'), false);
assert.equal(canManageUser('moderator', {'users:suspend': true}, 'suspend'), true);
assert.equal(canManageUser('moderator', {'users:suspend': true}, 'reactivate'), false);
assert.equal(canManageUser('provider_manager', {'providers:manage': true}, 'assign-role'), false);

console.info('ADMIN_RBAC_REGRESSION_TESTS_PASSED');

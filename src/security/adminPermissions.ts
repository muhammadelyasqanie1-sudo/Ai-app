export type AdminPermission =
  | 'providers:read' | 'providers:manage'
  | 'models:read' | 'models:manage'
  | 'routing:read' | 'routing:manage'
  | 'users:read' | 'users:manage' | 'users:suspend'
  | 'audit:read' | 'security:read' | 'security:manage'
  | 'dashboard:read' | 'usage:read' | 'system:read'
  | 'settings:read' | 'settings:manage'
  | 'subscriptions:read' | 'subscriptions:manage'
  | 'notifications:broadcast' | 'staff:manage';

const ROOT_ROLES = new Set(['admin', 'superadmin']);

export function requiredAdminPermission(method: string, pathname: string): AdminPermission | null {
  const verb = method.toUpperCase();
  if (pathname === '/api/admin/staff/roles' || pathname.startsWith('/api/admin/staff/')) return 'staff:manage';
  if (pathname === '/api/admin/providers' || pathname.startsWith('/api/admin/providers/')) {
    return verb === 'GET' && pathname === '/api/admin/providers' ? 'providers:read' : 'providers:manage';
  }
  if (pathname === '/api/admin/models') return verb === 'GET' ? 'models:read' : 'models:manage';
  if (/^\/api\/admin\/models\/(discover|manual|test)$/.test(pathname)) return 'models:manage';
  if (pathname === '/api/admin/fallbacks') return verb === 'GET' ? 'routing:read' : 'routing:manage';
  if (pathname === '/api/admin/users') return verb === 'GET' ? 'users:read' : 'users:read';
  if (/^\/api\/admin\/users\/[0-9a-f-]{36}(?:\/password-reset)?$/i.test(pathname)) {
    return verb === 'GET' ? 'users:read' : 'users:manage';
  }
  if (pathname === '/api/admin/subscription-plans' || pathname === '/api/admin/subscriptions') {
    return verb === 'GET' ? 'subscriptions:read' : 'subscriptions:manage';
  }
  if (pathname === '/api/admin/overview') return 'dashboard:read';
  if (['/api/admin/requests','/api/admin/usage','/api/admin/errors','/api/admin/errors/export','/api/admin/9router/metrics'].includes(pathname)) return 'usage:read';
  if (pathname === '/api/admin/9router/gateway') return verb === 'GET' ? 'settings:read' : 'settings:manage';
  if (pathname === '/api/admin/audit') return 'audit:read';
  if (['/api/admin/security-events','/api/admin/sessions'].includes(pathname)) return 'security:read';
  if (pathname === '/api/admin/rate-limits') return verb === 'GET' ? 'security:read' : 'security:manage';
  if (pathname === '/api/admin/feature-flags' || pathname === '/api/admin/config' || pathname.startsWith('/api/admin/config/')) {
    return verb === 'GET' ? 'settings:read' : 'settings:manage';
  }
  if (pathname === '/api/admin/system-health') return 'system:read';
  if (pathname === '/api/admin/announcements') return verb === 'GET' ? 'settings:read' : 'notifications:broadcast';
  if (pathname === '/api/admin/notifications/product-update') return 'notifications:broadcast';
  return null;
}

export function canAccessAdminRoute(
  role: string,
  permissions: Record<string, boolean>,
  method: string,
  pathname: string,
): boolean {
  if (ROOT_ROLES.has(role)) return true;
  const required = requiredAdminPermission(method, pathname);
  return Boolean(required && (permissions['*'] === true || permissions[required] === true));
}

export function canManageUser(
  role: string,
  permissions: Record<string, boolean>,
  action: 'assign-role' | 'suspend' | 'reactivate',
): boolean {
  if (ROOT_ROLES.has(role)) return true;
  const permission = action === 'suspend' ? 'users:suspend' : 'users:manage';
  return permissions[permission] === true;
}

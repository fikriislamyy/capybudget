import type { TransactionSql } from 'postgres';

export type BusinessRole = 'owner' | 'accountant' | 'staff' | 'viewer';
function deny(status: number, code: string, message: string): never {
  throw Object.assign(new Error(message), { status, code });
}

/** Explicit authorization is required even on deployments whose SQL role bypasses RLS. */
export async function authorizeWorkspace(tx: TransactionSql, workspaceId: string, userId: string, request: Request): Promise<BusinessRole> {
  const [member] = await tx.unsafe(`select m.role,w.kind from workspace_memberships m join workspaces w on w.id=m.workspace_id
    where m.workspace_id=$1 and m.user_id=$2 and w.archived_at is null for share of m`, [workspaceId, userId]);
  if (!member) deny(404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
  const role = member.role as BusinessRole;
  if (!['owner','accountant','staff','viewer'].includes(role) || (member.kind !== 'business' && role !== 'owner')) {
    deny(403, 'PERMISSION_DENIED', 'Your role cannot access this workspace.');
  }
  await tx.unsafe("select set_config('app.workspace_role',$1,true)", [role]);
  if (role === 'owner') return role;
  const prefix = '/api/workspaces/' + workspaceId;
  const path = new URL(request.url).pathname.slice(prefix.length);
  const read = request.method === 'GET' || request.method === 'HEAD';
  const administrative = /^\/(?:business-profile|business-tax|members|invitations|payment-connections)(?:\/|$)/.test(path);
  if (role === 'accountant') {
    if (administrative && !read && !/^\/business-tax\/reminders(?:\/|$)/.test(path)) deny(403, 'PERMISSION_DENIED', 'Only an owner can change business administration settings.');
    return role;
  }
  if (role === 'viewer') {
    if (/^\/business-accounting\/reviews(?:\/|$)/.test(path)) deny(403,'PERMISSION_DENIED','Accounting review evidence is restricted to owners and accountants.');
    const documentRead = request.method === 'POST' && (/^\/invoices\/[^/]+\/pdf$/.test(path)
      || /^\/reports\/runs(?:\/[^/]+\/exports)?$/.test(path));
    const ownNotification = /^\/(?:notifications|notification-preferences|notification-rules)(?:\/|$)/.test(path);
    if (!read && !documentRead && !ownNotification) deny(403, 'PERMISSION_DENIED', 'This workspace is read-only for your role.');
    return role;
  }
  // Staff may prepare their own drafts. No issued documents, wallet data or reports.
  if (read && (path === '/business-access' || path === '/business-tax' || /^\/(?:business-profile|contacts|catalog)(?:\/|$)/.test(path))) return role;
  const match = /^\/invoices(?:\/([0-9a-f-]{36}))?(\/pdf)?$/i.exec(path);
  if (!match || (match[2] ? request.method !== 'POST' : !['GET','HEAD','POST','PATCH','DELETE'].includes(request.method))
    || (!match[1] && !['GET','HEAD','POST'].includes(request.method))) {
    deny(403, 'PERMISSION_DENIED', 'Staff can prepare their own draft invoices only.');
  }
  if (match[1]) {
    const [invoice] = await tx.unsafe("select id from invoices where workspace_id=$1 and id=$2 and created_by=$3 and state='draft' and archived_at is null", [workspaceId, match[1], userId]);
    if (!invoice) deny(404, 'NOT_FOUND', 'Draft invoice not found.');
  }
  return role;
}

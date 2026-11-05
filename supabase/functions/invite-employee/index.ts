import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Table was renamed wisal_employees -> solostack_employees; the old name made
// every call fail. Roles must be a real employee_role, and only a
// super_admin can create another super_admin or admin.
const ROLES = ['super_admin', 'admin', 'operations_manager', 'booking_coordinator', 'finance', 'support']
const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

async function authorize(adminClient: any, req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: { user }, error } = await adminClient.auth.getUser(token)
  if (error || !user) return { error: respond({ error: 'Unauthorized' }, 401) }
  const { data: caller } = await adminClient
    .from('solostack_employees')
    .select('id, role, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!caller || !caller.is_active || !['super_admin', 'admin'].includes(caller.role)) {
    return { error: respond({ error: 'Forbidden: admin access required' }, 403) }
  }
  return { caller }
}

function checkRole(callerRole: string, role: unknown) {
  if (typeof role !== 'string' || !ROLES.includes(role)) return 'Invalid role'
  if ((role === 'super_admin' || role === 'admin') && callerRole !== 'super_admin') {
    return 'Only a super admin can create admins'
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const adminClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } })
    const auth = await authorize(adminClient, req)
    if (auth.error) return auth.error
    const caller = auth.caller

    const { email, full_name, role } = await req.json()
    if (!email || !full_name || !role) return respond({ error: 'Missing required fields' }, 400)
    const roleError = checkRole(caller.role, role)
    if (roleError) return respond({ error: roleError }, 403)

    const { data: existing } = await adminClient.from('solostack_employees').select('id').eq('email', email).maybeSingle()
    if (existing) return respond({ error: 'An employee with this email already exists' }, 409)

    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { display_name: full_name, portal: 'employee' },
      redirectTo: 'https://dashboard.solostack.us',
    })
    if (inviteError) return respond({ error: inviteError.message }, 400)

    const { error: empError } = await adminClient.from('solostack_employees').insert({
      auth_user_id: inviteData.user.id, full_name, email, role, is_active: true, invited_by: caller.id,
    })
    if (empError) return respond({ error: empError.message }, 400)

    await adminClient.from('ops_audit_log').insert({
      employee_id: caller.id, action: 'invite_employee', entity_type: 'employee', new_data: { email, full_name, role },
    })
    return respond({ success: true, message: `Invite sent to ${email}` })
  } catch (err) {
    return respond({ error: err instanceof Error ? err.message : 'Error' }, 500)
  }
})

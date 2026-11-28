import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search, ShieldCheck, Users, History, UserCog, UserCheck, UserX } from 'lucide-react'
import { supabase } from './supabase'

type Role = 'super_admin' | 'admin' | 'trainee'
type Account = { id: string; full_name: string; email: string | null; role: Role; created_at: string; is_active: boolean }
type AuditEntry = { id: string; target_id: string | null; action: string; old_role: Role | null; new_role: Role | null; created_at: string }

const roleLabel: Record<Role, string> = { super_admin: 'Super Admin', admin: 'Admin', trainee: 'متدرب' }
const actionLabel: Record<string, string> = {
  account_disabled: 'تم تعطيل الحساب',
  account_reactivated: 'تم إعادة تفعيل الحساب',
}

export default function UserManagementPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | Role>('all')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    if (!supabase) { setError('تعذر الاتصال بقاعدة البيانات.'); setLoading(false); return }
    setLoading(true); setError('')
    const [people, history] = await Promise.all([
      supabase.from('profiles').select('id,full_name,email,role,created_at,is_active').order('created_at', { ascending: false }),
      supabase.from('role_audit_log').select('id,target_id,action,old_role,new_role,created_at').order('created_at', { ascending: false }).limit(30)
    ])
    if (people.error) setError('تعذر تحميل الحسابات: ' + people.error.message)
    else setAccounts((people.data ?? []) as Account[])
    if (history.error) setError(current => current || ('تعذر تحميل سجل الصلاحيات: ' + history.error.message))
    else setAudit((history.data ?? []) as AuditEntry[])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function changeRole(account: Account, nextRole: 'admin' | 'trainee') {
    if (!supabase || savingId) return
    const verb = nextRole === 'admin' ? 'ترقية الحساب إلى Admin' : 'إرجاع الحساب إلى متدرب'
    if (!window.confirm(`هل تريد ${verb} للحساب ${account.email || account.full_name}؟`)) return
    setSavingId(account.id); setError(''); setSuccess('')
    const { error: rpcError } = await supabase.rpc('horus_change_user_role', {
      _target_id: account.id,
      _new_role: nextRole
    })
    setSavingId('')
    if (rpcError) { setError('لم يتم تغيير الصلاحية: ' + rpcError.message); return }
    setSuccess('تم تغيير الصلاحية وتسجيل العملية في سجل التدقيق.')
    await load()
  }

  async function changeAccountStatus(account: Account, action: 'disable' | 'reactivate') {
    if (!supabase || savingId) return
    const isDisabling = action === 'disable'
    const verb = isDisabling ? 'تعطيل' : 'إعادة تفعيل'
    if (!window.confirm(`هل تريد ${verb} حساب ${account.email || account.full_name}؟`)) return
    setSavingId(account.id); setError(''); setSuccess('')
    const { data, error: functionError } = await supabase.functions.invoke('manage-user-status', {
      body: { targetUserId: account.id, action }
    })
    setSavingId('')
    if (functionError) {
      setError('لم يتم تغيير حالة الحساب: ' + functionError.message)
      return
    }
    if (!data?.success) {
      setError('لم يتم تغيير حالة الحساب: ' + (data?.error || 'استجابة غير متوقعة من الخادم'))
      return
    }
    setSuccess(isDisabling ? 'تم تعطيل الحساب بنجاح.' : 'تمت إعادة تفعيل الحساب بنجاح.')
    await load()
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return accounts.filter(account => (filter === 'all' || account.role === filter) &&
      (!term || (account.full_name || '').toLowerCase().includes(term) || (account.email || '').toLowerCase().includes(term)))
  }, [accounts, filter, search])

  const accountName = (id: string | null) => {
    if (!id) return 'حساب غير متاح'
    const account = accounts.find(item => item.id === id)
    return account?.full_name || account?.email || 'حساب'
  }

  return <section className="user-management">
    <div className="admin-heading">
      <div><span className="eyebrow">SUPER ADMIN CONTROL</span><h1>إدارة المستخدمين والصلاحيات</h1><p>إدارة أدوار الحسابات وحالة الحساب ومراجعة سجل التغييرات.</p></div>
      <button className="outline-btn admin-refresh" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/> تحديث البيانات</button>
    </div>
    <div className="user-management-notice"><ShieldCheck size={18}/><span>حساب Super Admin الأساسي محمي ولا يمكن تغييره أو تخفيض صلاحياته أو تعطيله. الحسابات المعطلة لا يمكنها الوصول إلى بيانات المنصة.</span></div>
    {error && <div className="notice admin-message">{error}</div>}
    {success && <div className="admin-success">{success}</div>}
    <section className="admin-section">
      <div className="admin-section-head"><div><h2><Users size={17}/> جميع الحسابات</h2><p>يمكنك تغيير الدور أو تعطيل الحساب وإعادة تفعيله.</p></div><span className="trainee-count">{accounts.length} حساب</span></div>
      <div className="user-tools">
        <label className="member-search"><div><Search size={16}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث بالاسم أو البريد الإلكتروني..."/></div></label>
        <select value={filter} onChange={event => setFilter(event.target.value as typeof filter)} aria-label="تصفية حسب الدور">
          <option value="all">كل الأدوار</option><option value="super_admin">Super Admin</option><option value="admin">Admin</option><option value="trainee">متدرب</option>
        </select>
      </div>
      {loading ? <div className="admin-empty">جارٍ تحميل الحسابات...</div> : filtered.length === 0 ? <div className="admin-empty">لا توجد حسابات مطابقة.</div> : <div className="user-account-list">
        {filtered.map(account => <article className="user-account-row" key={account.id}>
          <div className="trainee-avatar"><UserCog size={18}/></div>
          <div className="trainee-info"><strong>{account.full_name || 'بدون اسم'}</strong><span>{account.email || 'لا يوجد بريد مسجل'}</span><small>تاريخ التسجيل: {new Date(account.created_at).toLocaleDateString('ar-EG')}</small></div>
          <span className={'user-role-chip role-' + account.role}>{roleLabel[account.role]}</span>
          <span className={account.is_active ? 'user-status-active' : 'user-status-disabled'}>{account.is_active ? 'نشط' : 'معطل'}</span>
          {account.role === 'super_admin' ? <span className="protected-account">حساب محمي</span> : <div className="user-account-actions">
            {account.role === 'trainee' ?
              <button className="enroll-btn" disabled={savingId !== '' || !account.is_active} onClick={() => void changeRole(account, 'admin')}>{savingId === account.id ? 'جارٍ التحديث...' : 'ترقية إلى Admin'}</button> :
              <button className="user-demote-btn" disabled={savingId !== '' || !account.is_active} onClick={() => void changeRole(account, 'trainee')}>{savingId === account.id ? 'جارٍ التحديث...' : 'إرجاع لمتدرب'}</button>}
            {account.is_active ?
              <button className="user-demote-btn" disabled={savingId !== ''} onClick={() => void changeAccountStatus(account, 'disable')}><UserX size={14}/> تعطيل</button> :
              <button className="enroll-btn" disabled={savingId !== ''} onClick={() => void changeAccountStatus(account, 'reactivate')}><UserCheck size={14}/> إعادة تفعيل</button>}
          </div>}
        </article>)}
      </div>}
    </section>
    <section className="admin-section">
      <div className="admin-section-head"><div><h2><History size={17}/> سجل تغييرات الصلاحيات والحسابات</h2><p>آخر 30 عملية مسجلة.</p></div></div>
      {loading ? <div className="admin-empty">جارٍ تحميل السجل...</div> : audit.length === 0 ? <div className="admin-empty">لا توجد تغييرات مسجلة حتى الآن.</div> : <div className="role-audit-list">
        {audit.map(entry => <div className="role-audit-row" key={entry.id}>
          <div><strong>{accountName(entry.target_id)}</strong><span>{actionLabel[entry.action] || (entry.old_role || '—') + ' ← ' + (entry.new_role || '—')}</span></div>
          <small>{new Date(entry.created_at).toLocaleString('ar-EG')}</small>
        </div>)}
      </div>}
    </section>
  </section>
}

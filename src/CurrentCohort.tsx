import { useEffect, useState } from 'react'
import { CalendarDays, Users, Layers, RefreshCw } from 'lucide-react'
import { supabase } from './supabase'

type Cohort = {
  id: string
  name: string
  year: number
  status: 'planned' | 'active' | 'archived'
  starts_on: string | null
  ends_on: string | null
}

export default function CurrentCohort({ signedIn }: { signedIn: boolean }) {
  const [cohort, setCohort] = useState<Cohort | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function loadCohort() {
    if (!supabase || !signedIn) return
    setLoading(true)
    setError('')
    const { data, error: queryError } = await supabase
      .from('cohorts')
      .select('id,name,year,status,starts_on,ends_on')
      .neq('status', 'archived')
      .order('year', { ascending: false })
      .order('created_at', { ascending: false })
    if (queryError) {
      setError('تعذر تحميل بيانات الدفعة: ' + queryError.message)
      setCohort(null)
    } else {
      const rows = (data ?? []) as Cohort[]
      setCohort(rows.find(row => row.status === 'active') ?? rows.find(row => row.status === 'planned') ?? null)
    }
    setLoading(false)
  }

  useEffect(() => { void loadCohort() }, [signedIn])

  const statusText = cohort?.status === 'active' ? 'دفعة نشطة' : 'قيد التجهيز'
  const formatDate = (value: string | null) => value ? new Date(value + 'T00:00:00').toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) : 'لم يحدد بعد'

  return <section className="page-panel current-cohort-page">
    <div className="page-icon"><Users size={28}/></div>
    <span className="eyebrow">HORUS LEADERS · YOUR COHORT</span>
    <h1>الدفعة الحالية</h1>
    <p>بيانات الدفعة التدريبية ومواعيدها وإعلاناتها.</p>
    {!signedIn ? <div className="empty-state"><div className="empty-icon"><Layers size={30}/></div><b>سجّل دخولك أولًا</b><span>بيانات الدفعات متاحة للمستخدمين المسجلين حسب صلاحياتهم.</span></div>
    : loading ? <div className="admin-empty">جارٍ تحميل بيانات الدفعة...</div>
    : error ? <div className="notice">{error}</div>
    : !cohort ? <div className="empty-state"><div className="empty-icon"><Layers size={30}/></div><b>لا توجد دفعة مرتبطة بحسابك حاليًا</b><span>لو أنت متدرب، هيظهر هنا البرنامج بعد تسجيلك في دفعة بواسطة الإدارة.</span></div>
    : <div className="current-cohort-card">
        <div className="current-cohort-top"><div className="cohort-symbol"><Layers size={22}/></div><span className={'cohort-status ' + cohort.status}>{statusText}</span></div>
        <h2>{cohort.name}</h2>
        <p className="current-cohort-year">سنة التدريب: {cohort.year}</p>
        <div className="current-cohort-dates">
          <div><CalendarDays size={18}/><span><small>تاريخ البداية</small><strong>{formatDate(cohort.starts_on)}</strong></span></div>
          <div><CalendarDays size={18}/><span><small>تاريخ النهاية</small><strong>{formatDate(cohort.ends_on)}</strong></span></div>
        </div>
        <button className="outline-btn" onClick={() => void loadCohort()} disabled={loading}><RefreshCw size={15}/> تحديث البيانات</button>
      </div>}
  </section>
}

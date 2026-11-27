import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Users, Layers, ClipboardList, UserRoundCheck, Plus, RefreshCw, Search, UserPlus, Check } from 'lucide-react'
import { supabase } from './supabase'

type Cohort = {
  id: string
  name: string
  year: number
  status: 'planned' | 'active' | 'archived'
  starts_on: string | null
  ends_on: string | null
}
type Trainee = { id: string; full_name: string; email: string | null; role: 'super_admin' | 'admin' | 'trainee' }
type Enrollment = { cohort_id: string; trainee_id: string }

export default function AdminDashboard() {
  const [stats, setStats] = useState({ profiles: 0, cohorts: 0, enrollments: 0, assignments: 0 })
  const [cohorts, setCohorts] = useState<Cohort[]>([])
  const [trainees, setTrainees] = useState<Trainee[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [selectedCohort, setSelectedCohort] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enrollingId, setEnrollingId] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')

  const loadDashboard = useCallback(async () => {
    if (!supabase) {
      setError('تعذر الاتصال بقاعدة البيانات.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    const [profileCount, cohortCount, enrollmentCount, assignmentCount, cohortRows, profileRows, enrollmentRows] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('cohorts').select('id', { count: 'exact', head: true }),
      supabase.from('enrollments').select('id', { count: 'exact', head: true }),
      supabase.from('assignments').select('id', { count: 'exact', head: true }),
      supabase.from('cohorts').select('id,name,year,status,starts_on,ends_on').order('year', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('profiles').select('id,full_name,email,role').eq('role', 'trainee').order('created_at', { ascending: false }),
      supabase.from('enrollments').select('cohort_id,trainee_id')
    ])
    const failed = [profileCount, cohortCount, enrollmentCount, assignmentCount, cohortRows, profileRows, enrollmentRows].find(result => result.error)
    if (failed?.error) setError('حصلت مشكلة أثناء تحميل بيانات الإدارة: ' + failed.error.message)
    setStats({
      profiles: profileCount.count ?? 0,
      cohorts: cohortCount.count ?? 0,
      enrollments: enrollmentCount.count ?? 0,
      assignments: assignmentCount.count ?? 0
    })
    const loadedCohorts = (cohortRows.data ?? []) as Cohort[]
    setCohorts(loadedCohorts)
    setTrainees((profileRows.data ?? []) as Trainee[])
    setEnrollments((enrollmentRows.data ?? []) as Enrollment[])
    setSelectedCohort(current => current && loadedCohorts.some(item => item.id === current) ? current : loadedCohorts[0]?.id ?? '')
    setLoading(false)
  }, [])

  useEffect(() => { void loadDashboard() }, [loadDashboard])

  async function createCohort(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setSaving(true)
    setError('')
    setSuccess('')
    const { error: insertError } = await supabase.from('cohorts').insert({
      name: name.trim(),
      year: Number(year),
      starts_on: startsOn || null,
      ends_on: endsOn || null,
      status: 'planned'
    })
    setSaving(false)
    if (insertError) {
      setError('لم نتمكن من إنشاء الدفعة: ' + insertError.message)
      return
    }
    setName('')
    setStartsOn('')
    setEndsOn('')
    setShowForm(false)
    setSuccess('تم إنشاء الدفعة بنجاح.')
    await loadDashboard()
  }

  async function enrollTrainee(traineeId: string) {
    if (!supabase || !selectedCohort) return
    setEnrollingId(traineeId)
    setError('')
    setSuccess('')
    const { error: insertError } = await supabase.from('enrollments').insert({
      cohort_id: selectedCohort,
      trainee_id: traineeId
    })
    setEnrollingId('')
    if (insertError) {
      setError(insertError.code === '23505' ? 'المتدرب مسجل بالفعل في هذه الدفعة.' : 'تعذر ضم المتدرب: ' + insertError.message)
      return
    }
    setSuccess('تم ضم المتدرب إلى الدفعة بنجاح.')
    await loadDashboard()
  }

  const enrolledIds = useMemo(() => new Set(enrollments.filter(item => item.cohort_id === selectedCohort).map(item => item.trainee_id)), [enrollments, selectedCohort])
  const filteredTrainees = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return trainees
    return trainees.filter(person => person.full_name.toLowerCase().includes(term) || (person.email ?? '').toLowerCase().includes(term))
  }, [trainees, searchTerm])

  const cards = [
    { label: 'إجمالي الحسابات', value: stats.profiles, icon: Users },
    { label: 'الدفعات التدريبية', value: stats.cohorts, icon: Layers },
    { label: 'تسجيلات المتدربين', value: stats.enrollments, icon: UserRoundCheck },
    { label: 'التكليفات', value: stats.assignments, icon: ClipboardList }
  ]
  const statusLabel = (status: Cohort['status']) => status === 'active' ? 'نشطة' : status === 'archived' ? 'مؤرشفة' : 'قيد التجهيز'

  return <div className="admin-dashboard">
    <div className="admin-heading">
      <div><span className="eyebrow">ADMIN CONTROL CENTER</span><h1>لوحة تحكم الإدارة</h1><p>نظرة عامة على المنصة وإدارة الدفعات التدريبية.</p></div>
      <button className="outline-btn admin-refresh" onClick={() => void loadDashboard()} disabled={loading}><RefreshCw size={15}/> تحديث البيانات</button>
    </div>
    {error && <div className="notice admin-message">{error}</div>}
    {success && <div className="admin-success">{success}</div>}
    <div className="admin-stats">
      {cards.map(card => { const Icon = card.icon; return <div className="admin-stat" key={card.label}><div className="admin-stat-icon"><Icon size={20}/></div><div><span>{card.label}</span><strong>{loading ? '—' : card.value}</strong></div></div> })}
    </div>
    <section className="admin-section">
      <div className="admin-section-head"><div><h2>الدفعات التدريبية</h2><p>أنشئ الدفعات وتابع حالتها وسنة التدريب.</p></div><button className="gold-btn" onClick={() => setShowForm(value => !value)}><Plus size={16}/>{showForm ? 'إغلاق النموذج' : 'إنشاء دفعة جديدة'}</button></div>
      {showForm && <form className="cohort-form" onSubmit={createCohort}>
        <label>اسم الدفعة<input value={name} onChange={e => setName(e.target.value)} placeholder="مثال: دفعة إعداد قادة 2027" required maxLength={100}/></label>
        <label>سنة التدريب<input type="number" value={year} onChange={e => setYear(e.target.value)} min="2020" max="2100" required/></label>
        <label>تاريخ البداية<input type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)}/></label>
        <label>تاريخ النهاية<input type="date" value={endsOn} onChange={e => setEndsOn(e.target.value)} min={startsOn || undefined}/></label>
        <button className="gold-btn" type="submit" disabled={saving || !name.trim()}>{saving ? 'جارٍ الحفظ...' : 'حفظ الدفعة'}</button>
      </form>}
      {loading ? <div className="admin-empty">جارٍ تحميل الدفعات...</div> : cohorts.length === 0 ? <div className="admin-empty">لسه مفيش دفعات مضافة. ابدأ بإنشاء أول دفعة تدريبية.</div> : <div className="cohort-list">
        {cohorts.map(cohort => <div className="cohort-row" key={cohort.id}><div className="cohort-symbol"><Layers size={19}/></div><div className="cohort-info"><strong>{cohort.name}</strong><span>سنة التدريب: {cohort.year}{cohort.starts_on ? ' · البداية: ' + cohort.starts_on : ''}</span></div><span className={'cohort-status ' + cohort.status}>{statusLabel(cohort.status)}</span></div>)}
      </div>}
    </section>
    <section className="admin-section">
      <div className="admin-section-head"><div><h2>إدارة المتدربين</h2><p>ابحث عن الحسابات المسجلة وضمّها إلى الدفعة المناسبة.</p></div><span className="trainee-count">{trainees.length} متدرب مسجل</span></div>
      <div className="member-toolbar">
        <label>اختر الدفعة<select value={selectedCohort} onChange={e => setSelectedCohort(e.target.value)} disabled={cohorts.length === 0}><option value="">اختر دفعة</option>{cohorts.filter(item => item.status !== 'archived').map(item => <option key={item.id} value={item.id}>{item.name} · {item.year}</option>)}</select></label>
        <label className="member-search">ابحث بالاسم أو البريد الإلكتروني<div><Search size={16}/><input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="اكتب الاسم أو الإيميل..."/></div></label>
      </div>
      {loading ? <div className="admin-empty">جارٍ تحميل المتدربين...</div> : trainees.length === 0 ? <div className="admin-empty">لا توجد حسابات متدربين حتى الآن. سيظهر هنا كل من ينشئ حسابًا جديدًا.</div> : filteredTrainees.length === 0 ? <div className="admin-empty">لا توجد نتائج مطابقة للبحث.</div> : <div className="trainee-list">
        {filteredTrainees.map(person => {
          const enrolled = enrolledIds.has(person.id)
          return <div className="trainee-row" key={person.id}>
            <div className="trainee-avatar"><Users size={18}/></div>
            <div className="trainee-info"><strong>{person.full_name || 'بدون اسم'}</strong><span>{person.email || 'لا يوجد بريد مسجل'}</span></div>
            {enrolled ? <span className="enrolled-label"><Check size={15}/> مسجل في الدفعة</span> : <button className="enroll-btn" onClick={() => void enrollTrainee(person.id)} disabled={!selectedCohort || enrollingId !== ''}><UserPlus size={15}/>{enrollingId === person.id ? 'جارٍ الإضافة...' : 'ضم للدفعة'}</button>}
          </div>
        })}
      </div>}
    </section>
    <p className="admin-footnote">حسابات المتدربين تُنشأ بالتسجيل الذاتي، ولا يمكن للمتدرب تغيير دوره أو ضم نفسه إلى دفعة.</p>
  </div>
}

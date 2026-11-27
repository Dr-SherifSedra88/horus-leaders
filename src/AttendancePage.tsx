import { useCallback, useEffect, useState } from 'react'
import { CalendarCheck, CheckCircle2, Clock3, RefreshCw, Send, UserCheck, XCircle } from 'lucide-react'
import { supabase } from './supabase'

type Session = { id: string; cohort_id: string; title: string; starts_at: string }
type Attendance = {
  id: string; session_id: string; trainee_id: string; status: string; note: string | null
  recorded_at: string; checkin_at: string | null; arrival_at: string | null; late_minutes: number
  excuse_reason: string | null; excuse_emergency: boolean; excuse_status: string; approved_at: string | null
}
type Member = { id: string; full_name: string; record: Attendance | null }

const labels: Record<string, string> = {
  present: 'حاضر', late: 'متأخر', absent: 'غائب بدون عذر', excused: 'غائب بعذر معتمد',
  pending_checkin: 'وصول بانتظار الاعتماد', pending_excuse: 'عذر بانتظار المراجعة'
}
const localDateTime = (value: string) => {
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const showTime = (value: string | null) => value
  ? new Date(value).toLocaleString('ar-EG', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })
  : '—'

export default function AttendancePage({ role }: { role: 'super_admin' | 'admin' | 'trainee' | null }) {
  const canManage = role === 'admin' || role === 'super_admin'
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionId, setSessionId] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [myRecord, setMyRecord] = useState<Attendance | null>(null)
  const [reason, setReason] = useState('')
  const [emergency, setEmergency] = useState(false)
  const [lateDrafts, setLateDrafts] = useState<Record<string, number>>({})
  const [timeDrafts, setTimeDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadSessions = useCallback(async () => {
    if (!supabase) { setError('تعذر الاتصال بقاعدة البيانات.'); setLoading(false); return }
    setLoading(true); setError('')
    const { data, error: queryError } = await supabase.from('sessions')
      .select('id,cohort_id,title,starts_at').order('starts_at', { ascending: false })
    if (queryError) setError('تعذر تحميل اللقاءات: ' + queryError.message)
    const rows = (data ?? []) as Session[]
    setSessions(rows)
    setSessionId(current => current && rows.some(row => row.id === current) ? current : rows[0]?.id ?? '')
    setLoading(false)
  }, [])

  const loadAttendance = useCallback(async () => {
    if (!supabase || !sessionId) { setMembers([]); setMyRecord(null); return }
    setError('')
    const { data: attendanceData, error: attendanceError } = await supabase.from('attendance')
      .select('id,session_id,trainee_id,status,note,recorded_at,checkin_at,arrival_at,late_minutes,excuse_reason,excuse_emergency,excuse_status,approved_at')
      .eq('session_id', sessionId)
    if (attendanceError) { setError('تعذر تحميل سجل الحضور: ' + attendanceError.message); return }
    const records = (attendanceData ?? []) as Attendance[]
    if (!canManage) {
      const { data: userData } = await supabase.auth.getUser()
      setMyRecord(records.find(row => row.trainee_id === userData.user?.id) ?? null)
      return
    }
    const selected = sessions.find(row => row.id === sessionId)
    if (!selected) return
    const { data: enrollments, error: enrollmentError } = await supabase.from('enrollments')
      .select('trainee_id').eq('cohort_id', selected.cohort_id)
    if (enrollmentError) { setError('تعذر تحميل أسماء المتدربين: ' + enrollmentError.message); return }
    const ids = (enrollments ?? []).map(row => row.trainee_id)
    if (!ids.length) { setMembers([]); return }
    const { data: profiles, error: profileError } = await supabase.from('profiles').select('id,full_name').in('id', ids)
    if (profileError) { setError('تعذر تحميل بيانات المتدربين: ' + profileError.message); return }
    const recordMap = new Map(records.map(row => [row.trainee_id, row]))
    const rows = (profiles ?? []).map(profile => ({ id: profile.id, full_name: profile.full_name || 'متدرب بدون اسم', record: recordMap.get(profile.id) ?? null }))
    setMembers(rows)
    setTimeDrafts(Object.fromEntries(rows.map(row => [row.id, localDateTime(row.record?.arrival_at || row.record?.checkin_at || new Date().toISOString())])))
    setLateDrafts(Object.fromEntries(rows.map(row => [row.id, row.record?.late_minutes ?? 0])))
  }, [canManage, sessionId, sessions])

  useEffect(() => { void loadSessions() }, [loadSessions])
  useEffect(() => { void loadAttendance() }, [loadAttendance])

  async function refresh() { await loadSessions(); await loadAttendance() }

  async function submitCheckin() {
    if (!supabase || !sessionId) return
    setSaving(true); setError(''); setSuccess('')
    const { error: rpcError } = await supabase.rpc('horus_submit_checkin', { _session_id: sessionId })
    setSaving(false)
    if (rpcError) setError(rpcError.message)
    else { setSuccess('تم تسجيل وقت وصولك وإرسال الطلب للقائد لاعتماده.'); await loadAttendance() }
  }

  async function submitAbsence() {
    if (!supabase || !sessionId) return
    setSaving(true); setError(''); setSuccess('')
    const { error: rpcError } = await supabase.rpc('horus_submit_absence', {
      _session_id: sessionId, _reason: reason.trim() || null, _emergency: emergency
    })
    setSaving(false)
    if (rpcError) setError(rpcError.message)
    else { setSuccess('تم إرسال بلاغ عدم الحضور.'); setReason(''); await loadAttendance() }
  }

  async function updateRecord(member: Member, changes: Record<string, unknown>) {
    if (!supabase) return
    setSaving(true); setError(''); setSuccess('')
    const payload = { ...changes, updated_at: new Date().toISOString() }
    const result = member.record
      ? await supabase.from('attendance').update(payload).eq('id', member.record.id)
      : await supabase.from('attendance').insert({
          session_id: sessionId, trainee_id: member.id, recorded_by: (await supabase.auth.getUser()).data.user?.id,
          recorded_at: new Date().toISOString(), source: 'manual', excuse_status: 'none', ...payload
        })
    setSaving(false)
    if (result.error) setError('تعذر حفظ تعديل الحضور: ' + result.error.message)
    else { setSuccess('تم تحديث سجل الحضور.'); await loadAttendance() }
  }

  async function approveCheckin(member: Member) {
    if (!member.record) return
    const actual = new Date(timeDrafts[member.id] || member.record.checkin_at || member.record.recorded_at)
    const session = sessions.find(row => row.id === sessionId)
    if (!session || Number.isNaN(actual.getTime())) return
    const minutes = Math.max(0, Math.floor((actual.getTime() - new Date(session.starts_at).getTime()) / 60000))
    await updateRecord(member, {
      status: minutes > 0 ? 'late' : 'present', late_minutes: minutes,
      arrival_at: actual.toISOString(), approved_by: (await supabase?.auth.getUser())?.data.user?.id,
      approved_at: new Date().toISOString()
    })
  }

  async function reviewExcuse(member: Member, approve: boolean) {
    await updateRecord(member, {
      status: approve ? 'excused' : 'absent', excuse_status: approve ? 'approved' : 'rejected',
      approved_by: (await supabase?.auth.getUser())?.data.user?.id, approved_at: new Date().toISOString()
    })
  }

  async function markRemainingAbsent() {
    if (!supabase || !selectedSession || !started) return
    const missing = members.filter(member => !member.record)
    if (!missing.length) return
    if (!window.confirm(`سيتم تسجيل ${missing.length} متدرب كغائب بدون عذر لعدم وجود تسجيل. هل تريد المتابعة؟`)) return
    setSaving(true); setError(''); setSuccess('')
    const user = await supabase.auth.getUser()
    const now = new Date().toISOString()
    const { error: insertError } = await supabase.from('attendance').insert(missing.map(member => ({
      session_id: sessionId, trainee_id: member.id, status: 'absent', late_minutes: 0,
      excuse_status: 'none', source: 'manual', recorded_by: user.data.user?.id, recorded_at: now
    })))
    setSaving(false)
    if (insertError) setError('تعذر تسجيل الغياب للمتدربين غير المسجلين: ' + insertError.message)
    else { setSuccess('تم تسجيل الغياب للمتدربين الذين لم يقدموا أي تسجيل.'); await loadAttendance() }
  }

  async function manualStatus(member: Member, status: 'present' | 'absent' | 'late') {
    const actual = new Date(timeDrafts[member.id] || new Date().toISOString())
    await updateRecord(member, {
      status, late_minutes: status === 'late' ? Math.max(0, Number(lateDrafts[member.id] ?? 0)) : 0,
      arrival_at: status === 'absent' ? null : actual.toISOString(),
      approved_by: (await supabase?.auth.getUser())?.data.user?.id, approved_at: new Date().toISOString()
    })
  }

  const selectedSession = sessions.find(row => row.id === sessionId)
  const started = selectedSession ? Date.now() >= new Date(selectedSession.starts_at).getTime() : false

  return <section className="attendance-page">
    <div className="attendance-heading">
      <div><div className="page-icon"><CalendarCheck size={27}/></div><span className="eyebrow">HORUS LEADERS · ATTENDANCE</span><h1>الحضور والغياب</h1><p>تسجيل الوصول، مراجعة الأعذار، ومتابعة دقائق التأخير.</p></div>
      <button className="outline-btn attendance-refresh" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15}/> تحديث</button>
    </div>
    {error && <div className="notice">{error}</div>}
    {success && <div className="attendance-success">{success}</div>}
    {loading ? <div className="admin-empty">جارٍ تحميل اللقاءات...</div> : !sessions.length ? <div className="admin-empty">لا توجد لقاءات متاحة حتى الآن.</div> : <>
      <label className="attendance-session-select">اختر اللقاء
        <select value={sessionId} onChange={event => setSessionId(event.target.value)}>
          {sessions.map(session => <option key={session.id} value={session.id}>{session.title} · {showTime(session.starts_at)}</option>)}
        </select>
      </label>
      {selectedSession && <div className="attendance-session-meta"><Clock3 size={16}/> موعد اللقاء: {showTime(selectedSession.starts_at)}</div>}
      {!canManage ? <div className="attendance-trainee-card">
        <div className="attendance-card-title"><UserCheck size={21}/><div><strong>تسجيل حالتك في اللقاء</strong><small>وقت التسجيل يُحفظ تلقائيًا ولا يمكنك تعديله أو تكراره.</small></div></div>
        {myRecord ? <div className="attendance-my-status">
          <strong>{labels[myRecord.status] || myRecord.status}</strong>
          {myRecord.checkin_at && <span>وقت تسجيل الوصول الأصلي: {showTime(myRecord.checkin_at)}</span>}
          {myRecord.arrival_at && myRecord.status !== 'pending_checkin' && <span>وقت الوصول المعتمد: {showTime(myRecord.arrival_at)}</span>}
          {myRecord.status === 'late' && <span>مدة التأخير: {myRecord.late_minutes} دقيقة</span>}
          {myRecord.excuse_reason && <span>سبب الغياب: {myRecord.excuse_reason}</span>}
          {myRecord.excuse_status === 'pending' && <em>طلب العذر في انتظار مراجعة القائد</em>}
          {myRecord.status === 'pending_checkin' && <em>تم إرسال وقت الوصول وينتظر اعتماد القائد</em>}
          {myRecord.excuse_status === 'rejected' && <em>تم رفض العذر، وتم تسجيل الغياب بدون عذر</em>}
        </div> : <div className="attendance-actions">
          {started ? <button className="gold-btn" onClick={() => void submitCheckin()} disabled={saving}><UserCheck size={16}/> أنا وصلت</button>
            : <div className="attendance-wait"><Clock3 size={16}/> زر تسجيل الوصول سيظهر من موعد بداية اللقاء.</div>}
          <div className="attendance-absence">
            <strong>لم أتمكن من الحضور</strong>
            <textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="سبب عدم الحضور (اختياري)" rows={3}/>
            {started && <label className="attendance-emergency"><input type="checkbox" checked={emergency} onChange={event => setEmergency(event.target.checked)}/> أبلغ عن ظرف طارئ بعد بداية اللقاء</label>}
            <button className="outline-btn" onClick={() => void submitAbsence()} disabled={saving || (started && !emergency)}><Send size={15}/> إرسال بلاغ عدم الحضور</button>
            {started && <small>بعد بداية اللقاء، يُقبل البلاغ فقط عند تحديد أنه ظرف طارئ، ويظل العذر خاضعًا لموافقة القائد.</small>}
          </div>
        </div>}
      </div> : <div className="attendance-roster">
        <div className="attendance-roster-head"><div><strong>كشف المتدربين</strong><small>{members.length} متدرب · {members.filter(member => !member.record).length} بدون تسجيل</small></div><div className="attendance-roster-tools"><span>الاعتماد والتصحيح متاحان للقائد فقط</span>{started && members.some(member => !member.record) && <button className="outline-btn" onClick={() => void markRemainingAbsent()} disabled={saving}>تسجيل غير المسجلين كغياب</button>}</div></div>
        {!members.length ? <div className="admin-empty">لا يوجد متدربون مسجلون في هذه الدفعة.</div> : members.map(member => {
          const record = member.record
          return <article className="attendance-member" key={member.id}>
            <div className="attendance-member-main"><strong>{member.full_name}</strong><span className={'attendance-status status-' + (record?.status || 'unmarked')}>{record ? labels[record.status] : 'لم يسجل بعد'}</span></div>
            {record?.checkin_at && <p className="attendance-record-time">وقت التسجيل الأصلي: {showTime(record.checkin_at)}</p>}
            {record?.excuse_reason && <p className="attendance-reason">سبب الغياب: {record.excuse_reason} {record.excuse_emergency ? ' · بلاغ طارئ' : ''}</p>}
            {record?.status === 'pending_checkin' && <>
              <label className="attendance-time-edit">وقت الوصول (للتصحيح عند الحاجة)
                <input type="datetime-local" value={timeDrafts[member.id] || ''} onChange={event => setTimeDrafts(old => ({...old,[member.id]:event.target.value}))}/>
              </label>
              <button className="gold-btn" onClick={() => void approveCheckin(member)} disabled={saving}><CheckCircle2 size={15}/> اعتماد الوصول</button>
              <button className="outline-btn" onClick={() => void updateRecord(member,{status:'absent',approved_by:undefined,approved_at:new Date().toISOString()})} disabled={saving}><XCircle size={15}/> رفض تسجيل الوصول</button>
            </>}
            {record?.status === 'pending_excuse' && <div className="attendance-review-actions">
              <button className="gold-btn" onClick={() => void reviewExcuse(member,true)} disabled={saving}><CheckCircle2 size={15}/> اعتماد العذر</button>
              <button className="outline-btn" onClick={() => void reviewExcuse(member,false)} disabled={saving}><XCircle size={15}/> رفض العذر</button>
            </div>}
            {record?.status !== 'pending_checkin' && record?.status !== 'pending_excuse' && <div className="attendance-manual-actions">
              <label>وقت الوصول المعتمد
                <input type="datetime-local" value={timeDrafts[member.id] || ''} onChange={event => setTimeDrafts(old => ({...old,[member.id]:event.target.value}))}/>
              </label>
              <label>دقائق التأخير
                <input type="number" min="0" max="1440" value={lateDrafts[member.id] ?? 0} onChange={event => setLateDrafts(old => ({...old,[member.id]:Number(event.target.value)}))}/>
              </label>
              <button className="outline-btn" onClick={() => void manualStatus(member,'present')} disabled={saving}>حاضر</button>
              <button className="outline-btn" onClick={() => void manualStatus(member,'late')} disabled={saving}>متأخر</button>
              <button className="outline-btn" onClick={() => void manualStatus(member,'absent')} disabled={saving}>غائب</button>
            </div>}
            {record && <small className="attendance-record-footer">وقت الإرسال: {showTime(record.recorded_at)}{record.approved_at ? ' · آخر اعتماد: ' + showTime(record.approved_at) : ''}</small>}
          </article>
        })}
      </div>}
    </>}
  </section>
}

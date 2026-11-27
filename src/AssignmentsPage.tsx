import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ClipboardList, Plus, RefreshCw, Download, FileText, Clock, CheckCircle2, Lock, X, Send, Star, Pencil, Trash2 } from 'lucide-react'
import { supabase } from './supabase'

type Cohort = { id: string; name: string; year: number }
type Assignment = {
  id: string; cohort_id: string; title: string; instructions: string | null
  due_at: string | null; status: 'draft' | 'published' | 'closed'
  max_grade: number; created_at: string
}
type Submission = {
  id: string; assignment_id: string; trainee_id: string; file_path: string | null
  file_name: string | null; file_size: number | null; answer_text: string | null
  submitted_at: string; grade: number | null; feedback: string | null
}
type Person = { id: string; full_name: string }

function formatDate(value: string) {
  return new Date(value).toLocaleString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function AssignmentsPage({ role }: { role: 'admin' | 'instructor' | 'trainee' | null }) {
  const canManage = role === 'admin' || role === 'instructor'
  const [cohorts, setCohorts] = useState<Cohort[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [people, setPeople] = useState<Record<string, string>>({})
  const [selectedCohort, setSelectedCohort] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [maxGrade, setMaxGrade] = useState('100')
  const [answerValues, setAnswerValues] = useState<Record<string, string>>({})
  const [fileValues, setFileValues] = useState<Record<string, File | null>>({})
  const [gradeValues, setGradeValues] = useState<Record<string, string>>({})
  const [feedbackValues, setFeedbackValues] = useState<Record<string, string>>({})
  const [userId, setUserId] = useState('')

  const loadData = useCallback(async () => {
    if (!supabase) { setError('تعذر الاتصال بقاعدة البيانات.'); setLoading(false); return }
    setLoading(true); setError('')
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) { setError('سجّل الدخول أولًا لعرض التكليفات.'); setLoading(false); return }
    setUserId(userData.user.id)

    let cohortQuery = supabase.from('cohorts').select('id,name,year').neq('status','archived')
    if (!canManage) {
      const { data: enrollments, error: enrollmentError } = await supabase.from('enrollments').select('cohort_id').eq('trainee_id', userData.user.id)
      if (enrollmentError) { setError('تعذر تحميل الدفعة: ' + enrollmentError.message); setLoading(false); return }
      const ids = (enrollments ?? []).map(x => x.cohort_id)
      if (!ids.length) { setCohorts([]); setAssignments([]); setSubmissions([]); setLoading(false); return }
      cohortQuery = cohortQuery.in('id', ids)
    }
    const { data: cohortRows, error: cohortError } = await cohortQuery.order('year',{ascending:false})
    if (cohortError) { setError('تعذر تحميل الدفعات: ' + cohortError.message); setLoading(false); return }
    const cohortList = (cohortRows ?? []) as Cohort[]
    setCohorts(cohortList)
    const cohortIds = cohortList.map(x => x.id)
    if (!cohortIds.length) { setAssignments([]); setSubmissions([]); setLoading(false); return }

    const { data: assignmentRows, error: assignmentError } = await supabase.from('assignments')
      .select('id,cohort_id,title,instructions,due_at,status,max_grade,created_at')
      .in('cohort_id',cohortIds).order('created_at',{ascending:false})
    if (assignmentError) { setError('تعذر تحميل التكليفات: ' + assignmentError.message); setLoading(false); return }
    const assignmentList = (assignmentRows ?? []) as Assignment[]
    setAssignments(assignmentList)
    setSelectedCohort(current => current && cohortIds.includes(current) ? current : cohortIds[0])
    if (!assignmentList.length) { setSubmissions([]); setLoading(false); return }

    const { data: submissionRows, error: submissionError } = await supabase.from('submissions')
      .select('id,assignment_id,trainee_id,file_path,file_name,file_size,answer_text,submitted_at,grade,feedback')
      .in('assignment_id', assignmentList.map(x => x.id)).order('submitted_at',{ascending:false})
    if (submissionError) setError('تم تحميل التكليفات لكن تعذر تحميل التسليمات: ' + submissionError.message)
    const submissionList = (submissionRows ?? []) as Submission[]
    setSubmissions(submissionList)
    if (canManage && submissionList.length) {
      const ids = [...new Set(submissionList.map(x => x.trainee_id))]
      const { data: peopleRows } = await supabase.from('profiles').select('id,full_name').in('id',ids)
      const map: Record<string,string> = {}
      ;((peopleRows ?? []) as Person[]).forEach(p => { map[p.id] = p.full_name })
      setPeople(map)
    }
    setLoading(false)
  }, [canManage])

  useEffect(() => { void loadData() }, [loadData])

  function resetForm() {
    setTitle(''); setInstructions(''); setDueAt(''); setMaxGrade('100'); setShowForm(false); setEditingAssignment(null)
  }

  function startEditing(assignment: Assignment) {
    setEditingAssignment(assignment)
    setTitle(assignment.title)
    setInstructions(assignment.instructions ?? '')
    setDueAt(assignment.due_at ? new Date(new Date(assignment.due_at).getTime() - new Date(assignment.due_at).getTimezoneOffset() * 60000).toISOString().slice(0,16) : '')
    setMaxGrade(String(assignment.max_grade))
    setShowForm(true)
    setError(''); setSuccess('')
  }

  async function saveAssignment(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !selectedCohort || !title.trim()) return
    const parsedMaxGrade = Number(maxGrade)
    if (!Number.isFinite(parsedMaxGrade) || parsedMaxGrade <= 0 || parsedMaxGrade > 1000) { setError('اكتب درجة نهائية صحيحة أكبر من صفر وحتى 1000.'); return }
    if (editingAssignment && submissions.some(sub => sub.assignment_id === editingAssignment.id && sub.grade !== null && sub.grade > parsedMaxGrade)) { setError('لا يمكن تقليل الدرجة النهائية عن درجة سبق منحها لأحد المتدربين.'); return }
    setSaving(true); setError(''); setSuccess('')
    const values = {
      title: title.trim(), instructions: instructions.trim() || null,
      due_at: dueAt ? new Date(dueAt).toISOString() : null, max_grade: parsedMaxGrade
    }
    const result = editingAssignment
      ? await supabase.from('assignments').update(values).eq('id', editingAssignment.id)
      : await supabase.from('assignments').insert({ ...values, cohort_id: selectedCohort, status: 'published', created_by: userId })
    setSaving(false)
    if (result.error) { setError((editingAssignment ? 'تعذر تعديل التكليف: ' : 'تعذر نشر التكليف: ') + result.error.message); return }
    const wasEditing = Boolean(editingAssignment)
    resetForm(); setSuccess(wasEditing ? 'تم حفظ تعديلات التكليف بنجاح.' : 'تم نشر التكليف للمتدربين في الدفعة بنجاح.')
    await loadData()
  }

  async function deleteAssignment(assignment: Assignment) {
    if (!supabase || !canManage) return
    const related = submissions.filter(s => s.assignment_id === assignment.id)
    const confirmed = window.confirm(`هل أنت متأكد من حذف التكليف «${assignment.title}» نهائيًا؟ سيتم حذف ${related.length} تسليم مرتبط به، بما في ذلك الدرجات والملاحظات. لا يمكن التراجع عن هذا الإجراء.`)
    if (!confirmed) return
    setSaving(true); setError(''); setSuccess('')
    const { error: deleteError } = await supabase.from('assignments').delete().eq('id', assignment.id)
    if (deleteError) { setSaving(false); setError('تعذر حذف التكليف: ' + deleteError.message); return }
    const paths = related.map(s => s.file_path).filter((p): p is string => Boolean(p))
    let cleanupMessage = ''
    if (paths.length) {
      const { error: storageError } = await supabase.storage.from('assignment-submissions').remove(paths)
      if (storageError) cleanupMessage = ' تم حذف التكليف والتسليمات، لكن تعذر تنظيف بعض الملفات المخزنة: ' + storageError.message
    }
    setSaving(false)
    if (cleanupMessage) setError(cleanupMessage)
    else setSuccess('تم حذف التكليف والتسليمات المرتبطة به نهائيًا.')
    if (editingAssignment?.id === assignment.id) resetForm()
    await loadData()
  }

  async function submitWork(assignment: Assignment, event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    const answer = answerValues[assignment.id] ?? ''
    const file = fileValues[assignment.id] ?? null
    if (!file && !answer.trim()) { setError('اكتب إجابة أو اختر ملفًا قبل التسليم.'); return }
    if (file && file.size > 20 * 1024 * 1024) { setError('حجم الملف أكبر من 20 ميجابايت.'); return }
    setSaving(true); setError(''); setSuccess('')
    const existing = submissions.find(x => x.assignment_id === assignment.id && x.trainee_id === userId)
    let filePath = existing?.file_path ?? null
    let fileName = existing?.file_name ?? null
    let fileSize = existing?.file_size ?? null
    let mimeType: string | null = null
    let uploadedPath: string | null = null
    if (file) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100) || 'submission'
      uploadedPath = assignment.id + '/' + userId + '/' + crypto.randomUUID() + '-' + safeName
      const { error: uploadError } = await supabase.storage.from('assignment-submissions').upload(uploadedPath,file,{contentType:file.type || undefined,upsert:false})
      if (uploadError) { setSaving(false); setError('تعذر رفع الملف: ' + uploadError.message); return }
      filePath = uploadedPath; fileName = file.name; fileSize = file.size; mimeType = file.type || null
    }
    const payload = {
      assignment_id: assignment.id, trainee_id: userId, file_path: filePath,
      file_name: fileName, file_size: fileSize, mime_type: mimeType ?? (existing ? undefined : null),
      answer_text: answer.trim() || null, submitted_at: new Date().toISOString()
    }
    const { error: submitError } = await supabase.from('submissions')
      .upsert(payload,{onConflict:'assignment_id,trainee_id'})
    if (submitError) {
      if (uploadedPath) await supabase.storage.from('assignment-submissions').remove([uploadedPath])
      setSaving(false); setError('تعذر تسجيل التسليم: ' + submitError.message); return
    }
    if (uploadedPath && existing?.file_path) await supabase.storage.from('assignment-submissions').remove([existing.file_path])
    setSaving(false); setSuccess('تم تسليم التكليف بنجاح.')
    setFileValues(current => ({...current,[assignment.id]:null}))
    await loadData()
  }

  async function saveGrade(submission: Submission) {
    if (!supabase || !canManage) return
    const rawGrade = gradeValues[submission.id] ?? (submission.grade === null ? '' : String(submission.grade))
    const grade = Number(rawGrade)
    if (rawGrade.trim() === '' || !Number.isFinite(grade) || grade < 0) { setError('اكتب درجة صحيحة لا تقل عن صفر.'); return }
    const assignment = assignments.find(x => x.id === submission.assignment_id)
    if (assignment && grade > assignment.max_grade) { setError('الدرجة أكبر من الدرجة النهائية للتكليف.'); return }
    setSaving(true); setError(''); setSuccess('')
    const { error: gradeError } = await supabase.from('submissions').update({
      grade, feedback: feedbackValues[submission.id] ?? submission.feedback ?? null, graded_by: userId
    }).eq('id',submission.id)
    setSaving(false)
    if (gradeError) { setError('تعذر حفظ التقييم: ' + gradeError.message); return }
    setSuccess('تم حفظ الدرجة والملاحظات.')
    await loadData()
  }

  async function closeAssignment(assignment: Assignment) {
    if (!supabase || !canManage || !window.confirm('إغلاق التسليم لهذا التكليف؟ لن يستطيع المتدربون إرسال أو تعديل أعمالهم بعد ذلك.')) return
    const { error: closeError } = await supabase.from('assignments').update({status:'closed'}).eq('id',assignment.id)
    if (closeError) { setError('تعذر إغلاق التكليف: ' + closeError.message); return }
    setSuccess('تم إغلاق التكليف.'); await loadData()
  }

  async function openFile(path: string) {
    if (!supabase) return
    const { data, error: urlError } = await supabase.storage.from('assignment-submissions').createSignedUrl(path,300)
    if (urlError || !data?.signedUrl) { setError('تعذر فتح الملف: ' + (urlError?.message ?? 'الرابط غير متاح.')); return }
    window.open(data.signedUrl,'_blank','noopener,noreferrer')
  }

  const visibleAssignments = assignments.filter(a => !selectedCohort || a.cohort_id === selectedCohort)
  const isExpired = (a: Assignment) => Boolean(a.due_at && new Date(a.due_at).getTime() <= Date.now())
  const statusText = (a: Assignment) => a.status === 'closed' ? 'مغلق' : a.status === 'draft' ? 'مسودة' : isExpired(a) ? 'انتهى موعد التسليم' : 'متاح للتسليم'

  return <section className="page-panel assignments-page">
    <div className="assignments-heading">
      <div><div className="page-icon"><ClipboardList size={28}/></div><span className="eyebrow">HORUS LEADERS · ASSIGNMENTS</span><h1>التكليفات</h1><p>التعليمات، مواعيد التسليم، ورفع الأعمال ومراجعتها.</p></div>
      <button className="outline-btn assignments-refresh" onClick={() => void loadData()} disabled={loading}><RefreshCw size={15}/> تحديث</button>
    </div>
    {error && <div className="notice">{error}</div>}
    {success && <div className="admin-success">{success}</div>}
    {cohorts.length > 0 && <div className="sessions-toolbar">
      <label>الدفعة<select value={selectedCohort} onChange={e=>setSelectedCohort(e.target.value)}>{cohorts.map(c=><option key={c.id} value={c.id}>{c.name} · {c.year}</option>)}</select></label>
      {canManage && <button className="gold-btn" onClick={()=>{resetForm();setShowForm(true)}}><Plus size={16}/> إنشاء تكليف</button>}
    </div>}
    {canManage && showForm && <form className="assignment-form" onSubmit={saveAssignment}>
      <div className="session-form-heading"><strong>{editingAssignment ? 'تعديل التكليف' : 'تكليف جديد'}</strong><button type="button" className="session-close" onClick={resetForm}><X size={18}/></button></div>
      <label>الدفعة<select value={editingAssignment?.cohort_id ?? selectedCohort} onChange={e=>setSelectedCohort(e.target.value)} required disabled={Boolean(editingAssignment)}>{cohorts.map(c=><option key={c.id} value={c.id}>{c.name} · {c.year}</option>)}</select></label>
      <label>عنوان التكليف<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={150} placeholder="مثال: إعداد عرض تقديمي عن القيادة" required/></label>
      <label className="assignment-wide">التفاصيل والتعليمات<textarea value={instructions} onChange={e=>setInstructions(e.target.value)} rows={5} placeholder="اكتب المطلوب بالتفصيل، خطوات التنفيذ، وأي ملاحظات مهمة..."/></label>
      <label>آخر موعد للتسليم<input type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)}/><small>اتركه فارغًا إذا لم يوجد موعد نهائي.</small></label>
      <label>الدرجة النهائية<input type="number" min="1" max="1000" step="0.5" value={maxGrade} onChange={e=>setMaxGrade(e.target.value)} required/></label>
      <div className="assignment-form-actions"><button className="gold-btn" type="submit" disabled={saving || !cohorts.length}>{saving?'جارٍ الحفظ...':editingAssignment?'حفظ التعديلات':'نشر التكليف الآن'}</button><button className="outline-btn" type="button" onClick={resetForm}>إلغاء</button></div>
    </form>}
    {loading ? <div className="admin-empty">جارٍ تحميل التكليفات...</div>
    : cohorts.length === 0 ? <div className="empty-state"><div className="empty-icon"><ClipboardList size={30}/></div><b>{canManage?'لا توجد دفعات متاحة':'لا توجد دفعة مرتبطة بحسابك'}</b><span>{canManage?'أنشئ دفعة أولًا من لوحة الإدارة.':'ستظهر تكليفات دفعتك هنا بعد تسجيلك بها بواسطة الإدارة.'}</span></div>
    : visibleAssignments.length === 0 ? <div className="empty-state"><div className="empty-icon"><ClipboardList size={30}/></div><b>لا توجد تكليفات حتى الآن</b><span>{canManage?'أنشئ أول تكليف من الزر الموجود بالأعلى.':'سيتم عرض التكليفات الجديدة هنا.'}</span></div>
    : <div className="assignment-list">{visibleAssignments.map(assignment=>{
      const cohort = cohorts.find(c=>c.id===assignment.cohort_id)
      const ownSubmission = submissions.find(s=>s.assignment_id===assignment.id && s.trainee_id===userId)
      const assignmentSubmissions = submissions.filter(s=>s.assignment_id===assignment.id)
      const expired = isExpired(assignment)
      const graded = ownSubmission?.grade !== null && ownSubmission?.grade !== undefined
      const canSubmit = !canManage && assignment.status==='published' && !expired && !graded
      return <article className="assignment-card" key={assignment.id}>
        <div className="assignment-card-top"><span className="cohort-status">{cohort?.name ?? 'الدفعة'}</span><span className={assignment.status==='closed' || expired?'assignment-status closed':'assignment-status'}>{!canManage && graded ? 'تم التقييم' : statusText(assignment)}</span></div>
      {canManage && <div className="assignment-admin-actions"><button type="button" className="outline-btn" disabled={saving} onClick={()=>startEditing(assignment)}><Pencil size={14}/> تعديل التكليف</button><button type="button" className="outline-btn danger-action" disabled={saving} onClick={()=>void deleteAssignment(assignment)}><Trash2 size={14}/> حذف التكليف</button></div>}
        <h2>{assignment.title}</h2>
        {assignment.instructions && <div className="assignment-instructions">{assignment.instructions}</div>}
        <div className="assignment-meta"><span><Clock size={14}/>{assignment.due_at?'آخر موعد: '+formatDate(assignment.due_at):'بدون موعد نهائي'}</span><span><Star size={14}/>الدرجة النهائية: {assignment.max_grade}</span>{canManage&&<span><CheckCircle2 size={14}/>{assignmentSubmissions.length} تسليم</span>}</div>
        {!canManage && <div className="trainee-submission">
          {ownSubmission ? <div className="submission-state"><CheckCircle2 size={17}/><span>تم التسليم: {formatDate(ownSubmission.submitted_at)}{ownSubmission.grade!==null&&<b>الدرجة: {ownSubmission.grade} / {assignment.max_grade}</b>}{ownSubmission.feedback&&<small>ملاحظات المدرب: {ownSubmission.feedback}</small>}{ownSubmission.file_path&&<button type="button" className="text-action" onClick={()=>openFile(ownSubmission.file_path!)}><Download size={14}/> تحميل الملف المرسل</button>}</span></div> : <div className="submission-pending"><Clock size={16}/> لم يتم التسليم بعد</div>}
          {canSubmit && <form className="submission-form" onSubmit={e=>void submitWork(assignment,e)}>
            <label>ملف العمل (Word / PowerPoint / Excel / PDF أو صورة)<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.webp" onChange={e=>setFileValues(v=>({...v,[assignment.id]:e.target.files?.[0]??null}))}/><small>ملف واحد بحد أقصى 20 MB. يمكنك إعادة التسليم قبل الموعد النهائي.</small></label>
            {fileValues[assignment.id]&&<small className="selected-work-file">{fileValues[assignment.id]?.name}</small>}
            <label>إجابة أو ملاحظة (اختياري)<textarea rows={2} value={answerValues[assignment.id]??ownSubmission?.answer_text??''} onChange={e=>setAnswerValues(v=>({...v,[assignment.id]:e.target.value}))} placeholder="اكتب أي توضيح للمدرب..."/></label>
            <button className="gold-btn" type="submit" disabled={saving}><Send size={15}/>{saving?'جارٍ التسليم...':ownSubmission?'تحديث التسليم':'تسليم التكليف'}</button>
          </form>}
          {!canSubmit && graded && <small className="deadline-note"><Lock size={13}/> تم تقييم تسليمك وإغلاقه نهائيًا. لا يمكن تحديث العمل بعد التقييم.</small>}
          {!canSubmit && assignment.status==='closed' && !graded && <small className="deadline-note"><Lock size={13}/> تم إغلاق التسليم لهذا التكليف.</small>}
          {!canSubmit && expired && assignment.status==='published' && !graded && <small className="deadline-note"><Lock size={13}/> انتهى موعد التسليم تلقائيًا، ولم يعد التعديل أو التسليم متاحًا.</small>}
        </div>}
        {canManage && <div className="staff-submissions">
          {assignmentSubmissions.length===0 ? <p className="no-submissions">لم يرسل أي متدرب عمله حتى الآن.</p> : assignmentSubmissions.map(sub=>{
            const person = people[sub.trainee_id] || ('متدرب · '+sub.trainee_id.slice(0,8))
            return <div className="staff-submission" key={sub.id}>
              <div className="staff-submission-head"><strong>{person}</strong><small>{formatDate(sub.submitted_at)}</small></div>
              {sub.file_path&&<button type="button" className="text-action" onClick={()=>openFile(sub.file_path!)}><FileText size={14}/>{sub.file_name||'فتح الملف المرسل'} <Download size={14}/></button>}
              {sub.answer_text&&<p>{sub.answer_text}</p>}
              <div className="grade-form">
                <label>الدرجة<input type="number" min="0" max={assignment.max_grade} step="0.5" value={gradeValues[sub.id]??(sub.grade===null?'':String(sub.grade))} onChange={e=>setGradeValues(v=>({...v,[sub.id]:e.target.value}))} placeholder={'من '+assignment.max_grade}/></label>
                <label>ملاحظات وتقييم<textarea rows={2} value={feedbackValues[sub.id]??sub.feedback??''} onChange={e=>setFeedbackValues(v=>({...v,[sub.id]:e.target.value}))} placeholder="اكتب ملاحظاتك للمتدرب..."/></label>
                <button className="outline-btn" type="button" disabled={saving} onClick={()=>void saveGrade(sub)}>حفظ التقييم</button>
              </div>
            </div>
          })}
          {assignment.status==='published'&&!expired&&<button className="outline-btn close-assignment-btn" type="button" onClick={()=>void closeAssignment(assignment)}><Lock size={14}/> إغلاق التسليم</button>}
        </div>}
      </article>
    })}</div>}
  </section>
}

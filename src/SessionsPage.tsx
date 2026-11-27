import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { CalendarDays, Clock, MapPin, Link as LinkIcon, Plus, RefreshCw, Pencil, Trash2, X, Layers, Paperclip, Upload, Download, FileText } from 'lucide-react'
import { supabase } from './supabase'

type Cohort = { id: string; name: string; year: number }
type Attachment = { id: string; session_id: string; file_path: string; file_name: string; mime_type: string | null; file_size: number | null; created_at: string }
type Session = {
  id: string
  cohort_id: string
  title: string
  starts_at: string
  location_or_link: string | null
  notes: string | null
}

function toLocalInput(value: string) {
  const date = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function displayDate(value: string) {
  return new Date(value).toLocaleString('ar-EG', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  })
}

export default function SessionsPage({ role }: { role: 'admin' | 'instructor' | 'trainee' | null }) {
  const canManage = role === 'admin' || role === 'instructor'
  const [cohorts, setCohorts] = useState<Cohort[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [selectedCohort, setSelectedCohort] = useState('')
  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [editingId, setEditingId] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadSessions = useCallback(async () => {
    if (!supabase) {
      setError('تعذر الاتصال بقاعدة البيانات.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    const { data: userResult, error: userError } = await supabase.auth.getUser()
    if (userError || !userResult.user) {
      setError('سجّل الدخول أولًا لعرض اللقاءات.')
      setLoading(false)
      return
    }

    let cohortQuery = supabase.from('cohorts').select('id,name,year').neq('status', 'archived')
    if (!canManage) {
      const { data: enrollments, error: enrollmentError } = await supabase
        .from('enrollments').select('cohort_id').eq('trainee_id', userResult.user.id)
      if (enrollmentError) {
        setError('تعذر تحميل تسجيل الدفعة: ' + enrollmentError.message)
        setLoading(false)
        return
      }
      const cohortIds = (enrollments ?? []).map(item => item.cohort_id)
      if (cohortIds.length === 0) {
        setCohorts([])
        setSessions([])
        setSelectedCohort('')
        setLoading(false)
        return
      }
      cohortQuery = cohortQuery.in('id', cohortIds)
    }

    const { data: cohortData, error: cohortError } = await cohortQuery.order('year', { ascending: false })
    if (cohortError) {
      setError('تعذر تحميل الدفعات: ' + cohortError.message)
      setLoading(false)
      return
    }
    const availableCohorts = (cohortData ?? []) as Cohort[]
    setCohorts(availableCohorts)
    const ids = availableCohorts.map(item => item.id)
    if (ids.length === 0) {
      setSessions([])
      setSelectedCohort('')
      setLoading(false)
      return
    }

    const { data: sessionData, error: sessionError } = await supabase
      .from('sessions')
      .select('id,cohort_id,title,starts_at,location_or_link,notes')
      .in('cohort_id', ids)
      .order('starts_at', { ascending: true })
    if (sessionError) setError('تعذر تحميل اللقاءات: ' + sessionError.message)
    const loadedSessions = (sessionData ?? []) as Session[]
    setSessions(loadedSessions)
    if (loadedSessions.length) {
      const { data: attachmentData, error: attachmentError } = await supabase
        .from('session_attachments')
        .select('id,session_id,file_path,file_name,mime_type,file_size,created_at')
        .in('session_id', loadedSessions.map(item => item.id))
        .order('created_at', { ascending: true })
      if (attachmentError) setError('تم تحميل اللقاءات، لكن تعذر تحميل قائمة المرفقات: ' + attachmentError.message)
      setAttachments((attachmentData ?? []) as Attachment[])
    } else {
      setAttachments([])
    }
    setSelectedCohort(current => current && ids.includes(current) ? current : ids[0])
    setLoading(false)
  }, [canManage])

  useEffect(() => { void loadSessions() }, [loadSessions])

  function resetForm() {
    setTitle('')
    setStartsAt('')
    setLocation('')
    setNotes('')
    setSelectedFiles([])
    setEditingId('')
    setShowForm(false)
  }

  function startEditing(session: Session) {
    setEditingId(session.id)
    setSelectedCohort(session.cohort_id)
    setTitle(session.title)
    setStartsAt(toLocalInput(session.starts_at))
    setLocation(session.location_or_link ?? '')
    setNotes(session.notes ?? '')
    setShowForm(true)
    setError('')
    setSuccess('')
  }

  async function saveSession(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !selectedCohort || !title.trim() || !startsAt) return
    setSaving(true)
    setError('')
    setSuccess('')
    const payload = {
      cohort_id: selectedCohort,
      title: title.trim(),
      starts_at: new Date(startsAt).toISOString(),
      location_or_link: location.trim() || null,
      notes: notes.trim() || null
    }
    const result = editingId
      ? await supabase.from('sessions').update(payload).eq('id', editingId).select('id,cohort_id').single()
      : await supabase.from('sessions').insert(payload).select('id,cohort_id').single()
    if (result.error || !result.data) {
      setSaving(false)
      setError('لم نتمكن من حفظ اللقاء: ' + (result.error?.message ?? 'لم يتم استرجاع بيانات اللقاء.'))
      return
    }
    const sessionId = result.data.id as string
    const cohortId = result.data.cohort_id as string
    const uploadErrors: string[] = []
    const userResult = await supabase.auth.getUser()
    for (const file of selectedFiles) {
      if (file.size > 20 * 1024 * 1024) {
        uploadErrors.push(file.name + ': حجم الملف أكبر من 20 ميجابايت.')
        continue
      }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'attachment'
      const filePath = cohortId + '/' + sessionId + '/' + crypto.randomUUID() + '-' + safeName
      const { error: uploadError } = await supabase.storage.from('session-attachments').upload(filePath, file, {
        contentType: file.type || undefined,
        upsert: false
      })
      if (uploadError) {
        uploadErrors.push(file.name + ': ' + uploadError.message)
        continue
      }
      const { error: metadataError } = await supabase.from('session_attachments').insert({
        session_id: sessionId,
        file_path: filePath,
        file_name: file.name,
        mime_type: file.type || null,
        file_size: file.size,
        uploaded_by: userResult.data.user?.id
      })
      if (metadataError) {
        await supabase.storage.from('session-attachments').remove([filePath])
        uploadErrors.push(file.name + ': تعذر تسجيل بيانات الملف - ' + metadataError.message)
      }
    }
    setSaving(false)
    resetForm()
    await loadSessions()
    if (uploadErrors.length) {
      setError('تم حفظ اللقاء، لكن بعض الملفات لم تُرفع:\n' + uploadErrors.join('\n'))
      setSuccess(editingId ? 'تم تحديث بيانات اللقاء.' : 'تم إنشاء اللقاء.')
    } else {
      setSuccess(editingId
        ? (selectedFiles.length ? 'تم تحديث اللقاء ورفع المرفقات بنجاح.' : 'تم تحديث اللقاء بنجاح.')
        : (selectedFiles.length ? 'تمت إضافة اللقاء ورفع المرفقات بنجاح.' : 'تمت إضافة اللقاء بنجاح.'))
    }
  }

  async function deleteSession(sessionId: string) {
    if (!supabase) return
    if (!window.confirm('هل تريد حذف هذا اللقاء؟ لا يمكن التراجع عن الحذف.')) return
    setError('')
    setSuccess('')
    const { error: deleteError } = await supabase.from('sessions').delete().eq('id', sessionId)
    if (deleteError) {
      setError('تعذر حذف اللقاء: ' + deleteError.message)
      return
    }
    setSuccess('تم حذف اللقاء.')
    await loadSessions()
  }


  async function openAttachment(attachment: Attachment) {
    if (!supabase) return
    const { data, error: urlError } = await supabase.storage.from('session-attachments').createSignedUrl(attachment.file_path, 300)
    if (urlError || !data?.signedUrl) {
      setError('تعذر فتح الملف: ' + (urlError?.message ?? 'الرابط غير متاح.'))
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function deleteAttachment(attachment: Attachment) {
    if (!supabase || !canManage) return
    if (!window.confirm('هل تريد حذف الملف "' + attachment.file_name + '"؟')) return
    setError('')
    const { error: storageError } = await supabase.storage.from('session-attachments').remove([attachment.file_path])
    if (storageError) {
      setError('تعذر حذف الملف من مساحة التخزين: ' + storageError.message)
      return
    }
    const { error: metadataError } = await supabase.from('session_attachments').delete().eq('id', attachment.id)
    if (metadataError) {
      setError('تم حذف الملف لكن تعذر حذف بياناته: ' + metadataError.message)
      return
    }
    setAttachments(current => current.filter(item => item.id !== attachment.id))
    setSuccess('تم حذف المرفق.')
  }

  const visibleSessions = sessions.filter(session => !selectedCohort || session.cohort_id === selectedCohort)

  return <section className="page-panel sessions-page">
    <div className="sessions-heading">
      <div>
        <div className="page-icon"><CalendarDays size={28}/></div>
        <span className="eyebrow">HORUS LEADERS · SESSIONS</span>
        <h1>اللقاءات والمحاضرات</h1>
        <p>مواعيد اللقاءات وتفاصيلها وروابطها وموادها التعليمية.</p>
      </div>
      <button className="outline-btn sessions-refresh" onClick={() => void loadSessions()} disabled={loading}><RefreshCw size={15}/> تحديث</button>
    </div>

    {error && <div className="notice">{error}</div>}
    {success && <div className="admin-success">{success}</div>}

    {cohorts.length > 0 && <div className="sessions-toolbar">
      <label>الدفعة
        <select value={selectedCohort} onChange={event => setSelectedCohort(event.target.value)}>
          {cohorts.map(cohort => <option key={cohort.id} value={cohort.id}>{cohort.name} · {cohort.year}</option>)}
        </select>
      </label>
      {canManage && <button className="gold-btn" onClick={() => { resetForm(); setShowForm(true) }}><Plus size={16}/> إضافة لقاء</button>}
    </div>}

    {canManage && showForm && <form className="session-form" onSubmit={saveSession}>
      <div className="session-form-heading"><strong>{editingId ? 'تعديل اللقاء' : 'إضافة لقاء جديد'}</strong><button type="button" className="session-close" onClick={resetForm} aria-label="إغلاق"><X size={18}/></button></div>
      <label>الدفعة
        <select value={selectedCohort} onChange={event => setSelectedCohort(event.target.value)} required>
          {cohorts.map(cohort => <option key={cohort.id} value={cohort.id}>{cohort.name} · {cohort.year}</option>)}
        </select>
      </label>
      <label>عنوان اللقاء<input value={title} onChange={event => setTitle(event.target.value)} maxLength={150} placeholder="مثال: مهارات القيادة الكشفية" required/></label>
      <label>التاريخ والوقت<input type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} required/></label>
      <label>المكان أو رابط اللقاء<input value={location} onChange={event => setLocation(event.target.value)} placeholder="عنوان المكان أو رابط Zoom / Google Meet"/></label>
      <label>الوصف والمواد التعليمية<textarea value={notes} onChange={event => setNotes(event.target.value)} rows={4} placeholder="اكتب وصف اللقاء، التعليمات، وروابط ملفات PDF أو الفيديوهات..."/></label>
      <label className="session-file-picker">إرفاق ملفات (PDF، Word، Excel، PowerPoint، صور أو نص)
        <span><Upload size={16}/> اختر ملفًا أو أكثر</span>
        <input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.webp,.gif" onChange={event => setSelectedFiles(Array.from(event.target.files ?? []))}/>
        <small>الحد الأقصى 20 MB لكل ملف.</small>
        {selectedFiles.length > 0 && <em>{selectedFiles.map(file => file.name).join('، ')}</em>}
      </label>
      <div className="session-form-actions"><button className="gold-btn" type="submit" disabled={saving || cohorts.length === 0}>{saving ? 'جارٍ الحفظ...' : editingId ? 'حفظ التعديلات' : 'نشر اللقاء'}</button><button type="button" className="outline-btn" onClick={resetForm}>إلغاء</button></div>
    </form>}

    {loading ? <div className="admin-empty">جارٍ تحميل اللقاءات...</div>
    : cohorts.length === 0 ? <div className="empty-state"><div className="empty-icon"><Layers size={30}/></div><b>{canManage ? 'لا توجد دفعات متاحة' : 'لا توجد دفعة مرتبطة بحسابك'}</b><span>{canManage ? 'أنشئ دفعة أولًا من لوحة الإدارة.' : 'ستظهر لقاءات دفعتك هنا بعد تسجيلك بها بواسطة الإدارة.'}</span></div>
    : visibleSessions.length === 0 ? <div className="empty-state"><div className="empty-icon"><CalendarDays size={30}/></div><b>لسه مفيش لقاءات مضافة</b><span>{canManage ? 'أضف أول لقاء للدفعة من الزر الموجود بالأعلى.' : 'سيتم عرض مواعيد اللقاءات هنا بمجرد إضافتها.'}</span></div>
    : <div className="session-list">
      {visibleSessions.map(session => {
        const cohort = cohorts.find(item => item.id === session.cohort_id)
        return <article className="session-card" key={session.id}>
          <div className="session-date-icon"><CalendarDays size={22}/></div>
          <div className="session-card-content">
            <div className="session-card-top"><span className="cohort-status">{cohort?.name ?? 'الدفعة'}</span>{canManage && <div className="session-actions"><button onClick={() => startEditing(session)} aria-label="تعديل اللقاء"><Pencil size={15}/></button><button onClick={() => void deleteSession(session.id)} aria-label="حذف اللقاء"><Trash2 size={15}/></button></div>}</div>
            <h2>{session.title}</h2>
            <p className="session-time"><Clock size={15}/>{displayDate(session.starts_at)}</p>
            {session.location_or_link && <p className="session-location"><MapPin size={15}/><span>{session.location_or_link}</span></p>}
            {session.notes && <div className="session-notes">{session.notes.split(/(https?:\/\/[^\s]+)/g).map((part, index) => /^https?:\/\//.test(part) ? <a key={index} href={part} target="_blank" rel="noreferrer">{part} <LinkIcon size={12}/></a> : <span key={index}>{part}</span>)}</div>}
            {attachments.filter(file => file.session_id === session.id).length > 0 && <div className="session-attachments">
              <strong><Paperclip size={14}/> الملفات المرفقة</strong>
              {attachments.filter(file => file.session_id === session.id).map(file => <div className="session-attachment" key={file.id}>
                <FileText size={16}/>
                <span>{file.file_name}<small>{file.file_size ? (file.file_size / (1024 * 1024)).toFixed(2) + ' MB' : 'ملف مرفق'}</small></span>
                <button type="button" onClick={() => void openAttachment(file)} aria-label="فتح الملف"><Download size={15}/></button>
                {canManage && <button type="button" onClick={() => void deleteAttachment(file)} aria-label="حذف الملف"><Trash2 size={14}/></button>}
              </div>)}
            </div>}
          </div>
        </article>
      })}
    </div>}
  </section>
}

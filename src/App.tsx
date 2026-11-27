import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Anchor, BookOpen, CalendarCheck, ClipboardList, Home, LogIn, Menu, Megaphone, Settings, ShieldCheck, Users, X, ChevronLeft, FileText, Award, Bell, Eye, EyeOff } from 'lucide-react'
import { supabase } from './supabase'
import AdminDashboard from './AdminDashboard'
import CurrentCohort from './CurrentCohort'

type Page = 'home' | 'library' | 'assignments' | 'attendance' | 'cohort' | 'admin'
const nav: {id:Page; label:string; icon: typeof Home}[] = [
  {id:'home',label:'الرئيسية',icon:Home},{id:'library',label:'مكتبة المحاضرات',icon:BookOpen},{id:'assignments',label:'التكليفات',icon:ClipboardList},{id:'attendance',label:'الحضور',icon:CalendarCheck},{id:'cohort',label:'الدفعة الحالية',icon:Users},{id:'admin',label:'الإدارة',icon:Settings}
]

export default function App() {
  const [page,setPage] = useState<Page>('home')
  const [menu,setMenu] = useState(false)
  const [showLogin,setShowLogin] = useState(false)
  const [registerMode,setRegisterMode] = useState(false)
  const [fullName,setFullName] = useState('')
  const [email,setEmail] = useState('')
  const [password,setPassword] = useState('')
  const [showPassword,setShowPassword] = useState(false)
  const [notice,setNotice] = useState('')
  const [userRole,setUserRole] = useState<'admin'|'instructor'|'trainee'|null>(null)
  const [userName,setUserName] = useState('')
  const [signedIn,setSignedIn] = useState(false)

  async function loadProfile(userId: string) {
    if (!supabase) return
    const {data,error} = await supabase.from('profiles').select('role, full_name').eq('id',userId).single()
    if (error) { setNotice('تم تسجيل الدخول، لكن تعذر تحميل صلاحيات الحساب.'); return }
    setUserRole(data.role)
    setUserName(data.full_name || '')
  }

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({data}) => {
      const session = data.session
      setSignedIn(Boolean(session))
      if (session?.user) void loadProfile(session.user.id)
    })
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,session) => {
      setSignedIn(Boolean(session))
      if (session?.user) {
        Promise.resolve().then(() => loadProfile(session.user.id))
      } else {
        setUserRole(null)
        setUserName('')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    if (!supabase) return
    const {error} = await supabase.auth.signOut()
    if (error) setNotice(error.message)
    else { setNotice('تم تسجيل الخروج.'); setPage('home') }
  }

  async function signIn(e: FormEvent) {
    e.preventDefault()
    if (!supabase) { setNotice('المنصة في مرحلة التجهيز. سيتم تفعيل تسجيل الحسابات بعد ربط قاعدة البيانات.'); return }
    const {data,error} = await supabase.auth.signInWithPassword({email,password})
    if (error) { setNotice(error.message); return }
    setNotice('تم تسجيل الدخول بنجاح.')
    setShowLogin(false)
    setSignedIn(true)
    if (data.user) await loadProfile(data.user.id)
  }

  async function signUp(e: FormEvent) {
    e.preventDefault()
    if (!supabase) { setNotice('تعذر الاتصال بقاعدة البيانات.'); return }
    const {data,error} = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() } }
    })
    if (error) { setNotice('لم نتمكن من إنشاء الحساب: ' + error.message); return }
    setPassword('')
    setFullName('')
    if (data.session && data.user) {
      setSignedIn(true)
      await loadProfile(data.user.id)
      setNotice('تم إنشاء حساب المتدرب وتسجيل الدخول بنجاح.')
      setShowLogin(false)
    } else {
      setRegisterMode(false)
      setNotice('تم إنشاء الحساب. افتح رسالة التأكيد التي وصلتك على البريد الإلكتروني، وبعدها سجّل الدخول.')
    }
  }

  function openAuth(register = false) {
    setRegisterMode(register)
    setNotice('')
    setShowLogin(true)
  }

  const current = nav.find(n=>n.id===page)!
  return <div className="app-shell">
    <aside className={`sidebar ${menu?'open':''}`}>
      <div className="brand"><div className="brand-mark"><Anchor size={25}/></div><div><b>HORUS LEADERS</b><small>مجموعة حورس البحرية</small></div><button className="close-menu" onClick={()=>setMenu(false)} aria-label="إغلاق"><X/></button></div>
      <div className="side-caption">مساحة التدريب</div>
      <nav>{nav.filter(item=>item.id!=='admin'||userRole==='admin').map(item=>{const Icon=item.icon;return <button key={item.id} className={`nav-item ${page===item.id?'active':''}`} onClick={()=>{setPage(item.id);setMenu(false)}}><Icon size={19}/><span>{item.label}</span>{page===item.id&&<ChevronLeft size={16} className="nav-arrow"/>}</button>})}</nav>
      <div className="sidebar-bottom"><div className="support-card"><ShieldCheck size={19}/><b>رحلة إعداد القادة</b><p>نتعلم، نخدم، ونقود بروح الفريق.</p></div><small>الإصدار التجريبي 0.1</small></div>
    </aside>
    {menu&&<button className="scrim" onClick={()=>setMenu(false)} aria-label="إغلاق القائمة"/>}
    <main className="main-area">
      <header className="topbar"><button className="icon-btn mobile-menu" onClick={()=>setMenu(true)} aria-label="القائمة"><Menu/></button><div className="breadcrumb">Horus Leaders <span>/</span> {current.label}</div><div className="top-actions"><button className="icon-btn" aria-label="الإشعارات"><Bell size={19}/><i/></button>{signedIn ? <><span className="breadcrumb">{userName || (userRole==='admin'?'مدير المنصة':userRole==='instructor'?'مدرب':'متدرب')} · {userRole==='admin'?'Admin':userRole==='instructor'?'Instructor':'Trainee'}</span><button className="login-btn" onClick={signOut}>تسجيل الخروج</button></> : <><button className="login-btn" onClick={()=>openAuth(false)}><LogIn size={17}/> دخول المتدربين</button><button className="login-btn register-top-btn" onClick={()=>openAuth(true)}>إنشاء حساب</button></>}</div></header>
      <div className="content">
        {page==='home'&&<>
          <section className="welcome"><div className="welcome-copy"><span className="eyebrow">LEADERS PREPARATION SECTOR</span><h1>أهلاً بيك في <em>Horus Leaders</em></h1><p>مساحتك للتعلم والتدريب ومتابعة رحلتك في إعداد القادة.</p><button className="gold-btn" onClick={()=>openAuth(false)}>ابدأ رحلتك <ChevronLeft size={17}/></button></div><div className="welcome-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="compass"><Anchor size={76} strokeWidth={1.1}/></div><span className="star s1">✦</span><span className="star s2">✧</span></div></section>
          <div className="section-heading"><div><span className="eyebrow">YOUR TRAINING SPACE</span><h2>كل اللي تحتاجه في مكان واحد</h2></div><span className="live-pill"><i/> مساحة التدريب</span></div>
          <section className="feature-grid">
            <Feature icon={<BookOpen/>} title="مكتبة المحاضرات" desc="المحتوى الأساسي والمراجع متاحة للرجوع إليها في أي وقت." tag="تعلم" onClick={()=>setPage('library')}/>
            <Feature icon={<ClipboardList/>} title="التكليفات والاختبارات" desc="تابع المطلوب منك وسلّم التكليفات واعرف تقييمك." tag="تطبيق" onClick={()=>setPage('assignments')}/>
            <Feature icon={<CalendarCheck/>} title="الحضور والمتابعة" desc="سجل حضورك وتابع تقدمك خلال البرنامج التدريبي." tag="متابعة" onClick={()=>setPage('attendance')}/>
            <Feature icon={<Users/>} title="دفعتك التدريبية" desc="اعرف مواعيد اللقاءات وآخر الإعلانات الخاصة بدفعتك." tag="مجتمع" onClick={()=>setPage('cohort')}/>
          </section>
          <section className="bottom-grid"><div className="panel announcement"><div className="panel-icon"><Megaphone size={20}/></div><div><span className="eyebrow">ANNOUNCEMENTS</span><h3>الإعلانات والتنبيهات</h3><p>هنا هتظهر أخبار المجموعة ومواعيد اللقاءات وأي تحديثات مهمة.</p></div><span className="coming">قريبًا</span></div><div className="panel progress-panel"><div className="progress-top"><div><span className="eyebrow">YOUR JOURNEY</span><h3>رحلتك التدريبية</h3></div><Award size={24}/></div><div className="progress-track"><span/></div><small>سجّل دخولك لمتابعة تقدمك</small></div></section>
        </>}
        {page==='admin'&&userRole!=='admin' ? <section className="page-panel"><h1>غير مصرح بالدخول</h1><p>هذه الصفحة مخصصة لمدير المنصة فقط.</p><button className="outline-btn" onClick={()=>setPage('home')}>العودة للرئيسية</button></section> : page==='admin' ? <AdminDashboard/> : page==='cohort' ? <CurrentCohort signedIn={signedIn}/> : page!=='home'&&<section className="page-panel"><div className="page-icon"><current.icon size={28}/></div><span className="eyebrow">HORUS LEADERS</span><h1>{current.label}</h1><p>{pageDescription(page)}</p><div className="empty-state"><div className="empty-icon"><FileText size={30}/></div><b>المساحة دي تحت التجهيز</b><span>هنضيف المحتوى والبيانات بعد ربط قاعدة البيانات وتجهيز حسابات الإدارة.</span><button className="outline-btn" onClick={()=>setPage('home')}>العودة للرئيسية</button></div></section>}
        <footer><span>© 2026 Horus Leaders</span><span>مجموعة حورس البحرية – قطاع إعداد قادة</span></footer>
      </div>
    </main>
    {showLogin&&<div className="modal-backdrop" onClick={()=>setShowLogin(false)}><div className="login-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setShowLogin(false)}><X/></button><div className="modal-brand"><div className="brand-mark"><Anchor/></div><span className="eyebrow">{registerMode?'JOIN HORUS LEADERS':'WELCOME BACK'}</span><h2>{registerMode?'إنشاء حساب متدرب':'تسجيل الدخول'}</h2><p>{registerMode?'سجّل بياناتك للانضمام إلى المنصة':'ادخل على حسابك لمتابعة رحلتك التدريبية'}</p></div><form onSubmit={registerMode?signUp:signIn}>{registerMode&&<><label>الاسم بالكامل</label><input type="text" placeholder="الاسم كما سيظهر في المنصة" value={fullName} onChange={e=>setFullName(e.target.value)} required maxLength={100}/></>}<label>البريد الإلكتروني</label><input type="email" placeholder="name@example.com" value={email} onChange={e=>setEmail(e.target.value)} required/><label>كلمة المرور</label><div className="password-field"><input type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} required minLength={8}/><button type="button" className="password-toggle" onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} title={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div><button className="gold-btn full" type="submit">{registerMode?'إنشاء الحساب':'تسجيل الدخول'} <ChevronLeft size={17}/></button></form>{notice&&<div className="notice">{notice}</div>}<button className="auth-switch" onClick={()=>{setRegisterMode(value=>!value);setNotice('')}}>{registerMode?'عندك حساب بالفعل؟ سجّل الدخول':'مستخدم جديد؟ أنشئ حساب متدرب'}</button><small className="privacy-note">كل حساب جديد يحصل تلقائيًا على صلاحية متدرب فقط. لا نطلب مستندات إثبات هوية.</small></div></div>}
  </div>
}

function Feature({icon,title,desc,tag,onClick}:{icon:ReactNode;title:string;desc:string;tag:string;onClick:()=>void}){return <button className="feature-card" onClick={onClick}><div className="feature-top"><div className="feature-icon">{icon}</div><span>{tag}</span></div><h3>{title}</h3><p>{desc}</p><div className="feature-link">استكشف <ChevronLeft size={16}/></div></button>}
function pageDescription(page:Page){return ({library:'المحاضرات الأساسية والمراجع والمواد التدريبية المشتركة بين الدفعات.',assignments:'التكليفات المطلوبة ومواعيد التسليم والاختبارات والتقييمات.',attendance:'متابعة الحضور والغياب وسجل المشاركة في اللقاءات.',cohort:'معلومات الدفعة الحالية ومواعيد اللقاءات والإعلانات.',admin:'إدارة المتدربين والمدربين والمحتوى والدفعات والتقارير.',home:''})[page]}

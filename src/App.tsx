import { useState, type FormEvent, type ReactNode } from 'react'
import { Anchor, BookOpen, CalendarCheck, ClipboardList, GraduationCap, Home, LogIn, Menu, Megaphone, Settings, ShieldCheck, Users, X, ChevronLeft, FileText, Award, Bell } from 'lucide-react'
import { supabase } from './supabase'

type Page = 'home' | 'library' | 'assignments' | 'attendance' | 'cohort' | 'admin'
const nav: {id:Page; label:string; icon: typeof Home}[] = [
  {id:'home',label:'الرئيسية',icon:Home},{id:'library',label:'مكتبة المحاضرات',icon:BookOpen},{id:'assignments',label:'التكليفات',icon:ClipboardList},{id:'attendance',label:'الحضور',icon:CalendarCheck},{id:'cohort',label:'الدفعة الحالية',icon:Users},{id:'admin',label:'الإدارة',icon:Settings}
]

export default function App() {
  const [page,setPage] = useState<Page>('home')
  const [menu,setMenu] = useState(false)
  const [showLogin,setShowLogin] = useState(false)
  const [email,setEmail] = useState('')
  const [password,setPassword] = useState('')
  const [notice,setNotice] = useState('')
  const [role,setRole] = useState<'trainee'|'instructor'>('trainee')

  async function signIn(e: FormEvent) {
    e.preventDefault()
    if (!supabase) { setNotice('المنصة في مرحلة التجهيز. سيتم تفعيل تسجيل الحسابات بعد ربط قاعدة البيانات.'); return }
    const {error} = await supabase.auth.signInWithPassword({email,password})
    setNotice(error ? error.message : 'تم تسجيل الدخول بنجاح.')
  }

  const current = nav.find(n=>n.id===page)!
  return <div className="app-shell">
    <aside className={`sidebar ${menu?'open':''}`}>
      <div className="brand"><div className="brand-mark"><Anchor size={25}/></div><div><b>HORUS LEADERS</b><small>مجموعة حورس البحرية</small></div><button className="close-menu" onClick={()=>setMenu(false)} aria-label="إغلاق"><X/></button></div>
      <div className="side-caption">مساحة التدريب</div>
      <nav>{nav.map(item=>{const Icon=item.icon;return <button key={item.id} className={`nav-item ${page===item.id?'active':''}`} onClick={()=>{setPage(item.id);setMenu(false)}}><Icon size={19}/><span>{item.label}</span>{page===item.id&&<ChevronLeft size={16} className="nav-arrow"/>}</button>})}</nav>
      <div className="sidebar-bottom"><div className="support-card"><ShieldCheck size={19}/><b>رحلة إعداد القادة</b><p>نتعلم، نخدم، ونقود بروح الفريق.</p></div><small>الإصدار التجريبي 0.1</small></div>
    </aside>
    {menu&&<button className="scrim" onClick={()=>setMenu(false)} aria-label="إغلاق القائمة"/>}
    <main className="main-area">
      <header className="topbar"><button className="icon-btn mobile-menu" onClick={()=>setMenu(true)} aria-label="القائمة"><Menu/></button><div className="breadcrumb">Horus Leaders <span>/</span> {current.label}</div><div className="top-actions"><button className="icon-btn" aria-label="الإشعارات"><Bell size={19}/><i/></button><button className="login-btn" onClick={()=>setShowLogin(true)}><LogIn size={17}/> دخول المتدربين</button></div></header>
      <div className="content">
        {page==='home'&&<>
          <section className="welcome"><div className="welcome-copy"><span className="eyebrow">LEADERS PREPARATION SECTOR</span><h1>أهلاً بيك في <em>Horus Leaders</em></h1><p>مساحتك للتعلم والتدريب ومتابعة رحلتك في إعداد القادة.</p><button className="gold-btn" onClick={()=>setShowLogin(true)}>ابدأ رحلتك <ChevronLeft size={17}/></button></div><div className="welcome-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="compass"><Anchor size={76} strokeWidth={1.1}/></div><span className="star s1">✦</span><span className="star s2">✧</span></div></section>
          <div className="section-heading"><div><span className="eyebrow">YOUR TRAINING SPACE</span><h2>كل اللي تحتاجه في مكان واحد</h2></div><span className="live-pill"><i/> مساحة التدريب</span></div>
          <section className="feature-grid">
            <Feature icon={<BookOpen/>} title="مكتبة المحاضرات" desc="المحتوى الأساسي والمراجع متاحة للرجوع إليها في أي وقت." tag="تعلم" onClick={()=>setPage('library')}/>
            <Feature icon={<ClipboardList/>} title="التكليفات والاختبارات" desc="تابع المطلوب منك وسلّم التكليفات واعرف تقييمك." tag="تطبيق" onClick={()=>setPage('assignments')}/>
            <Feature icon={<CalendarCheck/>} title="الحضور والمتابعة" desc="سجل حضورك وتابع تقدمك خلال البرنامج التدريبي." tag="متابعة" onClick={()=>setPage('attendance')}/>
            <Feature icon={<Users/>} title="دفعتك التدريبية" desc="اعرف مواعيد اللقاءات وآخر الإعلانات الخاصة بدفعتك." tag="مجتمع" onClick={()=>setPage('cohort')}/>
          </section>
          <section className="bottom-grid"><div className="panel announcement"><div className="panel-icon"><Megaphone size={20}/></div><div><span className="eyebrow">ANNOUNCEMENTS</span><h3>الإعلانات والتنبيهات</h3><p>هنا هتظهر أخبار المجموعة ومواعيد اللقاءات وأي تحديثات مهمة.</p></div><span className="coming">قريبًا</span></div><div className="panel progress-panel"><div className="progress-top"><div><span className="eyebrow">YOUR JOURNEY</span><h3>رحلتك التدريبية</h3></div><Award size={24}/></div><div className="progress-track"><span/></div><small>سجّل دخولك لمتابعة تقدمك</small></div></section>
        </>}
        {page!=='home'&&<section className="page-panel"><div className="page-icon"><current.icon size={28}/></div><span className="eyebrow">HORUS LEADERS</span><h1>{current.label}</h1><p>{pageDescription(page)}</p><div className="empty-state"><div className="empty-icon"><FileText size={30}/></div><b>المساحة دي تحت التجهيز</b><span>هنضيف المحتوى والبيانات بعد ربط قاعدة البيانات وتجهيز حسابات الإدارة.</span><button className="outline-btn" onClick={()=>setPage('home')}>العودة للرئيسية</button></div></section>}
        <footer><span>© 2026 Horus Leaders</span><span>مجموعة حورس البحرية – قطاع إعداد قادة</span></footer>
      </div>
    </main>
    {showLogin&&<div className="modal-backdrop" onClick={()=>setShowLogin(false)}><div className="login-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setShowLogin(false)}><X/></button><div className="modal-brand"><div className="brand-mark"><Anchor/></div><span className="eyebrow">WELCOME BACK</span><h2>تسجيل الدخول</h2><p>ادخل على حسابك لمتابعة رحلتك التدريبية</p></div><div className="role-switch"><button className={role==='trainee'?'selected':''} onClick={()=>setRole('trainee')}><GraduationCap size={17}/> متدرب</button><button className={role==='instructor'?'selected':''} onClick={()=>setRole('instructor')}><ShieldCheck size={17}/> مدرب / إدارة</button></div><form onSubmit={signIn}><label>البريد الإلكتروني</label><input type="email" placeholder="name@example.com" value={email} onChange={e=>setEmail(e.target.value)} required/><label>كلمة المرور</label><input type="password" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} required/><button className="gold-btn full" type="submit">تسجيل الدخول <ChevronLeft size={17}/></button></form>{notice&&<div className="notice">{notice}</div>}<small className="privacy-note">التسجيل بالإيميل وكلمة المرور فقط. لا نطلب مستندات إثبات هوية.</small></div></div>}
  </div>
}

function Feature({icon,title,desc,tag,onClick}:{icon:ReactNode;title:string;desc:string;tag:string;onClick:()=>void}){return <button className="feature-card" onClick={onClick}><div className="feature-top"><div className="feature-icon">{icon}</div><span>{tag}</span></div><h3>{title}</h3><p>{desc}</p><div className="feature-link">استكشف <ChevronLeft size={16}/></div></button>}
function pageDescription(page:Page){return ({library:'المحاضرات الأساسية والمراجع والمواد التدريبية المشتركة بين الدفعات.',assignments:'التكليفات المطلوبة ومواعيد التسليم والاختبارات والتقييمات.',attendance:'متابعة الحضور والغياب وسجل المشاركة في اللقاءات.',cohort:'معلومات الدفعة الحالية ومواعيد اللقاءات والإعلانات.',admin:'إدارة المتدربين والمدربين والمحتوى والدفعات والتقارير.',home:''})[page]}

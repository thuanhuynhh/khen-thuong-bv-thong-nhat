import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { readSheet } from "read-excel-file/browser";
import {
  Award, Bell, ChevronDown, ChevronRight, CircleHelp, Download, FileCheck2, FileSpreadsheet,
  Filter, LayoutDashboard, LogOut, Medal, Menu, Plus, RefreshCw, Search, Settings, ShieldCheck,
  SlidersHorizontal, Sparkles, UploadCloud, UserRound, Users, X, Check, AlertCircle
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { achievementLevels, achievementTypes, levelLabels, roles, typeLabels, type AchievementInput, type AchievementLevel, type AchievementType, type EmployeeInput, type Role, type SessionUser } from "@thongnhat/shared";
import { api, ApiError, hasToken, setToken, type UserCounts, type UserRecord } from "./api";
import { demoEmployees } from "./demo";
import hospitalLogo from "./assets/logo-bvtn.png";

type Page = "dashboard" | "employees" | "candidates" | "import" | "users" | "settings";
type Toast = { id: number; type: "success" | "error"; message: string };

const nav: Array<{ group: string; items: Array<{ id: Page; label: string; icon: LucideIcon }> }> = [
  { group: "Tổng quan", items: [{ id: "dashboard", label: "Bảng điều khiển", icon: LayoutDashboard }] },
  { group: "Nghiệp vụ", items: [
    { id: "employees", label: "Hồ sơ nhân viên", icon: Users },
    { id: "candidates", label: "Đề xuất khen thưởng", icon: Medal },
    { id: "import", label: "Nhập dữ liệu Excel", icon: FileSpreadsheet }
  ] },
  { group: "Hệ thống", items: [
    { id: "users", label: "Người dùng & phân quyền", icon: ShieldCheck },
    { id: "settings", label: "Thiết lập", icon: Settings }
  ] }
];

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [demo, setDemo] = useState(false);
  const [page, setPage] = useState<Page>("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [loadingSession, setLoadingSession] = useState(hasToken());
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = (type: Toast["type"], message: string) => {
    const id = Date.now(); setToasts((x) => [...x, { id, type, message }]);
    window.setTimeout(() => setToasts((x) => x.filter((t) => t.id !== id)), 4200);
  };

  useEffect(() => {
    if (!hasToken()) return;
    api.me().then(({ user }) => setUser(user)).catch(() => setToken("")).finally(() => setLoadingSession(false));
  }, []);

  if (loadingSession) return <div className="boot"><div className="brand-mark"><HospitalLogo /></div><div className="boot-line" /></div>;
  if (!user && !demo) return <Login onLogin={setUser} />;

  const currentUser = user ?? { id: "demo", username: "demo", displayName: "Nguyễn Thanh Vân", role: "ADMIN" as const };
  const logout = async () => { if (!demo) await api.logout().catch(() => undefined); setToken(""); setUser(null); setDemo(false); };

  return <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><HospitalLogo /></div>
        {!collapsed && <div><strong>Bệnh viện Thống Nhất</strong><span>Quản lý khen thưởng</span></div>}
      </div>
      <nav aria-label="Điều hướng chính">
        {nav.map((section) => <div className="nav-section" key={section.group}>
          {!collapsed && <div className="nav-label">{section.group}</div>}
          {section.items.map((item) => <button key={item.id} className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => setPage(item.id)} title={collapsed ? item.label : undefined}>
            <item.icon size={19} /><span>{item.label}</span>{!collapsed && page === item.id && <ChevronRight size={16} />}
          </button>)}
        </div>)}
      </nav>
      <div className="sidebar-footer">
        {!collapsed && <div className="help-card"><CircleHelp size={20} /><div><strong>Cần hỗ trợ?</strong><span>Xem hướng dẫn sử dụng</span></div></div>}
        <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)}><Menu size={19} />{!collapsed && <span>Thu gọn thanh bên</span>}</button>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumb"><span>Bệnh viện Thống Nhất</span><ChevronRight size={15} /><strong>{nav.flatMap(x => x.items).find(x => x.id === page)?.label}</strong></div>
        <div className="top-actions">
          {demo && <span className="demo-badge">Dữ liệu minh họa</span>}
          <button className="icon-button" aria-label="Thông báo"><Bell size={19} /><i /></button>
          <div className="user-menu"><div className="avatar">{initials(currentUser.displayName)}</div><div><strong>{currentUser.displayName}</strong><span>{roleLabel(currentUser.role)}</span></div><ChevronDown size={16} /></div>
          <button className="icon-button" aria-label="Đăng xuất" onClick={() => void logout()}><LogOut size={18} /></button>
        </div>
      </header>
      <main id="main-content">
        {page === "dashboard" && <Dashboard demo={demo} displayName={currentUser.displayName} onNavigate={setPage} />}
        {page === "employees" && <EmployeesPage demo={demo} toast={toast} />}
        {page === "candidates" && <CandidatesPage demo={demo} toast={toast} />}
        {page === "import" && <ImportPage demo={demo} toast={toast} />}
        {page === "users" && <UsersPage user={currentUser} toast={toast} onCurrentUserUpdated={(updated)=>setUser(current=>current&&current.id===updated.id?{...current,displayName:updated.displayName,role:updated.role}:current)} />}
        {page === "settings" && <SettingsPage />}
      </main>
    </div>
    <div className="toast-stack" aria-live="polite">{toasts.map(t => <div className={`toast ${t.type}`} key={t.id}>{t.type === "success" ? <Check /> : <AlertCircle />}<span>{t.message}</span></div>)}</div>
  </div>;
}

function Login({ onLogin }: { onLogin: (u: SessionUser) => void }) {
  const [username, setUsername] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(""); setLoading(true);
    try { const result = await api.login(username, password); setToken(result.token); onLogin(result.user); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Không thể kết nối máy chủ."); }
    finally { setLoading(false); }
  };
  return <div className="login-screen">
    <section className="login-story">
      <div className="hospital-seal"><HospitalLogo /></div>
      <div className="story-copy"><span className="eyebrow">BỆNH VIỆN THỐNG NHẤT</span><h1>Ghi nhận xứng đáng.<br/>Lan tỏa cống hiến.</h1><p>Một không gian thống nhất để quản lý hồ sơ thành tích, sàng lọc tiêu chuẩn và đề xuất khen thưởng minh bạch.</p></div>
      <div className="story-stats"><div><strong>01</strong><span>Nguồn dữ liệu<br/>đồng nhất</span></div><div><strong>360°</strong><span>Hồ sơ thành tích<br/>toàn diện</span></div><div><strong>100%</strong><span>Truy vết<br/>thay đổi</span></div></div>
      <div className="story-orbit"><span/><span/><span/></div>
    </section>
    <section className="login-panel"><form onSubmit={submit}>
      <div className="mobile-brand"><div className="brand-mark"><HospitalLogo /></div><strong>Bệnh viện Thống Nhất</strong></div>
      <span className="eyebrow teal">CỔNG NGHIỆP VỤ NỘI BỘ</span><h2>Chào mừng trở lại</h2><p className="muted">Đăng nhập bằng tài khoản được quản trị viên cấp.</p>
      {error && <div className="form-error" role="alert"><AlertCircle size={18}/>{error}</div>}
      <label>Tên đăng nhập<input autoFocus autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} placeholder="Nhập tên đăng nhập" required /></label>
      <label>Mật khẩu<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Nhập mật khẩu" required /></label>
      <button className="primary-button full" disabled={loading}>{loading ? <><RefreshCw className="spin" size={18}/>Đang xác thực</> : <>Đăng nhập<ChevronRight size={18}/></>}</button>
      <div className="security-note"><ShieldCheck size={19}/><span>Dữ liệu được mã hóa khi truyền và phân quyền theo vai trò.</span></div>
    </form></section>
  </div>;
}

function Dashboard({ demo, displayName, onNavigate }: { demo: boolean; displayName:string; onNavigate: (p: Page) => void }) {
  const now=new Date();const year=now.getFullYear(); const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { if (!demo) void api.dashboard(year).then(setData).catch(() => undefined); }, [demo, year]);
  const monthly=(data?.monthly as number[]|undefined)??Array.from({length:12},()=>0);const chartMax=Math.max(1,...monthly);const chartTicks=[chartMax,Math.round(chartMax*2/3),Math.round(chartMax/3),0];const recent=(data?.recent as Array<Record<string,unknown>>|undefined)??[];const candidateCount=Number(data?.candidates??0);
  const stats = [
    { label: "Nhân viên đang quản lý", value: String(data?.employees ?? "—"), delta: "Đang hoạt động", icon: Users, tone: "blue" },
    { label: `Thành tích năm ${year}`, value: String(data?.achievements ?? "—"), delta: "Theo ngày chấp nhận", icon: Award, tone: "teal" },
    { label: "Đơn vị trực thuộc", value: String(data?.units ?? "—"), delta: "Có nhân sự hoạt động", icon: LayoutDashboard, tone: "violet" },
    { label: "Hồ sơ có thể xét", value: String(data?.candidates ?? "—"), delta: "Theo bộ tiêu chuẩn", icon: Sparkles, tone: "amber" }
  ];
  return <div className="page dashboard-page">
    <PageTitle eyebrow={`THÁNG ${String(now.getMonth()+1).padStart(2,"0")} · ${year}`} title={`Chào buổi sáng, ${displayName}`} description="Số liệu trực tiếp từ hồ sơ nhân sự và thành tích trên D1." action={<button className="primary-button" onClick={() => onNavigate("candidates")}><Sparkles size={18}/>Xem đề xuất mới</button>} />
    <div className="stat-grid">{stats.map(s => <article className="stat-card" key={s.label}><div className={`stat-icon ${s.tone}`}><s.icon size={21}/></div><div className="stat-meta"><span>{s.label}</span><strong>{s.value}</strong><small>{s.delta}</small></div></article>)}</div>
    <div className="dashboard-grid">
      <section className="panel activity-panel"><PanelHeader title="Nhịp độ ghi nhận" subtitle={`Thành tích được cập nhật trong ${year}`} action={<button className="ghost-button"><Download size={16}/>Xuất báo cáo</button>}/>
        <div className="chart-wrap"><div className="chart-y">{chartTicks.map((tick,index)=><span key={`${tick}-${index}`}>{tick}</span>)}</div><div className="bar-chart">
          {monthly.map((value,i)=><div className="bar-col" key={i}><div className={`bar ${i===now.getMonth()?"highlight":""}`} style={{height:`${Math.max(value?12:2,(value/chartMax)*150)}px`}}><span>{value}</span></div><small>T{i+1}</small></div>)}
        </div></div><div className="chart-legend"><span><i className="legend-dot current"/>Dữ liệu năm {year}</span></div>
      </section>
      <section className="panel recommendation-panel"><PanelHeader title="Đề xuất nổi bật" subtitle="Từ bộ lọc tiêu chuẩn hiện hành" />
        <div className="award-emblem"><Medal size={30}/></div><span className="recommend-label">KẾT QUẢ ĐỐI CHIẾU TỰ ĐỘNG</span><strong>{candidateCount.toLocaleString("vi-VN")} hồ sơ phù hợp</strong><p>Được tính trực tiếp từ bộ tiêu chuẩn đang bật và thành tích đã ghi nhận.</p>
        <button className="secondary-button full" onClick={() => onNavigate("candidates")}>Rà soát danh sách<ChevronRight size={17}/></button>
      </section>
      <section className="panel recent-panel"><PanelHeader title="Cập nhật gần đây" subtitle="Dữ liệu mới ghi nhận trên hệ thống" action={<button className="text-button" onClick={() => onNavigate("employees")}>Xem tất cả</button>}/>
        <div className="activity-list">{recent.length?recent.map((item,i)=><div className="activity-item" key={String(item.id)}><div className={`activity-icon a${i}`}><FileCheck2 size={18}/></div><div><strong>{String(item.fullName)}</strong><span>{String(item.title)}</span></div><span className="achievement-tag">{typeLabels[item.type as AchievementType]??String(item.type)}</span><time>{formatDate(item.acceptedDate)}</time></div>):<div className="empty-inline">Chưa có thành tích nào được ghi nhận.</div>}</div>
      </section>
    </div>
  </div>;
}

function EmployeesPage({ demo, toast }: { demo: boolean; toast: (t: Toast["type"], m: string) => void }) {
  const pageSize=25; const [employees,setEmployees]=useState<Array<Record<string,unknown>>>(demoEmployees); const [total,setTotal]=useState(demoEmployees.length); const [page,setPage]=useState(1);
  const [search,setSearch]=useState(""); const [filtersOpen,setFiltersOpen]=useState(true); const [modal,setModal]=useState(false); const [selectedId,setSelectedId]=useState<string|null>(null); const [units,setUnits]=useState<string[]>([]);
  const [unit,setUnit]=useState(""); const [level,setLevel]=useState(""); const [year,setYear]=useState("");
  const load=(targetPage=page)=>{if(demo)return;const q=new URLSearchParams({search,page:String(targetPage),pageSize:String(pageSize),...(unit&&{unit}),...(level&&{achievementLevel:level}),...(year&&{fromYear:year,toYear:year})});api.employees(q.toString()).then(x=>{setEmployees(x.items);setTotal(x.total);setPage(targetPage)}).catch(e=>toast("error",e.message))};
  useEffect(()=>{if(demo){setUnits([...new Set(demoEmployees.map(e=>String(e.unit)))])}else{void api.options().then(x=>setUnits(x.units));load(1)}},[demo]);
  const shown=demo?employees.filter(e=>String(e.fullName).toLowerCase().includes(search.toLowerCase())||String(e.citizenId).includes(search)):employees;
  const effectiveTotal=demo?shown.length:total; const totalPages=Math.max(1,Math.ceil(effectiveTotal/pageSize)); const first=effectiveTotal?(page-1)*pageSize+1:0; const last=Math.min(page*pageSize,effectiveTotal);
  const go=(target:number)=>{const next=Math.min(Math.max(target,1),totalPages);if(!demo)load(next);else setPage(next)};
  return <div className="page">
    <PageTitle eyebrow="HỒ SƠ NHÂN SỰ" title="Danh sách nhân viên" description="Chọn một nhân viên để xem hồ sơ và thêm thành tích hằng năm." action={<button className="primary-button" onClick={()=>setModal(true)}><Plus size={18}/>Thêm nhân viên</button>}/>
    <section className="panel data-panel">
      <div className="table-toolbar"><div className="search-box"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){setPage(1);load(1)}}} placeholder="Tìm theo họ tên hoặc CCCD..."/><kbd>Enter</kbd></div><button className={`filter-button ${filtersOpen?"active":""}`} onClick={()=>setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={17}/>Bộ lọc chi tiết</button><button className="ghost-button"><Download size={17}/>Xuất Excel</button></div>
      {filtersOpen&&<div className="filter-drawer"><div className="filter-heading"><div><Filter size={17}/><strong>Điều kiện lọc</strong></div><button className="text-button" onClick={()=>{setUnit("");setLevel("");setYear("")}}>Xóa tất cả</button></div><div className="filter-grid">
        <label>Đơn vị<SearchableSelect value={unit} onChange={setUnit} options={units} placeholder="Tất cả đơn vị" allowClear/></label>
        <label>Loại thành tích<select><option>Tất cả loại</option>{achievementTypes.map(type=><option key={type}>{typeLabels[type]}</option>)}</select></label>
        <label>Cấp / hạng<select value={level} onChange={e=>setLevel(e.target.value)}><option value="">Tất cả cấp</option>{achievementLevels.map(x=><option key={x} value={x}>{levelLabels[x]}</option>)}</select></label>
        <label>Năm ghi nhận<input type="number" value={year} onChange={e=>setYear(e.target.value)} placeholder="Ví dụ: 2026"/></label>
        <button className="secondary-button apply-filter" onClick={()=>{setPage(1);load(1)}}>Áp dụng bộ lọc</button>
      </div></div>}
      <div className="table-summary"><span><strong>{effectiveTotal.toLocaleString("vi-VN")}</strong> nhân viên</span><span>Nhấn vào dòng để mở hồ sơ</span></div>
      <div className="table-scroll"><table><thead><tr><th>Nhân viên</th><th>CCCD</th><th>Đơn vị</th><th>Chức vụ / chức danh</th><th>Trình độ</th><th>Thành tích</th><th></th></tr></thead><tbody>{shown.map((employee,index)=><tr className="clickable-row" key={String(employee.id)} tabIndex={0} onClick={()=>setSelectedId(String(employee.id))} onKeyDown={event=>{if(event.key==="Enter"||event.key===" ")setSelectedId(String(employee.id))}}><td><div className={`person-cell avatar-tone-${index%5}`}><div className="mini-avatar">{initials(String(employee.fullName))}</div><div><strong>{String(employee.fullName)}</strong><span>{genderLabel(String(employee.gender))} · {formatDate(employee.dateOfBirth)}</span></div></div></td><td className="mono">{String(employee.citizenId)}</td><td><span className="unit-cell">{String(employee.unit)}</span></td><td><strong className="table-main">{String(employee.position||"—")}</strong><span className="table-sub">{String(employee.professionalTitle||"")}</span></td><td>{String(employee.education||"—")}</td><td><span className="count-pill">{String(employee.achievementCount??0)} mục</span></td><td><button className="row-action" onClick={event=>{event.stopPropagation();setSelectedId(String(employee.id))}} aria-label={`Mở hồ sơ ${employee.fullName}`}><ChevronRight size={18}/></button></td></tr>)}</tbody></table></div>
      <div className="pagination"><span>Hiển thị {first}–{last} trên {effectiveTotal.toLocaleString("vi-VN")}</span><div><button disabled={page<=1} onClick={()=>go(page-1)} aria-label="Trang trước">‹</button>{pageNumbers(totalPages,page).map(number=><button key={number} className={number===page?"active":""} onClick={()=>go(number)}>{number}</button>)}<button disabled={page>=totalPages} onClick={()=>go(page+1)} aria-label="Trang sau">›</button></div></div>
    </section>
    {modal&&<EmployeeModal demo={demo} units={units} onClose={()=>setModal(false)} onSaved={()=>{setModal(false);toast("success","Đã thêm hồ sơ nhân viên.");void api.options().then(x=>setUnits(x.units));load(1)}}/>}
    {selectedId&&<EmployeeDetailModal id={selectedId} demo={demo} fallback={shown.find(x=>String(x.id)===selectedId)} onClose={()=>setSelectedId(null)} onChanged={()=>load(page)} toast={toast}/>}
  </div>;
}

function EmployeeModal({demo,units,onClose,onSaved}:{demo:boolean;units:string[];onClose:()=>void;onSaved:()=>void}){
  const [saving,setSaving]=useState(false);const[error,setError]=useState("");const[birthDate,setBirthDate]=useState("");
  const[form,setForm]=useState<EmployeeInput>({citizenId:"",fullName:"",gender:"NAM",dateOfBirth:"",education:"",unit:"",position:"",professionalTitle:"",active:true});
  const update=(key:keyof EmployeeInput,value:string|boolean)=>setForm(current=>({...current,[key]:value}));
  const save=async(event:React.FormEvent)=>{event.preventDefault();setError("");const iso=parseVietnameseDate(birthDate);if(!iso){setError("Ngày sinh phải đúng định dạng dd/mm/yyyy.");return}setSaving(true);try{if(!demo)await api.createEmployee({...form,dateOfBirth:iso});onSaved()}catch(err){setError(err instanceof Error?err.message:"Không thể lưu hồ sơ.")}finally{setSaving(false)}};
  return <div className="modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><form className="modal employee-form-modal" onSubmit={save}><div className="modal-head"><div><span className="eyebrow teal">HỒ SƠ GỐC</span><h2>Thêm nhân viên</h2><p>CCCD là mã định danh duy nhất và không được trùng.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Đóng"><X/></button></div>{error&&<div className="form-error" role="alert">{error}</div>}<div className="form-grid">
    <label className="span-2">Họ và tên *<input required value={form.fullName} onChange={e=>update("fullName",e.target.value)}/></label><label>CCCD *<input required inputMode="numeric" pattern="\d{9,12}" value={form.citizenId} onChange={e=>update("citizenId",e.target.value)}/></label><label>Giới tính<select value={form.gender} onChange={e=>update("gender",e.target.value)}><option value="NAM">Nam</option><option value="NU">Nữ</option><option value="KHAC">Khác</option></select></label>
    <label>Ngày sinh *<input required inputMode="numeric" value={birthDate} onChange={e=>setBirthDate(e.target.value)} placeholder="dd/mm/yyyy"/></label><label>Trình độ<input value={form.education} onChange={e=>update("education",e.target.value)}/></label><label className="span-2">Đơn vị *<SearchableSelect required value={form.unit} onChange={value=>update("unit",value)} options={units} placeholder="Tìm hoặc nhập đơn vị mới"/></label><label>Chức vụ<input value={form.position} onChange={e=>update("position",e.target.value)}/></label><label>Chức danh nghề nghiệp<input value={form.professionalTitle} onChange={e=>update("professionalTitle",e.target.value)}/></label>
  </div><div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>Hủy</button><button className="primary-button" disabled={saving}>{saving&&<RefreshCw className="spin" size={17}/>}Lưu hồ sơ</button></div></form></div>;
}

function EmployeeDetailModal({id,demo,fallback,onClose,onChanged,toast}:{id:string;demo:boolean;fallback?:Record<string,unknown>;onClose:()=>void;onChanged:()=>void;toast:(t:Toast["type"],m:string)=>void}){
  const[employee,setEmployee]=useState<Record<string,unknown>|null>(demo?(fallback??null):null);const[loading,setLoading]=useState(!demo);const[achievementModal,setAchievementModal]=useState(false);
  const load=()=>{if(demo){setEmployee(fallback??null);return}setLoading(true);api.employee(id).then(setEmployee).catch(error=>toast("error",error.message)).finally(()=>setLoading(false))};
  useEffect(load,[id,demo]);const achievements=(employee?.achievements as Array<Record<string,unknown>>|undefined)??[];
  return <div className="modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><section className="modal employee-detail-modal" aria-label="Chi tiết hồ sơ nhân viên"><div className="modal-head"><div><span className="eyebrow teal">HỒ SƠ NHÂN VIÊN</span><h2>{loading?"Đang tải...":String(employee?.fullName??"Không tìm thấy hồ sơ")}</h2><p>{employee?`${String(employee.citizenId)} · ${genderLabel(String(employee.gender))} · ${formatDate(employee.dateOfBirth)}`:""}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Đóng"><X/></button></div>{employee&&<><div className="employee-profile-grid"><div><span>Đơn vị</span><strong>{String(employee.unit||"—")}</strong></div><div><span>Chức vụ</span><strong>{String(employee.position||"—")}</strong></div><div><span>Chức danh nghề nghiệp</span><strong>{String(employee.professionalTitle||"—")}</strong></div><div><span>Trình độ</span><strong>{String(employee.education||"—")}</strong></div></div><div className="achievement-section"><div className="achievement-section-head"><div><h3>Thành tích đã ghi nhận</h3><p>{achievements.length} mục trong hồ sơ</p></div><button className="primary-button" onClick={()=>setAchievementModal(true)}><Plus size={17}/>Thêm thành tích</button></div>{achievements.length?<div className="achievement-records">{achievements.map(item=><article key={String(item.id)}><div className="achievement-record-icon"><Award size={19}/></div><div><strong>{String(item.title)}</strong><span>{typeLabels[item.type as AchievementType]} · {levelLabels[item.level as AchievementLevel]}</span><small>{formatDate(item.acceptedDate)} · {String(item.organization||"Không ghi đơn vị")}</small></div><span className="year-pill">{String(item.year)}</span></article>)}</div>:<div className="empty-achievements"><FileCheck2/><strong>Chưa có thành tích</strong><span>Chọn “Thêm thành tích” để bắt đầu hồ sơ khen thưởng.</span></div>}</div></>}{achievementModal&&employee&&<AchievementModal employeeId={id} employeeName={String(employee.fullName)} demo={demo} onClose={()=>setAchievementModal(false)} onSaved={()=>{setAchievementModal(false);toast("success","Đã thêm thành tích và minh chứng.");load();onChanged()}}/>}</section></div>;
}

function AchievementModal({employeeId,employeeName,demo,onClose,onSaved}:{employeeId:string;employeeName:string;demo:boolean;onClose:()=>void;onSaved:()=>void}){
  const input=useRef<HTMLInputElement>(null);const[saving,setSaving]=useState(false);const[error,setError]=useState("");const[acceptedDate,setAcceptedDate]=useState("");const[files,setFiles]=useState<File[]>([]);const[drag,setDrag]=useState(false);
  const[form,setForm]=useState<AchievementInput>({employeeId,type:"RESEARCH",level:"CO_SO",title:"",acceptedDate:"",year:new Date().getFullYear(),organization:"",decisionNumber:"",role:"",notes:""});
  const update=(key:keyof AchievementInput,value:string|number)=>setForm(current=>({...current,[key]:value}));const addFiles=(list:FileList|null)=>{if(list)setFiles(current=>[...current,...Array.from(list)].slice(0,10))};
  const save=async(event:React.FormEvent)=>{event.preventDefault();setError("");const iso=parseVietnameseDate(acceptedDate);if(!iso){setError("Ngày chấp nhận phải đúng định dạng dd/mm/yyyy.");return}setSaving(true);try{if(!demo){const result=await api.createAchievement({...form,acceptedDate:iso,year:Number(iso.slice(0,4))});for(const file of files)await api.uploadAchievementFile(result.id,file)}onSaved()}catch(err){setError(err instanceof Error?err.message:"Không thể lưu thành tích.")}finally{setSaving(false)}};
  return <div className="modal-backdrop nested-modal" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><form className="modal achievement-modal" onSubmit={save}><div className="modal-head"><div><span className="eyebrow teal">THÀNH TÍCH HẰNG NĂM</span><h2>Thêm thành tích</h2><p>{employeeName}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Đóng"><X/></button></div>{error&&<div className="form-error" role="alert"><AlertCircle size={18}/>{error}</div>}<div className="form-grid">
    <label>Loại thành tích<select value={form.type} onChange={e=>update("type",e.target.value)}>{achievementTypes.map(type=><option key={type} value={type}>{typeLabels[type]}</option>)}</select></label><label>Cấp / hạng<select value={form.level} onChange={e=>update("level",e.target.value)}>{achievementLevels.map(level=><option key={level} value={level}>{levelLabels[level]}</option>)}</select></label>
    <label className="span-2">Tên đề tài / thành tích *<input required value={form.title} onChange={e=>update("title",e.target.value)}/></label><label>Ngày chấp nhận *<input required inputMode="numeric" value={acceptedDate} onChange={e=>setAcceptedDate(e.target.value)} placeholder="dd/mm/yyyy"/></label><label>Số quyết định<input value={form.decisionNumber} onChange={e=>update("decisionNumber",e.target.value)}/></label>
    <label>Đơn vị thực hiện<input value={form.organization} onChange={e=>update("organization",e.target.value)}/></label><label>Vai trò<input value={form.role} onChange={e=>update("role",e.target.value)} placeholder="Chủ nhiệm, thành viên..."/></label><label className="span-2">Ghi chú<textarea value={form.notes} onChange={e=>update("notes",e.target.value)} rows={3}/></label>
    <div className={`achievement-dropzone span-2 ${drag?"dragging":""}`} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);addFiles(e.dataTransfer.files)}}><input ref={input} type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e=>addFiles(e.target.files)}/><UploadCloud/><div><strong>Kéo thả minh chứng vào đây</strong><span>PDF, JPG, PNG, WebP · tối đa 25 MB/tệp</span></div><button type="button" className="secondary-button" onClick={()=>input.current?.click()}>Chọn tệp</button></div>{files.length>0&&<div className="selected-files span-2">{files.map((file,index)=><span key={`${file.name}-${index}`}><FileCheck2 size={14}/>{file.name}<button type="button" onClick={()=>setFiles(current=>current.filter((_,i)=>i!==index))} aria-label={`Bỏ tệp ${file.name}`}><X size={13}/></button></span>)}</div>}
  </div><div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>Hủy</button><button className="primary-button" disabled={saving}>{saving&&<RefreshCw className="spin" size={17}/>}Lưu thành tích</button></div></form></div>;
}

function SearchableSelect({value,onChange,options,placeholder,required=false,allowClear=false}:{value:string;onChange:(value:string)=>void;options:string[];placeholder:string;required?:boolean;allowClear?:boolean}){
  const[open,setOpen]=useState(false);const filtered=options.filter(option=>!value||normalize(option).includes(normalize(value))).slice(0,30);
  return <div className="searchable-select"><div className="searchable-control"><Search size={16}/><input required={required} role="combobox" aria-expanded={open} aria-autocomplete="list" value={value} onFocus={()=>setOpen(true)} onBlur={()=>window.setTimeout(()=>setOpen(false),120)} onChange={event=>{onChange(event.target.value);setOpen(true)}} placeholder={placeholder}/>{allowClear&&value&&<button type="button" onMouseDown={event=>event.preventDefault()} onClick={()=>onChange("")} aria-label="Xóa đơn vị"><X size={15}/></button>}</div>{open&&filtered.length>0&&<div className="searchable-options" role="listbox">{filtered.map(option=><button type="button" role="option" aria-selected={option===value} key={option} onMouseDown={event=>event.preventDefault()} onClick={()=>{onChange(option);setOpen(false)}}>{option}</button>)}</div>}</div>;
}

function CandidatesPage({ demo, toast }: { demo:boolean; toast:(t:Toast["type"],m:string)=>void }) {
  const [year,setYear]=useState(new Date().getFullYear()); const [items,setItems]=useState<Array<Record<string,unknown>>>([]); const [ruleModal,setRuleModal]=useState(false);
  useEffect(()=>{if(!demo)api.candidates(year).then(x=>setItems(x.candidates)).catch(()=>undefined)},[demo,year]);
  const people: Array<Record<string, unknown>>=demo?demoEmployees.slice(0,3):items.map(x=>x.employee as Record<string,unknown>);
  return <div className="page"><PageTitle eyebrow="SÀNG LỌC TIÊU CHUẨN" title="Đề xuất khen thưởng" description="Kết hợp nhiều điều kiện thành tích để tìm đúng hồ sơ đủ tiêu chuẩn." action={<button className="primary-button" onClick={()=>setRuleModal(true)}><Plus size={18}/>Tạo bộ tiêu chuẩn</button>}/>
    <div className="rule-hero"><div className="rule-icon"><Sparkles/></div><div><span className="eyebrow">BỘ TIÊU CHUẨN ĐANG ÁP DỤNG</span><h3>Huân chương Lao động hạng Ba</h3><p>Ứng viên cần đồng thời thỏa mãn tất cả điều kiện bên dưới, tính đến năm xét.</p></div><label>Năm xét<select value={year} onChange={e=>setYear(Number(e.target.value))}><option>2026</option><option>2025</option><option>2024</option></select></label></div>
    <div className="criteria-flow"><div className="criteria-card"><span>ĐIỀU KIỆN 01</span><Award/><div><strong>Bằng khen</strong><p>Cấp Thủ tướng Chính phủ</p></div><Check/></div><div className="criteria-and">VÀ</div><div className="criteria-card"><span>ĐIỀU KIỆN 02</span><FileCheck2/><div><strong>Đề tài khoa học</strong><p>Đề tài cấp Bộ</p></div><Check/></div><ChevronRight className="flow-arrow"/><div className="criteria-result"><Medal/><div><span>KẾT QUẢ ĐỀ XUẤT</span><strong>{people.length || 0} hồ sơ phù hợp</strong></div></div></div>
    <section className="panel candidates-panel"><PanelHeader title="Danh sách ứng viên" subtitle="Sắp xếp theo mức độ hoàn thiện hồ sơ" action={<button className="ghost-button"><Download size={16}/>Xuất danh sách</button>}/><div className="candidate-list">{people.map((p,i)=>{const name=String(p.fullName??p["full_name"]);return <div className="candidate" key={String(p.id)}><span className="rank">{String(i+1).padStart(2,"0")}</span><div className="mini-avatar">{initials(name)}</div><div className="candidate-name"><strong>{name}</strong><span>{String(p.unit)}</span></div><div className="evidence"><span><Check/>Bằng khen Thủ tướng</span><span><Check/>Đề tài cấp Bộ</span></div><div className="progress"><div><i style={{width:`${96-i*5}%`}}/></div><span>{96-i*5}% hoàn thiện</span></div><button className="secondary-button">Rà soát<ChevronRight size={16}/></button></div>})}</div></section>
    {ruleModal&&<RewardRuleModal demo={demo} onClose={()=>setRuleModal(false)} onSaved={()=>{setRuleModal(false);toast("success","Đã tạo bộ tiêu chuẩn khen thưởng.")}}/>}
  </div>;
}

function RewardRuleModal({demo,onClose,onSaved}:{demo:boolean;onClose:()=>void;onSaved:()=>void}){
  const [name,setName]=useState("Huân chương Lao động hạng Ba");
  const [rewardType,setRewardType]=useState<AchievementType>("MEDAL");
  const [rewardLevel,setRewardLevel]=useState<AchievementLevel>("HANG_BA");
  const [priority,setPriority]=useState(100);
  const [conditions,setConditions]=useState<Array<{type:AchievementType;level:AchievementLevel}>>([{type:"CERTIFICATE",level:"THU_TUONG"},{type:"RESEARCH",level:"BO"}]);
  const [saving,setSaving]=useState(false); const [error,setError]=useState("");
  const updateCondition=(index:number,key:"type"|"level",value:string)=>setConditions(current=>current.map((condition,i)=>i===index?{...condition,[key]:value}:condition));
  const save=async(event:React.FormEvent)=>{event.preventDefault();setError("");if(!conditions.length){setError("Cần ít nhất một điều kiện.");return}setSaving(true);try{if(!demo)await api.createRewardRule({name,rewardType,rewardLevel,conditions:{all:conditions},priority});onSaved()}catch(err){setError(err instanceof Error?err.message:"Không thể tạo bộ tiêu chuẩn.")}finally{setSaving(false)}};
  return <div className="modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><form className="modal rule-modal" onSubmit={save}><div className="modal-head"><div><span className="eyebrow teal">BỘ TIÊU CHUẨN MỚI</span><h2>Tạo tiêu chuẩn khen thưởng</h2><p>Các điều kiện bên dưới được áp dụng đồng thời khi sàng lọc.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Đóng"><X/></button></div>{error&&<div className="form-error" role="alert"><AlertCircle size={18}/>{error}</div>}<div className="form-grid">
    <label className="span-2">Tên bộ tiêu chuẩn *<input autoFocus required value={name} onChange={event=>setName(event.target.value)}/></label>
    <label>Loại khen thưởng<select value={rewardType} onChange={event=>setRewardType(event.target.value as AchievementType)}>{achievementTypes.map(type=><option key={type} value={type}>{typeLabels[type]}</option>)}</select></label>
    <label>Cấp / hạng khen thưởng<select value={rewardLevel} onChange={event=>setRewardLevel(event.target.value as AchievementLevel)}>{achievementLevels.map(level=><option key={level} value={level}>{levelLabels[level]}</option>)}</select></label>
    <label>Độ ưu tiên<input type="number" min="0" max="9999" value={priority} onChange={event=>setPriority(Number(event.target.value))}/></label>
    <fieldset className="condition-fieldset span-2"><legend>Điều kiện bắt buộc</legend>{conditions.map((condition,index)=><div className="condition-row" key={`${index}-${condition.type}-${condition.level}`}><span>{String(index+1).padStart(2,"0")}</span><select aria-label={`Loại thành tích điều kiện ${index+1}`} value={condition.type} onChange={event=>updateCondition(index,"type",event.target.value)}>{achievementTypes.map(type=><option key={type} value={type}>{typeLabels[type]}</option>)}</select><select aria-label={`Cấp thành tích điều kiện ${index+1}`} value={condition.level} onChange={event=>updateCondition(index,"level",event.target.value)}>{achievementLevels.map(level=><option key={level} value={level}>{levelLabels[level]}</option>)}</select><button type="button" className="icon-button" aria-label={`Xóa điều kiện ${index+1}`} disabled={conditions.length===1} onClick={()=>setConditions(current=>current.filter((_,i)=>i!==index))}><X size={17}/></button></div>)}<button type="button" className="text-button add-condition" onClick={()=>setConditions(current=>[...current,{type:"RESEARCH",level:"CO_SO"}])}><Plus size={16}/>Thêm điều kiện</button></fieldset>
  </div><div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>Hủy</button><button className="primary-button" disabled={saving}>{saving&&<RefreshCw className="spin" size={17}/>}Lưu bộ tiêu chuẩn</button></div></form></div>;
}

function ImportPage({ demo, toast }: { demo:boolean; toast:(t:Toast["type"],m:string)=>void }) {
  const input=useRef<HTMLInputElement>(null); const [file,setFile]=useState<File|null>(null); const [rows,setRows]=useState<EmployeeInput[]>([]); const [drag,setDrag]=useState(false); const [loading,setLoading]=useState(false);
  const parse=async(f:File)=>{setFile(f);const sheet=await readSheet(f);const headers=(sheet[0]??[]).map(v=>normalize(String(v??"")));const value=(r:unknown[],names:string[])=>{const index=headers.findIndex(k=>names.includes(k));return index>=0?String(r[index]??"").trim():""};const parsed=sheet.slice(1).filter(r=>r.some(Boolean)).map(r=>({citizenId:value(r,["cccd","so cccd","can cuoc cong dan"]),fullName:value(r,["ho ten","ho va ten"]),gender:normalize(value(r,["gioi tinh"]))==="nu"?"NU" as const:"NAM" as const,dateOfBirth:excelDate(r[headers.findIndex(k=>["ngay sinh","ngay thang nam sinh"].includes(k))]),education:value(r,["trinh do"]),unit:value(r,["don vi"]),position:value(r,["chuc vu"]),professionalTitle:value(r,["chuc danh nghe nghiep","chuc danh"]),active:true}));setRows(parsed)};
  const upload=async()=>{if(!rows.length)return;setLoading(true);try{if(!demo){const result=await api.importEmployees(rows);toast("success",`Đã nhập ${result.accepted} hồ sơ, ${result.rejected} dòng cần kiểm tra.`)}else toast("success",`Đã mô phỏng nhập ${rows.length} hồ sơ.`);setFile(null);setRows([])}catch(e){toast("error",e instanceof Error?e.message:"Không thể nhập dữ liệu.")}finally{setLoading(false)}};
  return <div className="page"><PageTitle eyebrow="NHẬP DỮ LIỆU HÀNG LOẠT" title="Nhập hồ sơ từ Excel" description="Hệ thống đối chiếu CCCD để tự động thêm mới hoặc cập nhật hồ sơ hiện có." action={<button className="ghost-button"><Download size={17}/>Tải file mẫu</button>}/>
    <div className="import-steps"><div className="done"><span>1</span><div><strong>Chọn tệp</strong><small>.xlsx hoặc .xls</small></div></div><i/><div className={rows.length?"done":""}><span>2</span><div><strong>Kiểm tra dữ liệu</strong><small>Ánh xạ và xác thực</small></div></div><i/><div><span>3</span><div><strong>Hoàn tất</strong><small>Cập nhật vào CSDL</small></div></div></div>
    {!file?<div className={`dropzone ${drag?"dragging":""}`} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)void parse(f)}}><input ref={input} type="file" accept=".xlsx,.xls" hidden onChange={e=>{const f=e.target.files?.[0];if(f)void parse(f)}}/><div className="upload-icon"><UploadCloud/></div><h3>Kéo và thả tệp Excel vào đây</h3><p>hoặc chọn tệp từ máy tính · tối đa 10 MB</p><button className="secondary-button" onClick={()=>input.current?.click()}>Chọn tệp Excel</button><div className="drop-hint"><FileCheck2 size={16}/>Các cột bắt buộc: CCCD, Họ tên, Giới tính, Ngày sinh, Đơn vị</div></div>:
    <section className="panel preview-panel"><div className="file-summary"><div className="excel-icon"><FileSpreadsheet/></div><div><strong>{file.name}</strong><span>{(file.size/1024).toFixed(1)} KB · {rows.length} dòng dữ liệu</span></div><span className="valid-badge"><Check/>Sẵn sàng nhập</span><button className="icon-button" onClick={()=>{setFile(null);setRows([])}}><X/></button></div><div className="table-scroll"><table><thead><tr><th>#</th><th>CCCD</th><th>Họ và tên</th><th>Giới tính</th><th>Ngày sinh</th><th>Đơn vị</th></tr></thead><tbody>{rows.slice(0,8).map((r,i)=><tr key={i}><td>{i+1}</td><td className="mono">{r.citizenId}</td><td><strong>{r.fullName}</strong></td><td>{genderLabel(r.gender)}</td><td>{formatDate(r.dateOfBirth)}</td><td>{r.unit}</td></tr>)}</tbody></table></div><div className="import-actions"><span>CCCD trùng sẽ được cập nhật, không tạo bản ghi mới.</span><button className="primary-button" onClick={()=>void upload()} disabled={loading}>{loading?<RefreshCw className="spin" size={17}/>:<UploadCloud size={17}/>}Nhập {rows.length} hồ sơ</button></div></section>}
  </div>;
}

function UsersPage({user,toast,onCurrentUserUpdated}:{user:SessionUser;toast:(t:Toast["type"],m:string)=>void;onCurrentUserUpdated:(user:UserRecord)=>void}) {
  const emptyCounts:UserCounts={ADMIN:0,HR:0,REVIEWER:0,VIEWER:0,total:0,active:0};const[items,setItems]=useState<UserRecord[]>([]);const[counts,setCounts]=useState<UserCounts>(emptyCounts);const[loading,setLoading]=useState(true);const[editing,setEditing]=useState<UserRecord|"new"|null>(null);
  const load=()=>{setLoading(true);api.users().then(result=>{setItems(result.items);setCounts(result.counts)}).catch(error=>toast("error",error instanceof Error?error.message:"Không thể tải tài khoản.")).finally(()=>setLoading(false))};useEffect(load,[]);
  const roleCards:Array<{role:Role;description:string;tone:string;icon:LucideIcon}>=[
    {role:"ADMIN",description:"Toàn quyền cấu hình và quản lý",tone:"navy",icon:ShieldCheck},
    {role:"HR",description:"Thêm, sửa hồ sơ và thành tích",tone:"teal",icon:Users},
    {role:"REVIEWER",description:"Rà soát và xem đề xuất",tone:"violet",icon:FileCheck2},
    {role:"VIEWER",description:"Tra cứu dữ liệu được phép",tone:"gray",icon:UserRound}
  ];
  return <div className="page"><PageTitle eyebrow="QUẢN TRỊ HỆ THỐNG" title="Người dùng & phân quyền" description="Số liệu lấy trực tiếp từ tài khoản trên D1." action={<button className="primary-button" onClick={()=>setEditing("new")}><Plus size={18}/>Thêm người dùng</button>}/><div className="role-grid">{roleCards.map(card=>{const Icon=card.icon;return <div className="role-card" key={card.role}><div className={`role-symbol ${card.tone}`}><Icon aria-hidden="true"/></div><div><strong>{roleLabel(card.role)}</strong><span>{card.description}</span></div><b>{counts[card.role]}</b><small>tài khoản</small></div>})}</div><section className="panel"><PanelHeader title="Tài khoản hệ thống" subtitle={`${counts.active}/${counts.total} tài khoản đang hoạt động`}/><div className="user-list">{loading?<div className="empty-inline">Đang tải tài khoản...</div>:items.length?items.map(item=><div className="user-row" key={item.id}><div className="avatar">{initials(item.displayName)}</div><div><strong>{item.displayName}{item.id===user.id?" · Bạn":""}</strong><span>{item.username} · Tạo ngày {formatDate(item.createdAt)}</span></div><span className={`role-pill ${item.role==="ADMIN"?"admin":""}`}>{roleLabel(item.role)}</span><span className={item.active?"status-active":"status-inactive"}><i/>{item.active?"Đang hoạt động":"Đã khóa"}</span><button className="row-action" onClick={()=>setEditing(item)} aria-label={`Sửa tài khoản ${item.displayName}`}><ChevronRight/></button></div>):<div className="empty-inline">Chưa có tài khoản.</div>}</div></section>{editing&&<UserModal current={editing==="new"?undefined:editing} onClose={()=>setEditing(null)} onSaved={updated=>{setEditing(null);toast("success",editing==="new"?"Đã thêm người dùng.":"Đã cập nhật người dùng.");if(updated)onCurrentUserUpdated(updated);load()}}/>}</div>
}

function UserModal({current,onClose,onSaved}:{current?:UserRecord;onClose:()=>void;onSaved:(updated?:UserRecord)=>void}){
  const[username,setUsername]=useState(current?.username??"");const[displayName,setDisplayName]=useState(current?.displayName??"");const[role,setRole]=useState<Role>(current?.role??"VIEWER");const[active,setActive]=useState(current?.active??true);const[password,setPassword]=useState("");const[saving,setSaving]=useState(false);const[error,setError]=useState("");
  const save=async(event:React.FormEvent)=>{event.preventDefault();setError("");if(!current&&password.length<10){setError("Mật khẩu phải có ít nhất 10 ký tự.");return}if(current&&password&&password.length<10){setError("Mật khẩu mới phải có ít nhất 10 ký tự.");return}setSaving(true);try{if(current){await api.updateUser(current.id,{displayName,role,active,...(password?{password}:{})});onSaved({...current,displayName:displayName.trim(),role,active})}else{await api.createUser({username,displayName,role,password});onSaved()}}catch(err){setError(err instanceof Error?err.message:"Không thể lưu tài khoản.")}finally{setSaving(false)}};
  return <div className="modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><form className="modal user-modal" onSubmit={save}><div className="modal-head"><div><span className="eyebrow teal">TÀI KHOẢN & PHÂN QUYỀN</span><h2>{current?"Sửa người dùng":"Thêm người dùng"}</h2><p>{current?"Tên đăng nhập được giữ cố định để bảo toàn lịch sử.":"Tạo tài khoản và cấp đúng vai trò nghiệp vụ."}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Đóng"><X/></button></div>{error&&<div className="form-error" role="alert"><AlertCircle size={18}/>{error}</div>}<div className="form-grid"><label>Tên đăng nhập *<input required disabled={Boolean(current)} value={username} onChange={event=>setUsername(event.target.value.trim())} autoComplete="username"/></label><label>Họ và tên *<input required minLength={2} value={displayName} onChange={event=>setDisplayName(event.target.value)}/></label><label>Vai trò<select value={role} onChange={event=>setRole(event.target.value as Role)}>{roles.map(value=><option key={value} value={value}>{roleLabel(value)}</option>)}</select></label><label>{current?"Mật khẩu mới":"Mật khẩu *"}<input type="password" required={!current} minLength={10} value={password} onChange={event=>setPassword(event.target.value)} autoComplete="new-password" placeholder={current?"Bỏ trống nếu không đổi":"Ít nhất 10 ký tự"}/></label><label className="status-control span-2"><input type="checkbox" checked={active} onChange={event=>setActive(event.target.checked)}/><span><strong>Tài khoản hoạt động</strong><small>Tắt để khóa đăng nhập và thu hồi phiên hiện có.</small></span></label></div><div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>Hủy</button><button className="primary-button" disabled={saving}>{saving&&<RefreshCw className="spin" size={17}/>}Lưu tài khoản</button></div></form></div>
}

function SettingsPage(){const[version,setVersion]=useState("0.1.0");const[status,setStatus]=useState("");useEffect(()=>{void window.desktop?.getVersion().then(setVersion);return window.desktop?.onUpdateStatus(x=>setStatus(x.status))},[]);return <div className="page"><PageTitle eyebrow="CẤU HÌNH" title="Thiết lập hệ thống" description="Quản lý kết nối, cập nhật phần mềm và chính sách dữ liệu."/><div className="settings-grid"><section className="panel setting-card"><div className="setting-icon"><RefreshCw/></div><div><h3>Cập nhật ứng dụng</h3><p>Phiên bản hiện tại <strong>v{version}</strong>. Bản phát hành được kiểm tra an toàn qua GitHub Releases.</p>{status&&<span className="update-status">Trạng thái: {status}</span>}</div><button className="secondary-button" onClick={()=>void window.desktop?.checkForUpdates()}>Kiểm tra cập nhật</button></section><section className="panel setting-card"><div className="setting-icon teal"><ShieldCheck/></div><div><h3>Lưu trữ & bảo mật</h3><p>Dữ liệu nghiệp vụ lưu tại Cloudflare D1; minh chứng lưu riêng trong R2.</p></div><span className="valid-badge"><Check/>Kết nối thiết kế sẵn</span></section></div></div>}

function PageTitle({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:ReactNode}){return <div className="page-title"><div><span className="eyebrow teal">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action&&<div>{action}</div>}</div>}
function PanelHeader({title,subtitle,action}:{title:string;subtitle:string;action?:ReactNode}){return <div className="panel-header"><div><h3>{title}</h3><p>{subtitle}</p></div>{action}</div>}
function HospitalLogo(){return <img className="hospital-logo" src={hospitalLogo} width="148" height="148" alt="Logo Bệnh viện Thống Nhất"/>}
function initials(name:string){return name.trim().split(/\s+/).slice(-2).map(x=>x[0]).join("").toUpperCase()}
function roleLabel(role:string){return ({ADMIN:"Quản trị viên",HR:"Tổ chức cán bộ",REVIEWER:"Hội đồng xét duyệt",VIEWER:"Chỉ xem"} as Record<string,string>)[role]??role}
function genderLabel(gender:string){return ({NAM:"Nam",NU:"Nữ",KHAC:"Khác"} as Record<string,string>)[gender]??gender}
function formatDate(value:unknown){const text=String(value??"").slice(0,10);const match=text.match(/^(\d{4})-(\d{2})-(\d{2})$/);return match?`${match[3]}/${match[2]}/${match[1]}`:(text||"—")}
function parseVietnameseDate(value:string){const match=value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!match)return null;const day=Number(match[1]),month=Number(match[2]),year=Number(match[3]);const date=new Date(Date.UTC(year,month-1,day));if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;return `${match[3]}-${match[2]}-${match[1]}`}
function pageNumbers(total:number,current:number){if(total<=5)return Array.from({length:total},(_,index)=>index+1);const start=Math.max(1,Math.min(current-2,total-4));return Array.from({length:5},(_,index)=>start+index)}
function normalize(v:string){return v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()}
function excelDate(v:unknown){if(v instanceof Date)return v.toISOString().slice(0,10);const s=String(v??"").trim();const m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);return m?`${m[3]}-${m[2]!.padStart(2,"0")}-${m[1]!.padStart(2,"0")}`:s}

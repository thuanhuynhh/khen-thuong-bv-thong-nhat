import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { readSheet } from "read-excel-file/browser";
import {
  Award, Bell, ChevronDown, ChevronRight, CircleHelp, Download, FileCheck2, FileSpreadsheet,
  Filter, LayoutDashboard, LogOut, Medal, Menu, Plus, RefreshCw, Search, Settings, ShieldCheck,
  SlidersHorizontal, Sparkles, UploadCloud, UserRound, Users, X, Check, AlertCircle
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { achievementLevels, levelLabels, type AchievementLevel, type EmployeeInput, type SessionUser } from "@thongnhat/shared";
import { api, ApiError, hasToken, setToken } from "./api";
import { demoEmployees, recentAchievements } from "./demo";

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

  if (loadingSession) return <div className="boot"><div className="brand-mark"><Award /></div><div className="boot-line" /></div>;
  if (!user && !demo) return <Login onLogin={setUser} onDemo={() => setDemo(true)} />;

  const currentUser = user ?? { id: "demo", username: "demo", displayName: "Nguyễn Thanh Vân", role: "ADMIN" as const };
  const logout = async () => { if (!demo) await api.logout().catch(() => undefined); setToken(""); setUser(null); setDemo(false); };

  return <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><Award size={22} /></div>
        {!collapsed && <div><strong>Thống Nhất</strong><span>Quản lý khen thưởng</span></div>}
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
        {page === "dashboard" && <Dashboard demo={demo} onNavigate={setPage} />}
        {page === "employees" && <EmployeesPage demo={demo} toast={toast} />}
        {page === "candidates" && <CandidatesPage demo={demo} />}
        {page === "import" && <ImportPage demo={demo} toast={toast} />}
        {page === "users" && <UsersPage demo={demo} user={currentUser} />}
        {page === "settings" && <SettingsPage />}
      </main>
    </div>
    <div className="toast-stack" aria-live="polite">{toasts.map(t => <div className={`toast ${t.type}`} key={t.id}>{t.type === "success" ? <Check /> : <AlertCircle />}<span>{t.message}</span></div>)}</div>
  </div>;
}

function Login({ onLogin, onDemo }: { onLogin: (u: SessionUser) => void; onDemo: () => void }) {
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
      <div className="hospital-seal"><Award size={28} /></div>
      <div className="story-copy"><span className="eyebrow">BỆNH VIỆN THỐNG NHẤT</span><h1>Ghi nhận xứng đáng.<br/>Lan tỏa cống hiến.</h1><p>Một không gian thống nhất để quản lý hồ sơ thành tích, sàng lọc tiêu chuẩn và đề xuất khen thưởng minh bạch.</p></div>
      <div className="story-stats"><div><strong>01</strong><span>Nguồn dữ liệu<br/>đồng nhất</span></div><div><strong>360°</strong><span>Hồ sơ thành tích<br/>toàn diện</span></div><div><strong>100%</strong><span>Truy vết<br/>thay đổi</span></div></div>
      <div className="story-orbit"><span/><span/><span/></div>
    </section>
    <section className="login-panel"><form onSubmit={submit}>
      <div className="mobile-brand"><div className="brand-mark"><Award /></div><strong>Khen thưởng Thống Nhất</strong></div>
      <span className="eyebrow teal">CỔNG NGHIỆP VỤ NỘI BỘ</span><h2>Chào mừng trở lại</h2><p className="muted">Đăng nhập bằng tài khoản được quản trị viên cấp.</p>
      {error && <div className="form-error" role="alert"><AlertCircle size={18}/>{error}</div>}
      <label>Tên đăng nhập<input autoFocus autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} placeholder="Nhập tên đăng nhập" required /></label>
      <label>Mật khẩu<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Nhập mật khẩu" required /></label>
      <button className="primary-button full" disabled={loading}>{loading ? <><RefreshCw className="spin" size={18}/>Đang xác thực</> : <>Đăng nhập<ChevronRight size={18}/></>}</button>
      <button className="text-button demo-link" type="button" onClick={onDemo}>Xem bản minh họa không cần máy chủ</button>
      <div className="security-note"><ShieldCheck size={19}/><span>Dữ liệu được mã hóa khi truyền và phân quyền theo vai trò.</span></div>
    </form></section>
  </div>;
}

function Dashboard({ demo, onNavigate }: { demo: boolean; onNavigate: (p: Page) => void }) {
  const year = new Date().getFullYear(); const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { if (!demo) void api.dashboard(year).then(setData).catch(() => undefined); }, [demo, year]);
  const stats = [
    { label: "Nhân viên đang quản lý", value: demo ? "1.284" : String(data?.employees ?? "—"), delta: "+18", icon: Users, tone: "blue" },
    { label: `Thành tích năm ${year}`, value: demo ? "327" : String(data?.achievements ?? "—"), delta: "+12,4%", icon: Award, tone: "teal" },
    { label: "Đơn vị trực thuộc", value: demo ? "42" : String(data?.units ?? "—"), delta: "Đã đồng bộ", icon: LayoutDashboard, tone: "violet" },
    { label: "Hồ sơ có thể xét", value: demo ? "86" : String(data?.candidates ?? "—"), delta: "Cần rà soát", icon: Sparkles, tone: "amber" }
  ];
  return <div className="page dashboard-page">
    <PageTitle eyebrow={`THÁNG 08 · ${year}`} title="Chào buổi sáng, chị Vân" description="Đây là những chuyển động chính trong công tác thi đua, khen thưởng." action={<button className="primary-button" onClick={() => onNavigate("candidates")}><Sparkles size={18}/>Xem đề xuất mới</button>} />
    <div className="stat-grid">{stats.map(s => <article className="stat-card" key={s.label}><div className={`stat-icon ${s.tone}`}><s.icon size={21}/></div><div className="stat-meta"><span>{s.label}</span><strong>{s.value}</strong><small>{s.delta}</small></div></article>)}</div>
    <div className="dashboard-grid">
      <section className="panel activity-panel"><PanelHeader title="Nhịp độ ghi nhận" subtitle={`Thành tích được cập nhật trong ${year}`} action={<button className="ghost-button"><Download size={16}/>Xuất báo cáo</button>}/>
        <div className="chart-wrap"><div className="chart-y"><span>60</span><span>40</span><span>20</span><span>0</span></div><div className="bar-chart">
          {[28,35,31,47,40,55,43,58,49,61,52,66].map((h,i)=><div className="bar-col" key={i}><div className={`bar ${i===7?"highlight":""}`} style={{height:`${h*2.2}px`}}><span>{h}</span></div><small>T{i+1}</small></div>)}
        </div></div><div className="chart-legend"><span><i className="legend-dot current"/>Năm {year}</span><span><i className="legend-dot previous"/>Cùng kỳ năm trước</span></div>
      </section>
      <section className="panel recommendation-panel"><PanelHeader title="Đề xuất nổi bật" subtitle="Từ bộ lọc tiêu chuẩn hiện hành" />
        <div className="award-emblem"><Medal size={30}/></div><span className="recommend-label">HUÂN CHƯƠNG LAO ĐỘNG HẠNG BA</span><strong>12 hồ sơ phù hợp</strong><p>Có Bằng khen Thủ tướng và đề tài khoa học cấp Bộ trong giai đoạn xét.</p>
        <div className="avatar-row"><div>NA</div><div>QB</div><div>TH</div><div>+9</div></div><button className="secondary-button full" onClick={() => onNavigate("candidates")}>Rà soát danh sách<ChevronRight size={17}/></button>
      </section>
      <section className="panel recent-panel"><PanelHeader title="Cập nhật gần đây" subtitle="Dữ liệu mới ghi nhận trên hệ thống" action={<button className="text-button" onClick={() => onNavigate("employees")}>Xem tất cả</button>}/>
        <div className="activity-list">{recentAchievements.map((a,i)=><div className="activity-item" key={a.title}><div className={`activity-icon a${i}`}><FileCheck2 size={18}/></div><div><strong>{a.person}</strong><span>{a.title}</span></div><span className="achievement-tag">{a.type}</span><time>{a.date}</time></div>)}</div>
      </section>
    </div>
  </div>;
}

function EmployeesPage({ demo, toast }: { demo: boolean; toast: (t: Toast["type"], m: string) => void }) {
  const [employees, setEmployees] = useState<Array<Record<string, unknown>>>(demoEmployees); const [total, setTotal] = useState(demoEmployees.length);
  const [search, setSearch] = useState(""); const [filtersOpen, setFiltersOpen] = useState(true); const [modal, setModal] = useState(false);
  const [unit, setUnit] = useState(""); const [level, setLevel] = useState(""); const [year, setYear] = useState("");
  const load = () => { if (demo) return; const q = new URLSearchParams({ search, ...(unit&&{unit}), ...(level&&{achievementLevel:level}), ...(year&&{fromYear:year,toYear:year}) }); api.employees(q.toString()).then(x => { setEmployees(x.items); setTotal(x.total); }).catch(e => toast("error", e.message)); };
  useEffect(load, [demo]);
  const shown = demo ? employees.filter(e => String(e.fullName).toLowerCase().includes(search.toLowerCase()) || String(e.citizenId).includes(search)) : employees;
  return <div className="page">
    <PageTitle eyebrow="HỒ SƠ NHÂN SỰ" title="Danh sách nhân viên" description="Quản lý hồ sơ gốc theo CCCD và toàn bộ quá trình ghi nhận thành tích." action={<button className="primary-button" onClick={() => setModal(true)}><Plus size={18}/>Thêm nhân viên</button>} />
    <section className="panel data-panel">
      <div className="table-toolbar"><div className="search-box"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==="Enter"&&load()} placeholder="Tìm theo họ tên hoặc CCCD..."/><kbd>Enter</kbd></div><button className={`filter-button ${filtersOpen?"active":""}`} onClick={()=>setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={17}/>Bộ lọc chi tiết<span>3</span></button><button className="ghost-button"><Download size={17}/>Xuất Excel</button></div>
      {filtersOpen && <div className="filter-drawer"><div className="filter-heading"><div><Filter size={17}/><strong>Điều kiện lọc</strong></div><button className="text-button" onClick={()=>{setUnit("");setLevel("");setYear("")}}>Xóa tất cả</button></div><div className="filter-grid">
        <label>Đơn vị<select value={unit} onChange={e=>setUnit(e.target.value)}><option value="">Tất cả đơn vị</option><option>Khoa Tim mạch cấp cứu & can thiệp</option><option>Khoa Nội tổng hợp</option><option>Phòng Điều dưỡng</option></select></label>
        <label>Loại thành tích<select><option>Tất cả loại</option><option>Đề tài khoa học</option><option>Chiến sĩ thi đua</option><option>Bằng khen</option><option>Huân chương</option></select></label>
        <label>Cấp / hạng<select value={level} onChange={e=>setLevel(e.target.value)}><option value="">Tất cả cấp</option>{achievementLevels.map(x=><option key={x} value={x}>{levelLabels[x]}</option>)}</select></label>
        <label>Năm ghi nhận<input type="number" value={year} onChange={e=>setYear(e.target.value)} placeholder="Ví dụ: 2026"/></label>
        <button className="secondary-button apply-filter" onClick={load}>Áp dụng bộ lọc</button>
      </div></div>}
      <div className="table-summary"><span><strong>{total.toLocaleString("vi-VN")}</strong> nhân viên</span><span>Cập nhật lần cuối: Hôm nay, 09:42</span></div>
      <div className="table-scroll"><table><thead><tr><th>Nhân viên</th><th>CCCD</th><th>Đơn vị</th><th>Chức vụ / chức danh</th><th>Trình độ</th><th>Thành tích</th><th></th></tr></thead><tbody>{shown.map((e,i)=><tr key={String(e.id)}><td><div className={`person-cell avatar-tone-${i%5}`}><div className="mini-avatar">{initials(String(e.fullName))}</div><div><strong>{String(e.fullName)}</strong><span>{String(e.gender)} · {String(e.dateOfBirth)}</span></div></div></td><td className="mono">{String(e.citizenId)}</td><td><span className="unit-cell">{String(e.unit)}</span></td><td><strong className="table-main">{String(e.position)}</strong><span className="table-sub">{String(e.professionalTitle)}</span></td><td>{String(e.education)}</td><td><span className="count-pill">{String(e.achievementCount)} mục</span></td><td><button className="row-action" aria-label={`Mở hồ sơ ${e.fullName}`}><ChevronRight size={18}/></button></td></tr>)}</tbody></table></div>
      <div className="pagination"><span>Hiển thị 1–{shown.length} trên {total.toLocaleString("vi-VN")}</span><div><button disabled>‹</button><button className="active">1</button><button>2</button><button>3</button><span>…</span><button>52</button><button>›</button></div></div>
    </section>
    {modal && <EmployeeModal demo={demo} onClose={()=>setModal(false)} onSaved={()=>{setModal(false);toast("success","Đã thêm hồ sơ nhân viên.");load()}} />}
  </div>;
}

function EmployeeModal({ demo, onClose, onSaved }: { demo: boolean; onClose:()=>void; onSaved:()=>void }) {
  const [saving,setSaving]=useState(false); const [error,setError]=useState("");
  const [form,setForm]=useState<EmployeeInput>({citizenId:"",fullName:"",gender:"NAM",dateOfBirth:"",education:"",unit:"",position:"",professionalTitle:"",active:true});
  const update=(k:keyof EmployeeInput,v:string|boolean)=>setForm(x=>({...x,[k]:v}));
  const save=async(e:React.FormEvent)=>{e.preventDefault();setSaving(true);setError("");try{if(!demo)await api.createEmployee(form);onSaved()}catch(err){setError(err instanceof Error?err.message:"Không thể lưu hồ sơ.")}finally{setSaving(false)}};
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><form className="modal" onSubmit={save}><div className="modal-head"><div><span className="eyebrow teal">HỒ SƠ GỐC</span><h2>Thêm nhân viên</h2><p>CCCD là mã định danh duy nhất và không được trùng.</p></div><button type="button" className="icon-button" onClick={onClose}><X/></button></div>{error&&<div className="form-error">{error}</div>}<div className="form-grid">
    <label className="span-2">Họ và tên *<input required value={form.fullName} onChange={e=>update("fullName",e.target.value)} /></label><label>CCCD *<input required inputMode="numeric" pattern="\d{9,12}" value={form.citizenId} onChange={e=>update("citizenId",e.target.value)} /></label><label>Giới tính<select value={form.gender} onChange={e=>update("gender",e.target.value)}><option value="NAM">Nam</option><option value="NU">Nữ</option><option value="KHAC">Khác</option></select></label>
    <label>Ngày sinh *<input required type="date" value={form.dateOfBirth} onChange={e=>update("dateOfBirth",e.target.value)} /></label><label>Trình độ<input value={form.education} onChange={e=>update("education",e.target.value)} /></label><label className="span-2">Đơn vị *<input required value={form.unit} onChange={e=>update("unit",e.target.value)} /></label><label>Chức vụ<input value={form.position} onChange={e=>update("position",e.target.value)} /></label><label>Chức danh nghề nghiệp<input value={form.professionalTitle} onChange={e=>update("professionalTitle",e.target.value)} /></label>
  </div><div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>Hủy</button><button className="primary-button" disabled={saving}>{saving&&<RefreshCw className="spin" size={17}/>}Lưu hồ sơ</button></div></form></div>;
}

function CandidatesPage({ demo }: { demo:boolean }) {
  const [year,setYear]=useState(new Date().getFullYear()); const [items,setItems]=useState<Array<Record<string,unknown>>>([]);
  useEffect(()=>{if(!demo)api.candidates(year).then(x=>setItems(x.candidates)).catch(()=>undefined)},[demo,year]);
  const people: Array<Record<string, unknown>>=demo?demoEmployees.slice(0,3):items.map(x=>x.employee as Record<string,unknown>);
  return <div className="page"><PageTitle eyebrow="SÀNG LỌC TIÊU CHUẨN" title="Đề xuất khen thưởng" description="Kết hợp nhiều điều kiện thành tích để tìm đúng hồ sơ đủ tiêu chuẩn." action={<button className="primary-button"><Plus size={18}/>Tạo bộ tiêu chuẩn</button>}/>
    <div className="rule-hero"><div className="rule-icon"><Sparkles/></div><div><span className="eyebrow">BỘ TIÊU CHUẨN ĐANG ÁP DỤNG</span><h3>Huân chương Lao động hạng Ba</h3><p>Ứng viên cần đồng thời thỏa mãn tất cả điều kiện bên dưới, tính đến năm xét.</p></div><label>Năm xét<select value={year} onChange={e=>setYear(Number(e.target.value))}><option>2026</option><option>2025</option><option>2024</option></select></label></div>
    <div className="criteria-flow"><div className="criteria-card"><span>ĐIỀU KIỆN 01</span><Award/><div><strong>Bằng khen</strong><p>Cấp Thủ tướng Chính phủ</p></div><Check/></div><div className="criteria-and">VÀ</div><div className="criteria-card"><span>ĐIỀU KIỆN 02</span><FileCheck2/><div><strong>Đề tài khoa học</strong><p>Đề tài cấp Bộ</p></div><Check/></div><ChevronRight className="flow-arrow"/><div className="criteria-result"><Medal/><div><span>KẾT QUẢ ĐỀ XUẤT</span><strong>{people.length || 0} hồ sơ phù hợp</strong></div></div></div>
    <section className="panel candidates-panel"><PanelHeader title="Danh sách ứng viên" subtitle="Sắp xếp theo mức độ hoàn thiện hồ sơ" action={<button className="ghost-button"><Download size={16}/>Xuất danh sách</button>}/><div className="candidate-list">{people.map((p,i)=>{const name=String(p.fullName??p["full_name"]);return <div className="candidate" key={String(p.id)}><span className="rank">{String(i+1).padStart(2,"0")}</span><div className="mini-avatar">{initials(name)}</div><div className="candidate-name"><strong>{name}</strong><span>{String(p.unit)}</span></div><div className="evidence"><span><Check/>Bằng khen Thủ tướng</span><span><Check/>Đề tài cấp Bộ</span></div><div className="progress"><div><i style={{width:`${96-i*5}%`}}/></div><span>{96-i*5}% hoàn thiện</span></div><button className="secondary-button">Rà soát<ChevronRight size={16}/></button></div>})}</div></section>
  </div>;
}

function ImportPage({ demo, toast }: { demo:boolean; toast:(t:Toast["type"],m:string)=>void }) {
  const input=useRef<HTMLInputElement>(null); const [file,setFile]=useState<File|null>(null); const [rows,setRows]=useState<EmployeeInput[]>([]); const [drag,setDrag]=useState(false); const [loading,setLoading]=useState(false);
  const parse=async(f:File)=>{setFile(f);const sheet=await readSheet(f);const headers=(sheet[0]??[]).map(v=>normalize(String(v??"")));const value=(r:unknown[],names:string[])=>{const index=headers.findIndex(k=>names.includes(k));return index>=0?String(r[index]??"").trim():""};const parsed=sheet.slice(1).filter(r=>r.some(Boolean)).map(r=>({citizenId:value(r,["cccd","so cccd","can cuoc cong dan"]),fullName:value(r,["ho ten","ho va ten"]),gender:normalize(value(r,["gioi tinh"]))==="nu"?"NU" as const:"NAM" as const,dateOfBirth:excelDate(r[headers.findIndex(k=>["ngay sinh","ngay thang nam sinh"].includes(k))]),education:value(r,["trinh do"]),unit:value(r,["don vi"]),position:value(r,["chuc vu"]),professionalTitle:value(r,["chuc danh nghe nghiep","chuc danh"]),active:true}));setRows(parsed)};
  const upload=async()=>{if(!rows.length)return;setLoading(true);try{if(!demo){const result=await api.importEmployees(rows);toast("success",`Đã nhập ${result.accepted} hồ sơ, ${result.rejected} dòng cần kiểm tra.`)}else toast("success",`Đã mô phỏng nhập ${rows.length} hồ sơ.`);setFile(null);setRows([])}catch(e){toast("error",e instanceof Error?e.message:"Không thể nhập dữ liệu.")}finally{setLoading(false)}};
  return <div className="page"><PageTitle eyebrow="NHẬP DỮ LIỆU HÀNG LOẠT" title="Nhập hồ sơ từ Excel" description="Hệ thống đối chiếu CCCD để tự động thêm mới hoặc cập nhật hồ sơ hiện có." action={<button className="ghost-button"><Download size={17}/>Tải file mẫu</button>}/>
    <div className="import-steps"><div className="done"><span>1</span><div><strong>Chọn tệp</strong><small>.xlsx hoặc .xls</small></div></div><i/><div className={rows.length?"done":""}><span>2</span><div><strong>Kiểm tra dữ liệu</strong><small>Ánh xạ và xác thực</small></div></div><i/><div><span>3</span><div><strong>Hoàn tất</strong><small>Cập nhật vào CSDL</small></div></div></div>
    {!file?<div className={`dropzone ${drag?"dragging":""}`} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)void parse(f)}}><input ref={input} type="file" accept=".xlsx,.xls" hidden onChange={e=>{const f=e.target.files?.[0];if(f)void parse(f)}}/><div className="upload-icon"><UploadCloud/></div><h3>Kéo và thả tệp Excel vào đây</h3><p>hoặc chọn tệp từ máy tính · tối đa 10 MB</p><button className="secondary-button" onClick={()=>input.current?.click()}>Chọn tệp Excel</button><div className="drop-hint"><FileCheck2 size={16}/>Các cột bắt buộc: CCCD, Họ tên, Giới tính, Ngày sinh, Đơn vị</div></div>:
    <section className="panel preview-panel"><div className="file-summary"><div className="excel-icon"><FileSpreadsheet/></div><div><strong>{file.name}</strong><span>{(file.size/1024).toFixed(1)} KB · {rows.length} dòng dữ liệu</span></div><span className="valid-badge"><Check/>Sẵn sàng nhập</span><button className="icon-button" onClick={()=>{setFile(null);setRows([])}}><X/></button></div><div className="table-scroll"><table><thead><tr><th>#</th><th>CCCD</th><th>Họ và tên</th><th>Giới tính</th><th>Ngày sinh</th><th>Đơn vị</th></tr></thead><tbody>{rows.slice(0,8).map((r,i)=><tr key={i}><td>{i+1}</td><td className="mono">{r.citizenId}</td><td><strong>{r.fullName}</strong></td><td>{r.gender}</td><td>{r.dateOfBirth}</td><td>{r.unit}</td></tr>)}</tbody></table></div><div className="import-actions"><span>CCCD trùng sẽ được cập nhật, không tạo bản ghi mới.</span><button className="primary-button" onClick={()=>void upload()} disabled={loading}>{loading?<RefreshCw className="spin" size={17}/>:<UploadCloud size={17}/>}Nhập {rows.length} hồ sơ</button></div></section>}
  </div>;
}

function UsersPage({ demo,user }:{demo:boolean;user:SessionUser}) { return <div className="page"><PageTitle eyebrow="QUẢN TRỊ HỆ THỐNG" title="Người dùng & phân quyền" description="Cấp quyền tối thiểu cần thiết cho từng nhóm nghiệp vụ." action={<button className="primary-button"><Plus size={18}/>Thêm người dùng</button>}/><div className="role-grid">{[["Quản trị viên","Toàn quyền cấu hình và quản lý",1,"navy"],["Tổ chức cán bộ","Thêm, sửa hồ sơ và thành tích",4,"teal"],["Hội đồng xét duyệt","Rà soát và xem đề xuất",8,"violet"],["Chỉ xem","Tra cứu dữ liệu được phép",12,"gray"]].map(x=><div className="role-card" key={String(x[0])}><div className={`role-symbol ${x[3]}`}><UserRound/></div><div><strong>{x[0]}</strong><span>{x[1]}</span></div><b>{x[2]}</b><small>người dùng</small></div>)}</div><section className="panel"><PanelHeader title="Tài khoản đang hoạt động" subtitle="Phân quyền được áp dụng ngay sau khi lưu"/><div className="user-list"><div className="user-row"><div className="avatar">{initials(user.displayName)}</div><div><strong>{user.displayName}</strong><span>{user.username} · Đăng nhập gần nhất: vừa xong</span></div><span className="role-pill admin">Quản trị viên</span><span className="status-active"><i/>Đang hoạt động</span><button className="row-action"><ChevronRight/></button></div>{demo&&["Phạm Thu Hương","Lê Văn Đức","Trần Ngọc Mai"].map((n,i)=><div className="user-row" key={n}><div className="avatar">{initials(n)}</div><div><strong>{n}</strong><span>{["huong.pt","duc.lv","mai.tn"][i]} · Đăng nhập hôm qua</span></div><span className="role-pill">{i===2?"Hội đồng xét duyệt":"Tổ chức cán bộ"}</span><span className="status-active"><i/>Đang hoạt động</span><button className="row-action"><ChevronRight/></button></div>)}</div></section></div> }

function SettingsPage(){const[version,setVersion]=useState("0.1.0");const[status,setStatus]=useState("");useEffect(()=>{void window.desktop?.getVersion().then(setVersion);return window.desktop?.onUpdateStatus(x=>setStatus(x.status))},[]);return <div className="page"><PageTitle eyebrow="CẤU HÌNH" title="Thiết lập hệ thống" description="Quản lý kết nối, cập nhật phần mềm và chính sách dữ liệu."/><div className="settings-grid"><section className="panel setting-card"><div className="setting-icon"><RefreshCw/></div><div><h3>Cập nhật ứng dụng</h3><p>Phiên bản hiện tại <strong>v{version}</strong>. Bản phát hành được kiểm tra an toàn qua GitHub Releases.</p>{status&&<span className="update-status">Trạng thái: {status}</span>}</div><button className="secondary-button" onClick={()=>void window.desktop?.checkForUpdates()}>Kiểm tra cập nhật</button></section><section className="panel setting-card"><div className="setting-icon teal"><ShieldCheck/></div><div><h3>Lưu trữ & bảo mật</h3><p>Dữ liệu nghiệp vụ lưu tại Cloudflare D1; minh chứng lưu riêng trong R2.</p></div><span className="valid-badge"><Check/>Kết nối thiết kế sẵn</span></section></div></div>}

function PageTitle({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:ReactNode}){return <div className="page-title"><div><span className="eyebrow teal">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action&&<div>{action}</div>}</div>}
function PanelHeader({title,subtitle,action}:{title:string;subtitle:string;action?:ReactNode}){return <div className="panel-header"><div><h3>{title}</h3><p>{subtitle}</p></div>{action}</div>}
function initials(name:string){return name.trim().split(/\s+/).slice(-2).map(x=>x[0]).join("").toUpperCase()}
function roleLabel(role:string){return ({ADMIN:"Quản trị viên",HR:"Tổ chức cán bộ",REVIEWER:"Hội đồng xét duyệt",VIEWER:"Chỉ xem"} as Record<string,string>)[role]??role}
function normalize(v:string){return v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()}
function excelDate(v:unknown){if(v instanceof Date)return v.toISOString().slice(0,10);const s=String(v??"").trim();const m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);return m?`${m[3]}-${m[2]!.padStart(2,"0")}-${m[1]!.padStart(2,"0")}`:s}

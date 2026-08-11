import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format as formatCalendarDate,
  isSameDay,
  isSameMonth,
  parseISO,
  setMonth,
  setYear,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { vi } from "date-fns/locale";
import { readSheet } from "read-excel-file/browser";
import writeXlsxFile, { type SheetData } from "write-excel-file/browser";
import {
  Award,
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  FileCheck2,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Medal,
  Menu,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UploadCloud,
  UserRound,
  Users,
  X,
  Check,
  AlertCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  achievementLevels,
  achievementTypes,
  levelLabels,
  levelsForAchievementType,
  rewardTypes,
  roles,
  typeLabels,
  type AchievementInput,
  type AchievementLevel,
  type AchievementType,
  type EmployeeInput,
  type RewardType,
  type Role,
  type SessionUser,
} from "@thongnhat/shared";
import {
  api,
  ApiError,
  hasToken,
  setToken,
  type AchievementImportInput,
  type UserCounts,
  type UserRecord,
} from "./api";
import hospitalLogo from "./assets/logo-bvtn.png";

type Page =
  "dashboard" | "employees" | "candidates" | "import" | "users" | "settings";
type Toast = { id: number; type: "success" | "error"; message: string };
type UpdateState = {
  status:
    | "checking"
    | "available"
    | "downloading"
    | "ready"
    | "current"
    | "development"
    | "error";
  percent: number;
  version?: string;
  message?: string;
};

const nav: Array<{
  group: string;
  items: Array<{ id: Page; label: string; icon: LucideIcon }>;
}> = [
  {
    group: "Tổng quan",
    items: [
      { id: "dashboard", label: "Bảng điều khiển", icon: LayoutDashboard },
    ],
  },
  {
    group: "Nghiệp vụ",
    items: [
      { id: "employees", label: "Hồ sơ nhân viên", icon: Users },
      { id: "candidates", label: "Đề xuất khen thưởng", icon: Medal },
      { id: "import", label: "Nhập dữ liệu Excel", icon: FileSpreadsheet },
    ],
  },
  {
    group: "Hệ thống",
    items: [
      { id: "users", label: "Người dùng & phân quyền", icon: ShieldCheck },
      { id: "settings", label: "Thiết lập", icon: Settings },
    ],
  },
];

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [page, setPage] = useState<Page>("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [loadingSession, setLoadingSession] = useState(hasToken());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [update, setUpdate] = useState<UpdateState>(() => ({
    status: window.desktop ? "checking" : "development",
    percent: 0,
  }));
  const [skipUpdate, setSkipUpdate] = useState(false);

  const toast = (type: Toast["type"], message: string) => {
    const id = Date.now();
    setToasts((x) => [...x, { id, type, message }]);
    window.setTimeout(
      () => setToasts((x) => x.filter((t) => t.id !== id)),
      4200,
    );
  };

  useEffect(() => {
    if (!hasToken()) return;
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => setToken(""))
      .finally(() => setLoadingSession(false));
  }, []);

  const checkUpdate = () => {
    if (!window.desktop) {
      setUpdate({ status: "development", percent: 0 });
      return;
    }
    setSkipUpdate(false);
    setUpdate({ status: "checking", percent: 0 });
    void window.desktop
      .checkForUpdates()
      .then((result) => {
        if (result.status === "current" || result.status === "development")
          setUpdate({
            status: result.status,
            percent: result.status === "current" ? 100 : 0,
            version: result.version,
          });
      })
      .catch((error) =>
        setUpdate({
          status: "error",
          percent: 0,
          message:
            error instanceof Error
              ? error.message
              : "Không thể kiểm tra cập nhật.",
        }),
      );
  };
  useEffect(() => {
    const stop = window.desktop?.onUpdateStatus((data) => {
      const detail = (data.detail ?? {}) as {
        percent?: number;
        version?: string;
        message?: string;
      };
      const status = data.status as UpdateState["status"];
      setUpdate((current) => ({
        status,
        percent: status === "ready" ? 100 : (detail.percent ?? current.percent),
        version: detail.version ?? current.version,
        message: detail.message,
      }));
    });
    checkUpdate();
    return stop;
  }, []);

  if (!skipUpdate && !["current", "development"].includes(update.status))
    return (
      <UpdateScreen
        state={update}
        onRetry={checkUpdate}
        onSkip={() => setSkipUpdate(true)}
      />
    );
  if (loadingSession)
    return (
      <div className="boot">
        <div className="brand-mark">
          <HospitalLogo />
        </div>
        <div className="boot-line" />
      </div>
    );
  if (!user) return <Login onLogin={setUser} />;

  const currentUser = user;
  const logout = async () => {
    await api.logout().catch(() => undefined);
    setToken("");
    setUser(null);
  };

  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <HospitalLogo />
          </div>
          {!collapsed && (
            <div>
              <strong>Bệnh viện Thống Nhất</strong>
              <span>Quản lý khen thưởng</span>
            </div>
          )}
        </div>
        <nav aria-label="Điều hướng chính">
          {nav.map((section) => (
            <div className="nav-section" key={section.group}>
              {!collapsed && <div className="nav-label">{section.group}</div>}
              {section.items.map((item) => (
                <button
                  key={item.id}
                  className={`nav-item ${page === item.id ? "active" : ""}`}
                  onClick={() => setPage(item.id)}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className="nav-icon" aria-hidden="true" />
                  <span>{item.label}</span>
                  {!collapsed && page === item.id && (
                    <ChevronRight className="nav-chevron" aria-hidden="true" />
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          {!collapsed && (
            <div className="help-card">
              <CircleHelp size={20} />
              <div>
                <strong>Cần hỗ trợ?</strong>
                <span>Xem hướng dẫn sử dụng</span>
              </div>
            </div>
          )}
          <button
            className="collapse-btn"
            onClick={() => setCollapsed(!collapsed)}
          >
            <Menu size={19} />
            {!collapsed && <span>Thu gọn thanh bên</span>}
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Bệnh viện Thống Nhất</span>
            <ChevronRight size={15} />
            <strong>
              {nav.flatMap((x) => x.items).find((x) => x.id === page)?.label}
            </strong>
          </div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Thông báo">
              <Bell size={19} />
              <i />
            </button>
            <div className="user-menu">
              <div className="avatar">{initials(currentUser.displayName)}</div>
              <div>
                <strong>{currentUser.displayName}</strong>
                <span>{roleLabel(currentUser.role)}</span>
              </div>
              <ChevronDown size={16} />
            </div>
            <button
              className="icon-button"
              aria-label="Đăng xuất"
              onClick={() => void logout()}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main id="main-content">
          {page === "dashboard" && (
            <Dashboard
              displayName={currentUser.displayName}
              onNavigate={setPage}
            />
          )}
          {page === "employees" && <EmployeesPage toast={toast} />}
          {page === "candidates" && (
            <CandidatesPage toast={toast} />
          )}
          {page === "import" && <ImportPage toast={toast} />}
          {page === "users" && (
            <UsersPage
              user={currentUser}
              toast={toast}
              onCurrentUserUpdated={(updated) =>
                setUser((current) =>
                  current && current.id === updated.id
                    ? {
                        ...current,
                        displayName: updated.displayName,
                        role: updated.role,
                      }
                    : current,
                )
              }
            />
          )}
          {page === "settings" && <SettingsPage />}
        </main>
      </div>
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div className={`toast ${t.type}`} key={t.id}>
            {t.type === "success" ? <Check /> : <AlertCircle />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function UpdateScreen({
  state,
  onRetry,
  onSkip,
}: {
  state: UpdateState;
  onRetry: () => void;
  onSkip: () => void;
}) {
  if (state.status !== "error") {
    const indeterminate = state.status === "checking" || state.status === "available";
    return (
      <div className="update-screen" aria-label="Đang cập nhật ứng dụng">
        <div className="update-only-progress">
          <div
            className="update-progress"
            role="progressbar"
            aria-label="Tiến trình cập nhật"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={indeterminate ? undefined : state.percent}
          >
            <i
              className={indeterminate ? "indeterminate" : ""}
              style={indeterminate ? undefined : { width: `${state.percent}%` }}
            />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="update-screen">
      <div className="update-card">
        <div className="update-logo">
          <HospitalLogo />
        </div>
        <span className="eyebrow teal">BỆNH VIỆN THỐNG NHẤT</span>
        <h1>Không thể kiểm tra cập nhật</h1>
        <p>{state.message || "Kiểm tra kết nối mạng rồi thử lại."}</p>
        <div className="update-error-actions">
          <button className="primary-button" onClick={onRetry}>
            <RefreshCw size={17} />
            Thử lại
          </button>
          <button className="ghost-button" onClick={onSkip}>
            Bỏ qua và đăng nhập
          </button>
        </div>
        <small>Ứng dụng tự động kiểm tra cập nhật trước khi đăng nhập.</small>
      </div>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (u: SessionUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await api.login(username, password);
      setToken(result.token);
      onLogin(result.user);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Không thể kết nối máy chủ.",
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="login-screen">
      <section className="login-story">
        <div className="story-copy">
          <span className="eyebrow">BỆNH VIỆN THỐNG NHẤT</span>
          <h1>
            Ghi nhận xứng đáng.
            <br />
            Lan tỏa cống hiến.
          </h1>
          <p>
            Một không gian thống nhất để quản lý hồ sơ thành tích, sàng lọc tiêu
            chuẩn và đề xuất khen thưởng minh bạch.
          </p>
        </div>
        <div className="story-stats">
          <div>
            <strong>01</strong>
            <span>
              Nguồn dữ liệu
              <br />
              đồng nhất
            </span>
          </div>
          <div>
            <strong>360°</strong>
            <span>
              Hồ sơ thành tích
              <br />
              toàn diện
            </span>
          </div>
          <div>
            <strong>100%</strong>
            <span>
              Truy vết
              <br />
              thay đổi
            </span>
          </div>
        </div>
        <div className="story-orbit">
          <span />
          <span />
          <span />
        </div>
      </section>
      <section className="login-panel">
        <form onSubmit={submit}>
          <div className="login-brand-block">
            <div className="hospital-seal">
              <HospitalLogo />
            </div>
            <strong>Bệnh viện Thống Nhất</strong>
          </div>
          <span className="eyebrow teal">CỔNG NGHIỆP VỤ NỘI BỘ</span>
          <h2>Chào mừng trở lại</h2>
          <p className="muted">
            Đăng nhập bằng tài khoản được quản trị viên cấp.
          </p>
          {error && (
            <div className="form-error" role="alert">
              <AlertCircle size={18} />
              {error}
            </div>
          )}
          <label>
            Tên đăng nhập
            <input
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Nhập tên đăng nhập"
              required
            />
          </label>
          <label>
            Mật khẩu
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
              required
            />
          </label>
          <button className="primary-button full" disabled={loading}>
            {loading ? (
              <>
                <RefreshCw className="spin" size={18} />
                Đang xác thực
              </>
            ) : (
              <>
                Đăng nhập
                <ChevronRight size={18} />
              </>
            )}
          </button>
          <div className="security-note">
            <ShieldCheck size={19} />
            <span>
              Dữ liệu được mã hóa khi truyền và phân quyền theo vai trò.
            </span>
          </div>
        </form>
      </section>
    </div>
  );
}

function Dashboard({
  displayName,
  onNavigate,
}: {
  displayName: string;
  onNavigate: (p: Page) => void;
}) {
  const now = new Date();
  const year = now.getFullYear();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    void api
      .dashboard(year)
      .then(setData)
      .catch(() => undefined);
  }, [year]);
  const monthly =
    (data?.monthly as number[] | undefined) ??
    Array.from({ length: 12 }, () => 0);
  const chartMax = Math.max(1, ...monthly);
  const chartTicks = [
    chartMax,
    Math.round((chartMax * 2) / 3),
    Math.round(chartMax / 3),
    0,
  ];
  const recent =
    (data?.recent as Array<Record<string, unknown>> | undefined) ?? [];
  const candidateCount = Number(data?.candidates ?? 0);
  const stats = [
    {
      label: "Nhân viên đang quản lý",
      value: String(data?.employees ?? "—"),
      delta: "Đang hoạt động",
      icon: Users,
      tone: "blue",
    },
    {
      label: `Thành tích năm ${year}`,
      value: String(data?.achievements ?? "—"),
      delta: "Theo ngày chấp nhận",
      icon: Award,
      tone: "teal",
    },
    {
      label: "Đơn vị trực thuộc",
      value: String(data?.units ?? "—"),
      delta: "Có nhân sự hoạt động",
      icon: LayoutDashboard,
      tone: "violet",
    },
    {
      label: "Hồ sơ có thể xét",
      value: String(data?.candidates ?? "—"),
      delta: "Theo bộ tiêu chuẩn",
      icon: Sparkles,
      tone: "amber",
    },
  ];
  return (
    <div className="page dashboard-page">
      <PageTitle
        eyebrow={`THÁNG ${String(now.getMonth() + 1).padStart(2, "0")} · ${year}`}
        title={`Chào buổi sáng, ${displayName}`}
        description="Số liệu trực tiếp từ hồ sơ nhân sự và thành tích trên D1."
        action={
          <button
            className="primary-button"
            onClick={() => onNavigate("candidates")}
          >
            <Sparkles size={18} />
            Xem đề xuất mới
          </button>
        }
      />
      <div className="stat-grid">
        {stats.map((s) => (
          <article className="stat-card" key={s.label}>
            <div className={`stat-icon ${s.tone}`}>
              <s.icon size={21} />
            </div>
            <div className="stat-meta">
              <span>{s.label}</span>
              <strong>{s.value}</strong>
              <small>{s.delta}</small>
            </div>
          </article>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel activity-panel">
          <PanelHeader
            title="Nhịp độ ghi nhận"
            subtitle={`Thành tích được cập nhật trong ${year}`}
            action={
              <button className="ghost-button">
                <Download size={16} />
                Xuất báo cáo
              </button>
            }
          />
          <div className="chart-wrap">
            <div className="chart-y">
              {chartTicks.map((tick, index) => (
                <span key={`${tick}-${index}`}>{tick}</span>
              ))}
            </div>
            <div className="bar-chart">
              {monthly.map((value, i) => (
                <div className="bar-col" key={i}>
                  <div
                    className={`bar ${i === now.getMonth() ? "highlight" : ""}`}
                    style={{
                      height: `${Math.max(value ? 12 : 2, (value / chartMax) * 150)}px`,
                    }}
                  >
                    <span>{value}</span>
                  </div>
                  <small>T{i + 1}</small>
                </div>
              ))}
            </div>
          </div>
          <div className="chart-legend">
            <span>
              <i className="legend-dot current" />
              Dữ liệu năm {year}
            </span>
          </div>
        </section>
        <section className="panel recommendation-panel">
          <PanelHeader
            title="Đề xuất nổi bật"
            subtitle="Từ bộ lọc tiêu chuẩn hiện hành"
          />
          <div className="award-emblem">
            <Medal size={30} />
          </div>
          <span className="recommend-label">KẾT QUẢ ĐỐI CHIẾU TỰ ĐỘNG</span>
          <strong>
            {candidateCount.toLocaleString("vi-VN")} hồ sơ phù hợp
          </strong>
          <p>
            Được tính trực tiếp từ bộ tiêu chuẩn đang bật và thành tích đã ghi
            nhận.
          </p>
          <button
            className="secondary-button full"
            onClick={() => onNavigate("candidates")}
          >
            Rà soát danh sách
            <ChevronRight size={17} />
          </button>
        </section>
        <section className="panel recent-panel">
          <PanelHeader
            title="Cập nhật gần đây"
            subtitle="Dữ liệu mới ghi nhận trên hệ thống"
            action={
              <button
                className="text-button"
                onClick={() => onNavigate("employees")}
              >
                Xem tất cả
              </button>
            }
          />
          <div className="activity-list">
            {recent.length ? (
              recent.map((item, i) => (
                <div className="activity-item" key={String(item.id)}>
                  <div className={`activity-icon a${i}`}>
                    <FileCheck2 size={18} />
                  </div>
                  <div>
                    <strong>{String(item.fullName)}</strong>
                    <span>{String(item.title)}</span>
                  </div>
                  <span className="achievement-tag">
                    {typeLabels[item.type as AchievementType] ??
                      String(item.type)}
                  </span>
                  <time>{formatDate(item.acceptedDate)}</time>
                </div>
              ))
            ) : (
              <div className="empty-inline">
                Chưa có thành tích nào được ghi nhận.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function EmployeesPage({
  toast,
}: {
  toast: (t: Toast["type"], m: string) => void;
}) {
  const pageSize = 25;
  const [employees, setEmployees] = useState<Array<Record<string, unknown>>>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [modal, setModal] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [units, setUnits] = useState<string[]>([]);
  const [unit, setUnit] = useState("");
  const [achievementType, setAchievementType] = useState("");
  const [level, setLevel] = useState("");
  const [year, setYear] = useState("");
  const buildQuery = (
    targetPage: number,
    targetPageSize: number,
    filters = { search, unit, achievementType, level, year },
  ) => new URLSearchParams({
    search: filters.search,
    page: String(targetPage),
    pageSize: String(targetPageSize),
    ...(filters.unit && { unit: filters.unit }),
    ...(filters.achievementType && { achievementType: filters.achievementType }),
    ...(filters.level && { achievementLevel: filters.level }),
    ...(filters.year && { fromYear: filters.year, toYear: filters.year }),
  });
  const load = (
    targetPage = page,
    filters = { search, unit, achievementType, level, year },
  ) => {
    setLoading(true);
    const q = buildQuery(targetPage, pageSize, filters);
    api
      .employees(q.toString())
      .then((x) => {
        setEmployees(x.items);
        setTotal(x.total);
        setPage(targetPage);
        setSelectedIds(new Set());
      })
      .catch((e) => toast("error", e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    void api.options().then((x) => setUnits(x.units));
    load(1);
  }, []);
  const shown = employees;
  const shownIds = shown.map((employee) => String(employee.id));
  const allSelected = shownIds.length > 0 && shownIds.every((id) => selectedIds.has(id));
  const someSelected = shownIds.some((id) => selectedIds.has(id));
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected && !allSelected;
  }, [someSelected, allSelected]);
  const effectiveTotal = total;
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / pageSize));
  const first = effectiveTotal ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(page * pageSize, effectiveTotal);
  const go = (target: number) => {
    const next = Math.min(Math.max(target, 1), totalPages);
    load(next);
  };
  const removeEmployees = async (ids: string[]) => {
    if (!ids.length || !window.confirm(`Xóa ${ids.length} nhân viên đã chọn? Hồ sơ, thành tích và minh chứng liên quan cũng sẽ bị xóa.`)) return;
    setDeleting(true);
    try {
      const result = await api.deleteEmployees(ids);
      toast("success", `Đã xóa ${result.deleted} nhân viên.`);
      load(page);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Không thể xóa nhân viên.");
    } finally {
      setDeleting(false);
    }
  };
  const exportEmployees = async () => {
    setExporting(true);
    try {
      const exportPageSize = 100;
      const firstPage = await api.employees(buildQuery(1, exportPageSize).toString());
      const rows = [...firstPage.items];
      const pageCount = Math.ceil(firstPage.total / exportPageSize);
      for (let targetPage = 2; targetPage <= pageCount; targetPage += 1) {
        const result = await api.employees(buildQuery(targetPage, exportPageSize).toString());
        rows.push(...result.items);
      }
      const header = (value: string) => ({
        value,
        fontWeight: "bold" as const,
        color: "#FFFFFF",
        backgroundColor: "#007BFF",
        align: "center" as const,
      });
      const sheetRows: SheetData = [
        [header("STT"), header("CCCD"), header("Họ và tên"), header("Giới tính"), header("Ngày sinh"), header("Khoa / phòng"), header("Chức vụ"), header("Chức danh nghề nghiệp"), header("Trạng thái")],
        ...rows.map((employee, index) => [
          index + 1,
          citizenIdForExport(employee.citizenId),
          String(employee.fullName ?? ""),
          genderLabel(String(employee.gender ?? "")),
          formatDate(employee.dateOfBirth),
          String(employee.unit ?? ""),
          String(employee.position ?? ""),
          String(employee.professionalTitle ?? ""),
          employee.active === false ? "Ngừng hoạt động" : "Đang hoạt động",
        ]),
      ];
      const today = formatCalendarDate(new Date(), "yyyy-MM-dd");
      await writeXlsxFile(sheetRows, {
        columns: [
          { width: 8 }, { width: 18 }, { width: 30 }, { width: 13 }, { width: 14 },
          { width: 32 }, { width: 24 }, { width: 28 }, { width: 18 },
        ],
        sheet: "Danh sách nhân viên",
      }).toFile(`danh-sach-nhan-vien-${today}.xlsx`);
      toast("success", `Đã xuất ${rows.length} nhân viên ra Excel.`);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Không thể xuất danh sách nhân viên.");
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="page">
      <PageTitle
        eyebrow="HỒ SƠ NHÂN SỰ"
        title="Danh sách nhân viên"
        description="Chọn một nhân viên để xem hồ sơ và thêm thành tích hằng năm."
        action={
          <button className="primary-button" onClick={() => setModal(true)}>
            <Plus size={18} />
            Thêm nhân viên
          </button>
        }
      />
      <section className="panel data-panel">
        <div className="table-toolbar">
          <div className="search-box">
            <Search size={18} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setPage(1);
                  load(1);
                }
              }}
              placeholder="Tìm theo họ tên hoặc CCCD..."
            />
            <kbd>Enter</kbd>
          </div>
          <button
            className={`filter-button ${filtersOpen ? "active" : ""}`}
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <SlidersHorizontal size={17} />
            Bộ lọc chi tiết
          </button>
          <button className="ghost-button" disabled={exporting} onClick={() => void exportEmployees()}>
            {exporting ? <RefreshCw className="spin" size={17} /> : <Download size={17} />}
            Xuất Excel
          </button>
        </div>
        {filtersOpen && (
          <div className="filter-drawer">
            <div className="filter-grid">
              <label>
                Đơn vị
                <SearchableSelect
                  value={unit}
                  onChange={setUnit}
                  options={units}
                  placeholder="Tất cả đơn vị"
                  allowClear
                />
              </label>
              <label>
                Loại thành tích
                <select
                  value={achievementType}
                  onChange={(event) => {
                    setAchievementType(event.target.value);
                    setLevel("");
                  }}
                >
                  <option value="">Tất cả loại</option>
                  {achievementTypes.map((type) => (
                    <option key={type} value={type}>{typeLabels[type]}</option>
                  ))}
                </select>
              </label>
              <label>
                Cấp / hạng
                <select
                  value={level}
                  disabled={!achievementType}
                  onChange={(e) => setLevel(e.target.value)}
                >
                  <option value="">{achievementType ? "Tất cả cấp / hạng" : "Chọn loại trước"}</option>
                  {(achievementType ? levelsForAchievementType(achievementType as AchievementType) : []).map((x) => (
                    <option key={x} value={x}>
                      {levelLabels[x]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Năm ghi nhận
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="Ví dụ: 2026"
                />
              </label>
              <button
                className="secondary-button apply-filter"
                onClick={() => {
                  setPage(1);
                  load(1);
                }}
              >
                Áp dụng bộ lọc
              </button>
              <button
                className="clear-filters"
                onClick={() => {
                  setUnit("");
                  setAchievementType("");
                  setLevel("");
                  setYear("");
                  setPage(1);
                  load(1, { search, unit: "", achievementType: "", level: "", year: "" });
                }}
              >
                Xóa tất cả
              </button>
            </div>
          </div>
        )}
        <div className="table-summary">
          <span>
            <strong>{effectiveTotal.toLocaleString("vi-VN")}</strong> nhân viên
          </span>
          {selectedIds.size ? (
            <button
              className="bulk-delete-button"
              disabled={deleting}
              onClick={() => void removeEmployees([...selectedIds])}
            >
              <Trash2 size={15} />
              Xóa {selectedIds.size} đã chọn
            </button>
          ) : (
            <span>Nhấn vào dòng để mở hồ sơ</span>
          )}
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th className="select-column">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) =>
                      setSelectedIds(
                        event.target.checked ? new Set(shownIds) : new Set(),
                      )
                    }
                    aria-label="Chọn tất cả nhân viên trên trang"
                  />
                </th>
                <th>Nhân viên</th>
                <th>CCCD</th>
                <th>Đơn vị</th>
                <th>Chức vụ / chức danh</th>
                <th>Trình độ</th>
                <th>Thành tích</th>
                <th className="action-column">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="table-loading" colSpan={8}>
                    Đang tải danh sách nhân viên...
                  </td>
                </tr>
              ) : shown.length ? shown.map((employee, index) => (
                <tr
                  className="clickable-row"
                  key={String(employee.id)}
                  tabIndex={0}
                  onClick={() => setSelectedId(String(employee.id))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ")
                      setSelectedId(String(employee.id));
                  }}
                >
                  <td className="select-column">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(String(employee.id))}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        const id = String(employee.id);
                        setSelectedIds((current) => {
                          const next = new Set(current);
                          event.target.checked ? next.add(id) : next.delete(id);
                          return next;
                        });
                      }}
                      aria-label={`Chọn ${employee.fullName}`}
                    />
                  </td>
                  <td>
                    <div className={`person-cell avatar-tone-${index % 5}`}>
                      <div className="mini-avatar">
                        {initials(String(employee.fullName))}
                      </div>
                      <div>
                        <strong>{String(employee.fullName)}</strong>
                        <span>
                          {genderLabel(String(employee.gender))} ·{" "}
                          {formatDate(employee.dateOfBirth)}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="mono">{String(employee.citizenId)}</td>
                  <td>
                    <span className="unit-cell">{String(employee.unit)}</span>
                  </td>
                  <td>
                    <strong className="table-main">
                      {String(employee.position || "—")}
                    </strong>
                    <span className="table-sub">
                      {String(employee.professionalTitle || "")}
                    </span>
                  </td>
                  <td>{String(employee.education || "—")}</td>
                  <td>
                    <span className="count-pill">
                      {String(employee.achievementCount ?? 0)} mục
                    </span>
                  </td>
                  <td className="employee-actions">
                    <button
                      className="row-action"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedId(String(employee.id));
                      }}
                      aria-label={`Mở hồ sơ ${employee.fullName}`}
                    >
                      <ChevronRight size={18} />
                    </button>
                    <button
                      className="row-action delete"
                      disabled={deleting}
                      onClick={(event) => {
                        event.stopPropagation();
                        void removeEmployees([String(employee.id)]);
                      }}
                      aria-label={`Xóa nhân viên ${employee.fullName}`}
                    >
                      <Trash2 size={17} />
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td className="table-loading" colSpan={8}>
                    Chưa có nhân viên phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <span>
            Hiển thị {first}–{last} trên{" "}
            {effectiveTotal.toLocaleString("vi-VN")}
          </span>
          <div>
            <button
              disabled={page <= 1}
              onClick={() => go(page - 1)}
              aria-label="Trang trước"
            >
              ‹
            </button>
            {pageNumbers(totalPages, page).map((number) => (
              <button
                key={number}
                className={number === page ? "active" : ""}
                onClick={() => go(number)}
              >
                {number}
              </button>
            ))}
            <button
              disabled={page >= totalPages}
              onClick={() => go(page + 1)}
              aria-label="Trang sau"
            >
              ›
            </button>
          </div>
        </div>
      </section>
      {modal && (
        <EmployeeModal
          units={units}
          onClose={() => setModal(false)}
          onSaved={() => {
            setModal(false);
            toast("success", "Đã thêm hồ sơ nhân viên.");
            void api.options().then((x) => setUnits(x.units));
            load(1);
          }}
        />
      )}
      {selectedId && (
        <EmployeeDetailModal
          id={selectedId}
          units={units}
          onClose={() => setSelectedId(null)}
          onChanged={() => load(page)}
          toast={toast}
        />
      )}
    </div>
  );
}

function EmployeeModal({
  units,
  onClose,
  onSaved,
}: {
  units: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [form, setForm] = useState<EmployeeInput>({
    citizenId: "",
    fullName: "",
    gender: "NAM",
    dateOfBirth: "",
    education: "",
    unit: "",
    position: "",
    professionalTitle: "",
    active: true,
  });
  const update = (key: keyof EmployeeInput, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const iso = parseVietnameseDate(birthDate);
    if (!iso) {
      setError("Ngày sinh phải đúng định dạng dd/mm/yyyy.");
      return;
    }
    setSaving(true);
    try {
      await api.createEmployee({ ...form, dateOfBirth: iso });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu hồ sơ.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form className="modal employee-form-modal" onSubmit={save}>
        <div className="modal-head">
          <div>
            <span className="eyebrow teal">HỒ SƠ GỐC</span>
            <h2>Thêm nhân viên</h2>
            <p>CCCD là mã định danh duy nhất và không được trùng.</p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X />
          </button>
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="form-grid">
          <label className="span-2">
            Họ và tên *
            <input
              required
              value={form.fullName}
              onChange={(e) => update("fullName", e.target.value)}
            />
          </label>
          <label>
            CCCD *
            <input
              required
              inputMode="numeric"
              pattern="\d{12}"
              maxLength={12}
              value={form.citizenId}
              onChange={(e) => update("citizenId", e.target.value.replace(/\D/g, "").slice(0, 12))}
            />
          </label>
          <label>
            Giới tính
            <select
              value={form.gender}
              onChange={(e) => update("gender", e.target.value)}
            >
              <option value="NAM">Nam</option>
              <option value="NU">Nữ</option>
              <option value="KHAC">Khác</option>
            </select>
          </label>
          <label>
            Ngày sinh *
            <VietnameseDatePicker
              value={birthDate}
              onChange={setBirthDate}
              required
            />
          </label>
          <label>
            Trình độ
            <input
              value={form.education}
              onChange={(e) => update("education", e.target.value)}
            />
          </label>
          <label className="span-2">
            Đơn vị *
            <SearchableSelect
              required
              value={form.unit}
              onChange={(value) => update("unit", value)}
              options={units}
              placeholder="Tìm hoặc nhập đơn vị mới"
            />
          </label>
          <label>
            Chức vụ
            <input
              value={form.position}
              onChange={(e) => update("position", e.target.value)}
            />
          </label>
          <label>
            Chức danh nghề nghiệp
            <input
              value={form.professionalTitle}
              onChange={(e) => update("professionalTitle", e.target.value)}
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Hủy
          </button>
          <button className="primary-button" disabled={saving}>
            {saving && <RefreshCw className="spin" size={17} />}Lưu hồ sơ
          </button>
        </div>
      </form>
    </div>
  );
}

function EmployeeDetailModal({
  id,
  units,
  onClose,
  onChanged,
  toast,
}: {
  id: string;
  units: string[];
  onClose: () => void;
  onChanged: () => void;
  toast: (t: Toast["type"], m: string) => void;
}) {
  const [employee, setEmployee] = useState<Record<string, unknown> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [achievementType, setAchievementType] =
    useState<AchievementType | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [form, setForm] = useState<EmployeeInput | null>(null);
  const applyEmployee = (value: Record<string, unknown>) => {
    setEmployee(value);
    setBirthDate(formatDate(value.dateOfBirth));
    setForm({
      citizenId: String(value.citizenId ?? ""),
      fullName: String(value.fullName ?? ""),
      gender: ["NAM", "NU", "KHAC"].includes(String(value.gender))
        ? (String(value.gender) as EmployeeInput["gender"])
        : "KHAC",
      dateOfBirth: String(value.dateOfBirth ?? ""),
      education: String(value.education ?? ""),
      unit: String(value.unit ?? ""),
      position: String(value.position ?? ""),
      professionalTitle: String(value.professionalTitle ?? ""),
      active: value.active !== false,
    });
  };
  const load = () => {
    setLoading(true);
    api
      .employee(id)
      .then(applyEmployee)
      .catch((error) => toast("error", error.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [id]);
  const achievements =
    (employee?.achievements as Array<Record<string, unknown>> | undefined) ??
    [];
  const update = (key: keyof EmployeeInput, value: string | boolean) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));
  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setError("");
    const iso = parseVietnameseDate(birthDate);
    if (!iso) {
      setError("Chọn ngày sinh hợp lệ theo định dạng ngày/tháng/năm.");
      return;
    }
    setSaving(true);
    try {
      const next = { ...form, dateOfBirth: iso };
      await api.updateEmployee(id, next);
      setForm(next);
      setEmployee((current) => (current ? { ...current, ...next } : current));
      toast("success", "Đã cập nhật hồ sơ nhân viên.");
      onChanged();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể cập nhật hồ sơ.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="modal-backdrop employee-workspace-backdrop">
      <section
        className="modal employee-detail-modal"
        aria-label="Chi tiết hồ sơ nhân viên"
      >
        <header className="employee-workspace-head">
          <div>
            <span className="eyebrow teal">HỒ SƠ NHÂN VIÊN</span>
            <h2>
              {loading
                ? "Đang tải..."
                : String(employee?.fullName ?? "Không tìm thấy hồ sơ")}
            </h2>
            <p>
              {employee
                ? `${String(employee.citizenId)} · ${achievements.length} thành tích đã ghi nhận`
                : ""}
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X />
          </button>
        </header>
        {form && (
          <div className="employee-workspace-body">
            <aside className="employee-info-sidebar">
              <div className="employee-profile-avatar">
                {initials(form.fullName)}
              </div>
              <div className="employee-sidebar-title">
                <strong>Thông tin cơ bản</strong>
                <span>Chỉnh sửa trực tiếp và lưu hồ sơ.</span>
              </div>
              <form onSubmit={saveProfile} className="employee-edit-form">
                {error && (
                  <div className="form-error" role="alert">
                    <AlertCircle size={17} />
                    {error}
                  </div>
                )}
                <label>
                  Họ và tên *
                  <input
                    required
                    value={form.fullName}
                    onChange={(event) => update("fullName", event.target.value)}
                  />
                </label>
                <label>
                  CCCD *
                  <input
                    required
                    inputMode="numeric"
                    pattern="\d{12}"
                    maxLength={12}
                    value={form.citizenId}
                    onChange={(event) =>
                      update("citizenId", event.target.value.replace(/\D/g, "").slice(0, 12))
                    }
                  />
                </label>
                <div className="employee-field-row">
                  <label>
                    Giới tính
                    <select
                      value={form.gender}
                      onChange={(event) => update("gender", event.target.value)}
                    >
                      <option value="NAM">Nam</option>
                      <option value="NU">Nữ</option>
                      <option value="KHAC">Khác</option>
                    </select>
                  </label>
                  <label>
                    Ngày sinh *
                    <VietnameseDatePicker
                      value={birthDate}
                      onChange={setBirthDate}
                      required
                    />
                  </label>
                </div>
                <label>
                  Khoa / phòng *
                  <SearchableSelect
                    required
                    value={form.unit}
                    onChange={(value) => update("unit", value)}
                    options={units}
                    placeholder="Tìm hoặc nhập khoa / phòng"
                    allowClear
                  />
                </label>
                <label>
                  Chức vụ
                  <input
                    value={form.position}
                    onChange={(event) => update("position", event.target.value)}
                  />
                </label>
                <label>
                  Chức danh nghề nghiệp
                  <input
                    value={form.professionalTitle}
                    onChange={(event) =>
                      update("professionalTitle", event.target.value)
                    }
                  />
                </label>
                <label>
                  Trình độ
                  <input
                    value={form.education}
                    onChange={(event) =>
                      update("education", event.target.value)
                    }
                  />
                </label>
                <label className="employee-active-control">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(event) => update("active", event.target.checked)}
                  />
                  <span>Nhân viên đang hoạt động</span>
                </label>
                <button className="primary-button full" disabled={saving}>
                  {saving && <RefreshCw className="spin" size={17} />}Lưu thay
                  đổi
                </button>
              </form>
            </aside>
            <main className="employee-record-area">
              <div className="employee-record-summary">
                <div>
                  <span>TỔNG THÀNH TÍCH</span>
                  <strong>{achievements.length}</strong>
                </div>
                {achievementTypes.map((type) => (
                  <div key={type}>
                    <span>{typeLabels[type]}</span>
                    <strong>
                      {achievements.filter((item) => item.type === type).length}
                    </strong>
                  </div>
                ))}
              </div>
              <div className="achievement-tables">
                {achievementTypes.map((type) => (
                  <AchievementTable
                    key={type}
                    type={type}
                    items={achievements.filter((item) => item.type === type)}
                    onAdd={() => setAchievementType(type)}
                  />
                ))}
              </div>
            </main>
          </div>
        )}
        {achievementType && employee && (
          <AchievementModal
            employeeId={id}
            employeeName={String(employee.fullName)}
            initialType={achievementType}
            onClose={() => setAchievementType(null)}
            onSaved={() => {
              setAchievementType(null);
              toast("success", "Đã thêm thành tích và minh chứng.");
              load();
              onChanged();
            }}
          />
        )}
      </section>
    </div>
  );
}

function AchievementTable({
  type,
  items,
  onAdd,
}: {
  type: AchievementType;
  items: Array<Record<string, unknown>>;
  onAdd: () => void;
}) {
  const isTaskCompletion = type === "TASK_COMPLETION";
  return (
    <section className="achievement-table-card">
      <div className="achievement-table-head">
        <div>
          <h3>{typeLabels[type]}</h3>
          <span>{items.length} mục</span>
        </div>
        <button className="secondary-button" onClick={onAdd}>
          <Plus size={16} />
          Thêm {typeLabels[type].toLowerCase()}
        </button>
      </div>
      {items.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              {isTaskCompletion ? (
                <tr>
                  <th>Năm</th>
                  <th>Mức hoàn thành</th>
                  <th>Số quyết định</th>
                  <th>Ngày đánh giá</th>
                  <th>Ghi chú</th>
                </tr>
              ) : (
                <tr>
                  <th>Năm</th>
                  <th>Tên thành tích</th>
                  <th>Cấp / hạng</th>
                  <th>Số quyết định</th>
                  <th>Ngày ghi nhận</th>
                  <th>Vai trò</th>
                </tr>
              )}
            </thead>
            <tbody>
              {items.map((item) =>
                isTaskCompletion ? (
                  <tr key={String(item.id)}>
                    <td>
                      <span className="year-pill">{String(item.year)}</span>
                    </td>
                    <td>
                      <strong className="task-level">
                        {levelLabels[item.level as AchievementLevel] ?? String(item.level)}
                      </strong>
                    </td>
                    <td className="mono">{String(item.decisionNumber || "—")}</td>
                    <td>{formatDate(item.acceptedDate)}</td>
                    <td>{String(item.notes || "—")}</td>
                  </tr>
                ) : (
                  <tr key={String(item.id)}>
                    <td>
                      <span className="year-pill">{String(item.year)}</span>
                    </td>
                    <td>
                      <strong className="table-main">{String(item.title)}</strong>
                      <span className="table-sub">
                        {String(item.organization || "Không ghi đơn vị")}
                      </span>
                    </td>
                    <td>
                      {levelLabels[item.level as AchievementLevel] ?? String(item.level)}
                    </td>
                    <td className="mono">{String(item.decisionNumber || "—")}</td>
                    <td>{formatDate(item.acceptedDate)}</td>
                    <td>{String(item.role || "—")}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="achievement-table-empty">
          <FileCheck2 />
          <span>Chưa có {typeLabels[type].toLowerCase()}.</span>
          <button className="text-button" onClick={onAdd}>
            Thêm mục đầu tiên
          </button>
        </div>
      )}
    </section>
  );
}

function AchievementModal({
  employeeId,
  employeeName,
  initialType = "RESEARCH",
  onClose,
  onSaved,
}: {
  employeeId: string;
  employeeName: string;
  initialType?: AchievementType;
  onClose: () => void;
  onSaved: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [acceptedDate, setAcceptedDate] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);
  const [form, setForm] = useState<AchievementInput>({
    employeeId,
    type: initialType,
    level: levelsForAchievementType(initialType)[0],
    title: "",
    acceptedDate: "",
    year: new Date().getFullYear(),
    organization: "",
    decisionNumber: "",
    role: "",
    notes: "",
  });
  const update = (key: keyof AchievementInput, value: string | number) =>
    setForm((current) => ({ ...current, [key]: value }));
  const addFiles = (list: FileList | null) => {
    if (list)
      setFiles((current) => [...current, ...Array.from(list)].slice(0, 10));
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const iso = parseVietnameseDate(acceptedDate);
    if (!iso) {
      setError("Ngày chấp nhận phải đúng định dạng dd/mm/yyyy.");
      return;
    }
    setSaving(true);
    try {
      const result = await api.createAchievement({
        ...form,
        title:
          form.type === "TASK_COMPLETION"
            ? levelLabels[form.level]
            : form.title,
        acceptedDate: iso,
        year: Number(iso.slice(0, 4)),
      });
      for (const file of files)
        await api.uploadAchievementFile(result.id, file);
      onSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể lưu thành tích.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      className="modal-backdrop nested-modal"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form className="modal achievement-modal" onSubmit={save}>
        <div className="modal-head">
          <div>
            <span className="eyebrow teal">THÀNH TÍCH HẰNG NĂM</span>
            <h2>Thêm thành tích</h2>
            <p>{employeeName}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X />
          </button>
        </div>
        {error && (
          <div className="form-error" role="alert">
            <AlertCircle size={18} />
            {error}
          </div>
        )}
        <div className="form-grid">
          <label>
            Loại thành tích
            <select
              value={form.type}
              onChange={(e) => {
                const type = e.target.value as AchievementType;
                setForm((current) => ({
                  ...current,
                  type,
                  level: levelsForAchievementType(type)[0],
                  title: type === "TASK_COMPLETION" ? levelLabels[levelsForAchievementType(type)[0]] : "",
                }));
              }}
            >
              {achievementTypes.map((type) => (
                <option key={type} value={type}>
                  {typeLabels[type]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {form.type === "TASK_COMPLETION" ? "Mức hoàn thành" : "Cấp / hạng"}
            <select
              value={form.level}
              onChange={(e) => update("level", e.target.value)}
            >
              {levelsForAchievementType(form.type).map((level) => (
                <option key={level} value={level}>
                  {levelLabels[level]}
                </option>
              ))}
            </select>
          </label>
          {form.type !== "TASK_COMPLETION" && (
            <label className="span-2">
              Tên đề tài / thành tích *
              <input
                required
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
              />
            </label>
          )}
          <label>
            {form.type === "TASK_COMPLETION" ? "Ngày đánh giá *" : "Ngày chấp nhận *"}
            <input
              required
              inputMode="numeric"
              value={acceptedDate}
              onChange={(e) => setAcceptedDate(e.target.value)}
              placeholder="dd/mm/yyyy"
            />
          </label>
          <label>
            Số quyết định
            <input
              value={form.decisionNumber}
              onChange={(e) => update("decisionNumber", e.target.value)}
            />
          </label>
          {form.type !== "TASK_COMPLETION" && (
            <>
              <label>
                Đơn vị thực hiện
                <input
                  value={form.organization}
                  onChange={(e) => update("organization", e.target.value)}
                />
              </label>
              <label>
                Vai trò
                <input
                  value={form.role}
                  onChange={(e) => update("role", e.target.value)}
                  placeholder="Chủ nhiệm, thành viên..."
                />
              </label>
            </>
          )}
          <label className="span-2">
            Ghi chú
            <textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              rows={3}
            />
          </label>
          <div
            className={`achievement-dropzone span-2 ${drag ? "dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              addFiles(e.dataTransfer.files);
            }}
          >
            <input
              ref={input}
              type="file"
              hidden
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(e) => addFiles(e.target.files)}
            />
            <UploadCloud />
            <div>
              <strong>Kéo thả minh chứng vào đây</strong>
              <span>PDF, JPG, PNG, WebP · tối đa 25 MB/tệp</span>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => input.current?.click()}
            >
              Chọn tệp
            </button>
          </div>
          {files.length > 0 && (
            <div className="selected-files span-2">
              {files.map((file, index) => (
                <span key={`${file.name}-${index}`}>
                  <FileCheck2 size={14} />
                  {file.name}
                  <button
                    type="button"
                    onClick={() =>
                      setFiles((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                    aria-label={`Bỏ tệp ${file.name}`}
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Hủy
          </button>
          <button className="primary-button" disabled={saving}>
            {saving && <RefreshCw className="spin" size={17} />}Lưu thành tích
          </button>
        </div>
      </form>
    </div>
  );
}

function VietnameseDatePicker({
  value,
  onChange,
  required = false,
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedIso = parseVietnameseDate(value);
  const selectedDate = selectedIso ? parseISO(selectedIso) : null;
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selectedDate ?? new Date()));
  useEffect(() => {
    if (selectedDate) setViewMonth(startOfMonth(selectedDate));
  }, [selectedIso]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const calendarStart = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const currentYear = new Date().getFullYear();
  return (
    <div className="vietnamese-date-picker" ref={containerRef}>
      <div className="date-picker-input">
        <input
          required={required}
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          pattern="\d{2}/\d{2}/\d{4}"
          placeholder="dd/mm/yyyy"
          value={value === "—" ? "" : value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          aria-label="Ngày sinh, định dạng ngày tháng năm"
          aria-expanded={open}
        />
        <button type="button" onClick={() => setOpen((current) => !current)} aria-label="Mở lịch chọn ngày">
          <CalendarDays size={17} />
        </button>
      </div>
      {open && (
        <div className="date-picker-popover" role="dialog" aria-label="Chọn ngày sinh">
          <div className="date-picker-head">
            <button type="button" onClick={() => setViewMonth((current) => subMonths(current, 1))} aria-label="Tháng trước">
              <ChevronLeft size={17} />
            </button>
            <select
              value={viewMonth.getMonth()}
              onChange={(event) => setViewMonth((current) => startOfMonth(setMonth(current, Number(event.target.value))))}
              aria-label="Chọn tháng"
            >
              {Array.from({ length: 12 }, (_, index) => <option key={index} value={index}>Tháng {index + 1}</option>)}
            </select>
            <select
              value={viewMonth.getFullYear()}
              onChange={(event) => setViewMonth((current) => startOfMonth(setYear(current, Number(event.target.value))))}
              aria-label="Chọn năm"
            >
              {Array.from({ length: currentYear - 1899 }, (_, index) => currentYear - index).map((calendarYear) => (
                <option key={calendarYear} value={calendarYear}>{calendarYear}</option>
              ))}
            </select>
            <button type="button" onClick={() => setViewMonth((current) => addMonths(current, 1))} aria-label="Tháng sau">
              <ChevronRight size={17} />
            </button>
          </div>
          <div className="date-picker-weekdays" aria-hidden="true">
            {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="date-picker-days">
            {days.map((day) => {
              const disabled = day > new Date();
              const selected = selectedDate ? isSameDay(day, selectedDate) : false;
              return (
                <button
                  type="button"
                  key={day.toISOString()}
                  disabled={disabled}
                  className={`${isSameMonth(day, viewMonth) ? "" : "outside"} ${selected ? "selected" : ""}`}
                  onClick={() => {
                    onChange(formatCalendarDate(day, "dd/MM/yyyy", { locale: vi }));
                    setOpen(false);
                  }}
                  aria-label={formatCalendarDate(day, "EEEE, dd/MM/yyyy", { locale: vi })}
                  aria-pressed={selected}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  required = false,
  allowClear = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
  required?: boolean;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const filtered = options
    .filter((option) => !value || normalize(option).includes(normalize(value)))
    .slice(0, 30);
  return (
    <div className="searchable-select">
      <div className="searchable-control">
        <Search size={16} />
        <input
          required={required}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          value={value}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          placeholder={placeholder}
        />
        {allowClear && value && (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChange("")}
            aria-label="Xóa đơn vị"
          >
            <X size={15} />
          </button>
        )}
      </div>
      {open && filtered.length > 0 && (
        <div className="searchable-options" role="listbox">
          {filtered.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option === value}
              key={option}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CandidatesPage({
  toast,
}: {
  toast: (t: Toast["type"], m: string) => void;
}) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [proposals, setProposals] = useState<Array<Record<string, unknown>>>(
    [],
  );
  const [ruleModal, setRuleModal] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<Record<string, unknown> | null>(null);
  const [refreshingProposal, setRefreshingProposal] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    api
      .candidates(year)
      .then((x) => setProposals(x.proposals))
      .catch((error) =>
        toast(
          "error",
          error instanceof Error ? error.message : "Không thể tải đề xuất.",
        ),
      )
      .finally(() => setLoading(false));
  };
  useEffect(load, [year]);
  const refreshProposal = async (proposal: Record<string, unknown>) => {
    const id = String(proposal.id);
    const name = String(proposal.name);
    if (!window.confirm(`Cập nhật lại danh sách nhân viên của “${name}” theo dữ liệu hiện tại?`)) return;
    setRefreshingProposal(id);
    try {
      const result = await api.refreshRewardProposal(id);
      toast("success", `Đã cập nhật đề xuất: ${result.employees} nhân viên đạt yêu cầu.`);
      load();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Không thể cập nhật đề xuất.");
    } finally {
      setRefreshingProposal(null);
    }
  };
  const years = Array.from(
    { length: 8 },
    (_, index) => new Date().getFullYear() - index,
  );
  return (
    <div className="page">
      <PageTitle
        eyebrow="DANH SÁCH ĐỀ XUẤT"
        title="Đề xuất khen thưởng"
        description="Theo dõi các đề xuất đã tạo; nội dung khen thưởng được chọn khi tạo mới."
        action={
          <div className="proposal-page-actions">
            <label>
              Năm xét
              <select
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
              >
                {years.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <button
              className="primary-button"
              onClick={() => setRuleModal(true)}
            >
              <Plus size={18} />
              Tạo đề xuất
            </button>
          </div>
        }
      />
      <section className="panel proposal-table-panel">
        <div className="table-summary">
          <span>
            Có <strong>{proposals.length}</strong> đề xuất trong năm {year}
          </span>
        </div>
        <div className="table-scroll">
          <table className="proposal-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Tên đề xuất</th>
                <th>Loại khen thưởng</th>
                <th>Cấp / hạng</th>
                <th>Nhân viên đạt</th>
                <th className="action-column">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="proposal-table-empty">
                    Đang tải danh sách đề xuất...
                  </td>
                </tr>
              ) : proposals.length ? (
                proposals.map((proposal, index) => {
                  const employees =
                    (proposal.employees as
                      | Array<Record<string, unknown>>
                      | undefined) ?? [];
                  return (
                    <tr
                      key={String(proposal.id)}
                      className="clickable-row"
                      tabIndex={0}
                      onClick={() => setSelectedProposal(proposal)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ")
                          setSelectedProposal(proposal);
                      }}
                    >
                      <td className="mono">
                        {String(index + 1).padStart(2, "0")}
                      </td>
                      <td>
                        <strong className="table-main">
                          {String(proposal.name)}
                        </strong>
                      </td>
                      <td>
                        {typeLabels[
                          proposal.rewardType as AchievementType
                        ] ?? String(proposal.rewardType)}
                      </td>
                      <td>
                        {levelLabels[
                          proposal.rewardLevel as AchievementLevel
                        ] ?? String(proposal.rewardLevel)}
                      </td>
                      <td>
                        <span className="count-pill">
                          {employees.length} nhân viên
                        </span>
                      </td>
                      <td className="user-action-cell">
                        <div className="proposal-row-actions">
                          <button
                            className="row-action"
                            disabled={refreshingProposal === String(proposal.id)}
                            onClick={(event) => {
                              event.stopPropagation();
                              void refreshProposal(proposal);
                            }}
                            aria-label={`Cập nhật đề xuất ${proposal.name} theo dữ liệu hiện tại`}
                            title="Cập nhật danh sách nhân viên"
                          >
                            <RefreshCw className={refreshingProposal === String(proposal.id) ? "spin" : undefined} size={17} />
                          </button>
                          <button
                            className="row-action"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedProposal(proposal);
                            }}
                            aria-label={`Xem đề xuất ${proposal.name}`}
                            title="Xem đề xuất"
                          >
                            <Pencil size={17} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="proposal-table-empty">
                    Chưa có đề xuất. Chọn “Tạo đề xuất” để thêm mới.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {ruleModal && (
        <RewardRuleModal
          year={year}
          onClose={() => setRuleModal(false)}
          onSaved={() => {
            setRuleModal(false);
            toast("success", "Đã tạo đề xuất khen thưởng.");
            load();
          }}
        />
      )}
      {selectedProposal && (
        <ProposalDetailModal
          proposal={selectedProposal}
          year={year}
          onClose={() => setSelectedProposal(null)}
          toast={toast}
        />
      )}
    </div>
  );
}

function ProposalDetailModal({
  proposal,
  year,
  onClose,
  toast,
}: {
  proposal: Record<string, unknown>;
  year: number;
  onClose: () => void;
  toast: (t: Toast["type"], m: string) => void;
}) {
  const [exporting, setExporting] = useState(false);
  const employees =
    (proposal.employees as Array<Record<string, unknown>> | undefined) ?? [];
  const rewardType = proposal.rewardType as AchievementType;
  const rewardLevel = proposal.rewardLevel as AchievementLevel;
  const proposalName = String(proposal.name ?? "Đề xuất khen thưởng");
  const exportExcel = async () => {
    setExporting(true);
    try {
      const header = (value: string) => ({
        value,
        fontWeight: "bold" as const,
        color: "#FFFFFF",
        backgroundColor: "#007BFF",
        align: "center" as const,
      });
      const rows: SheetData = [
        [
          {
            value: proposalName,
            fontWeight: "bold",
            fontSize: 16,
            columnSpan: 5,
            align: "center",
          },
          null,
          null,
          null,
          null,
        ],
        ["Năm xét", year, "Khen thưởng", typeLabels[rewardType] ?? String(proposal.rewardType), levelLabels[rewardLevel] ?? String(proposal.rewardLevel)],
        [],
        [header("STT"), header("CCCD"), header("Họ và tên"), header("Khoa / phòng"), header("Kết quả")],
        ...employees.map((employee, index) => [
          index + 1,
          citizenIdForExport(employee.citizenId),
          String(employee.fullName ?? ""),
          String(employee.unit ?? ""),
          "Đạt yêu cầu",
        ]),
      ];
      const safeName = normalize(proposalName)
        .replaceAll(/[^a-z0-9]+/g, "-")
        .replaceAll(/^-|-$/g, "") || "de-xuat-khen-thuong";
      await writeXlsxFile(rows, {
        columns: [
          { width: 8 },
          { width: 18 },
          { width: 30 },
          { width: 34 },
          { width: 18 },
        ],
        sheet: "Danh sách đạt",
      }).toFile(`${safeName}-${year}.xlsx`);
      toast("success", `Đã xuất ${employees.length} nhân viên ra Excel.`);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Không thể xuất Excel.");
    } finally {
      setExporting(false);
    }
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="modal proposal-detail-modal" aria-label={`Chi tiết ${proposalName}`}>
        <div className="modal-head proposal-detail-head">
          <div>
            <span className="eyebrow teal">ĐỀ XUẤT NĂM {year}</span>
            <h2>{proposalName}</h2>
            <p>
              {typeLabels[rewardType] ?? String(proposal.rewardType)} · {levelLabels[rewardLevel] ?? String(proposal.rewardLevel)}
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng">
            <X />
          </button>
        </div>
        <div className="proposal-detail-toolbar">
          <div>
            <strong>{employees.length}</strong>
            <span>nhân viên đạt yêu cầu · chốt ngày {formatDate(proposal.snapshotUpdatedAt)}</span>
          </div>
          <button
            className="primary-button"
            disabled={exporting}
            onClick={() => void exportExcel()}
          >
            {exporting ? <RefreshCw className="spin" size={17} /> : <Download size={17} />}
            Xuất Excel
          </button>
        </div>
        <div className="table-scroll proposal-employee-table">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Nhân viên</th>
                <th>CCCD</th>
                <th>Khoa / phòng</th>
                <th>Kết quả</th>
              </tr>
            </thead>
            <tbody>
              {employees.length ? (
                employees.map((employee, index) => (
                  <tr key={String(employee.citizenId)}>
                    <td className="mono">{String(index + 1).padStart(2, "0")}</td>
                    <td>
                      <div className="person-cell">
                        <div className="mini-avatar">{initials(String(employee.fullName))}</div>
                        <strong>{String(employee.fullName)}</strong>
                      </div>
                    </td>
                    <td className="mono">{String(employee.citizenId)}</td>
                    <td>{String(employee.unit || "—")}</td>
                    <td><span className="proposal-qualified">Đạt yêu cầu</span></td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="proposal-table-empty">
                    Chưa có nhân viên đạt điều kiện trong năm xét.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function RewardRuleModal({
  year,
  onClose,
  onSaved,
}: {
  year: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [rewardType, setRewardType] = useState<RewardType | "">("");
  const [rewardLevel, setRewardLevel] = useState<AchievementLevel | "">("");
  const [priority, setPriority] = useState(100);
  const [exactLevel, setExactLevel] = useState(false);
  type Condition = {
    type: AchievementType | "";
    level: AchievementLevel | "";
    quantity: number;
    withinYears: number;
  };
  type Group = { operator: "AND" | "OR"; conditions: Condition[] };
  const makeCondition = (): Condition => ({
    type: "",
    level: "",
    quantity: 1,
    withinYears: 0,
  });
  const [operator, setOperator] = useState<"AND" | "OR">("AND");
  const [groups, setGroups] = useState<Group[]>([
    {
      operator: "AND",
      conditions: [makeCondition()],
    },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const updateCondition = (
    groupIndex: number,
    index: number,
    key: keyof Condition,
    value: string | number,
  ) =>
    setGroups((current) =>
      current.map((group, g) =>
        g === groupIndex
          ? {
              ...group,
              conditions: group.conditions.map((condition, i) =>
                i === index
                  ? key === "type"
                    ? {
                        ...condition,
                        type: value as AchievementType,
                        level: "",
                      }
                    : { ...condition, [key]: value }
                  : condition,
              ),
            }
          : group,
      ),
    );
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!rewardType || !rewardLevel) {
      setError("Chọn loại và cấp / hạng khen thưởng.");
      return;
    }
    if (
      !groups.length ||
      groups.some(
        (group) =>
          !group.conditions.length ||
          group.conditions.some((condition) => !condition.type || !condition.level),
      )
    ) {
      setError("Chọn đầy đủ loại và cấp / hạng cho từng điều kiện.");
      return;
    }
    setSaving(true);
    try {
      await api.createRewardRule({
        name,
        rewardType,
        rewardLevel,
        year,
        conditions: { operator, exactLevel, groups },
        priority,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tạo đề xuất.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form className="modal rule-modal" onSubmit={save}>
        <div className="modal-head">
          <div>
            <span className="eyebrow teal">ĐỀ XUẤT MỚI</span>
            <h2>Tạo đề xuất khen thưởng</h2>
            <p>
              Chọn nội dung khen thưởng, sau đó thiết lập điều kiện xét.
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X />
          </button>
        </div>
        {error && (
          <div className="form-error" role="alert">
            <AlertCircle size={18} />
            {error}
          </div>
        )}
        <div className="form-grid">
          <label className="span-2">
            Tên đề xuất *
            <input
              autoFocus
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Loại khen thưởng
            <select
              required
              value={rewardType}
              onChange={(event) => {
                setRewardType(event.target.value as RewardType);
                setRewardLevel("");
              }}
            >
              <option value="" disabled>
                Chọn loại khen thưởng
              </option>
              {rewardTypes.map((type) => (
                <option key={type} value={type}>
                  {typeLabels[type]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cấp / hạng khen thưởng
            <select
              required
              disabled={!rewardType}
              value={rewardLevel}
              onChange={(event) =>
                setRewardLevel(event.target.value as AchievementLevel)
              }
            >
              <option value="" disabled>
                Chọn cấp / hạng
              </option>
              {(rewardType ? levelsForAchievementType(rewardType) : []).map((level) => (
                <option key={level} value={level}>
                  {levelLabels[level]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Độ ưu tiên
            <input
              type="number"
              min="0"
              max="9999"
              value={priority}
              onChange={(event) => setPriority(Number(event.target.value))}
            />
          </label>
          <label className={`exact-level-option ${exactLevel ? "checked" : ""}`}>
            <input
              type="checkbox"
              checked={exactLevel}
              onChange={(event) => setExactLevel(event.target.checked)}
            />
            <span>
              <strong>Lấy chính xác cấp / hạng</strong>
              <small>{exactLevel ? "Chỉ tính đúng cấp / hạng đã chọn" : "Mặc định tính cả cấp / hạng cao hơn"}</small>
            </span>
          </label>
          {groups.length > 1 && (
            <label className="span-2">
              Quan hệ giữa các nhóm
              <select
                value={operator}
                onChange={(event) =>
                  setOperator(event.target.value as "AND" | "OR")
                }
              >
                <option value="AND">VÀ — phải đạt mọi nhóm</option>
                <option value="OR">HOẶC — chỉ cần đạt một nhóm</option>
              </select>
            </label>
          )}
          <div className="rule-groups span-2">
            {groups.map((group, groupIndex) => (
              <fieldset className="condition-fieldset" key={groupIndex}>
                <legend>Nhóm {groupIndex + 1}</legend>
                <div className="group-toolbar">
                  <label>
                    Điều kiện trong nhóm
                    <select
                      value={group.operator}
                      onChange={(event) =>
                        setGroups((current) =>
                          current.map((item, index) =>
                            index === groupIndex
                              ? {
                                  ...item,
                                  operator: event.target.value as "AND" | "OR",
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="AND">VÀ</option>
                      <option value="OR">HOẶC</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="text-button danger"
                    disabled={groups.length === 1}
                    onClick={() =>
                      setGroups((current) =>
                        current.filter((_, index) => index !== groupIndex),
                      )
                    }
                  >
                    Xóa nhóm
                  </button>
                </div>
                {group.conditions.map((condition, index) => (
                  <div className="condition-row" key={index}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <label>
                      Loại
                      <select
                        required
                        aria-label={`Loại thành tích nhóm ${groupIndex + 1} điều kiện ${index + 1}`}
                        value={condition.type}
                        onChange={(event) =>
                          updateCondition(
                            groupIndex,
                            index,
                            "type",
                            event.target.value,
                          )
                        }
                      >
                        <option value="" disabled>
                          Chọn loại thành tích
                        </option>
                        {achievementTypes.map((type) => (
                          <option key={type} value={type}>
                            {typeLabels[type]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Cấp / hạng
                      <select
                        required
                        disabled={!condition.type}
                        value={condition.level}
                        onChange={(event) =>
                          updateCondition(
                            groupIndex,
                            index,
                            "level",
                            event.target.value,
                          )
                        }
                      >
                        <option value="" disabled>
                          Chọn cấp / hạng
                        </option>
                        {(condition.type
                          ? levelsForAchievementType(condition.type)
                          : []
                        ).map((level) => (
                          <option key={level} value={level}>
                            {levelLabels[level]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Số lượng
                      <input
                        type="number"
                        min="1"
                        value={condition.quantity}
                        onChange={(event) =>
                          updateCondition(
                            groupIndex,
                            index,
                            "quantity",
                            Math.max(1, Number(event.target.value)),
                          )
                        }
                      />
                    </label>
                    <label>
                      Trong N năm
                      <input
                        type="number"
                        min="0"
                        value={condition.withinYears}
                        onChange={(event) =>
                          updateCondition(
                            groupIndex,
                            index,
                            "withinYears",
                            Math.max(0, Number(event.target.value)),
                          )
                        }
                      />
                      <small>0 = không giới hạn</small>
                    </label>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Xóa điều kiện ${index + 1}`}
                      disabled={group.conditions.length === 1}
                      onClick={() =>
                        setGroups((current) =>
                          current.map((item, g) =>
                            g === groupIndex
                              ? {
                                  ...item,
                                  conditions: item.conditions.filter(
                                    (_, i) => i !== index,
                                  ),
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      <X size={17} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="text-button add-condition"
                  onClick={() =>
                    setGroups((current) =>
                      current.map((item, index) =>
                        index === groupIndex
                          ? {
                              ...item,
                              conditions: [...item.conditions, makeCondition()],
                            }
                          : item,
                      ),
                    )
                  }
                >
                  <Plus size={16} />
                  Thêm điều kiện
                </button>
              </fieldset>
            ))}
          </div>
          <button
            type="button"
            className="secondary-button span-2"
            onClick={() =>
              setGroups((current) => [
                ...current,
                { operator: "AND", conditions: [makeCondition()] },
              ])
            }
          >
            <Plus size={16} />
            Thêm nhóm điều kiện
          </button>
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Hủy
          </button>
          <button className="primary-button" disabled={saving}>
            {saving && <RefreshCw className="spin" size={17} />}Lưu đề xuất
          </button>
        </div>
      </form>
    </div>
  );
}

function ImportPage({
  toast,
}: {
  toast: (t: Toast["type"], m: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"employees" | "achievements">("employees");
  const [file, setFile] = useState<File | null>(null);
  const [employeeRows, setEmployeeRows] = useState<EmployeeInput[]>([]);
  const [achievementRows, setAchievementRows] = useState<
    AchievementImportInput[]
  >([]);
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const rowCount =
    mode === "employees" ? employeeRows.length : achievementRows.length;
  const importRows = mode === "employees" ? employeeRows : achievementRows;
  const invalidCitizenIdCount = importRows.filter((row) => !/^\d{12}$/.test(row.citizenId)).length;
  const reset = () => {
    setFile(null);
    setEmployeeRows([]);
    setAchievementRows([]);
    if (input.current) input.current.value = "";
  };
  const changeMode = (next: "employees" | "achievements") => {
    setMode(next);
    reset();
  };
  const parse = async (f: File) => {
    setFile(f);
    const sheet = await readSheet(f);
    const required =
      mode === "employees"
        ? ["ho ten", "ho va ten"]
        : ["loai thanh tich", "loai"];
    const headerIndex = sheet.findIndex((row) => {
      const values = row.map((value) => normalize(String(value ?? "")));
      return (
        values.includes("cccd") &&
        values.some((value) => required.includes(value))
      );
    });
    if (headerIndex < 0) {
      reset();
      toast(
        "error",
        `Không tìm thấy dòng tiêu đề hợp lệ cho ${mode === "employees" ? "nhân viên" : "thành tích"}.`,
      );
      return;
    }
    const headers = (sheet[headerIndex] ?? []).map((value) =>
      normalize(String(value ?? "")),
    );
    const column = (names: string[]) =>
      headers.findIndex((header) => names.includes(header));
    const value = (row: unknown[], names: string[]) => {
      const index = column(names);
      return index >= 0 ? String(row[index] ?? "").trim() : "";
    };
    const source = sheet
      .slice(headerIndex + 1)
      .filter((row) => row.some((cell) => String(cell ?? "").trim()));
    if (mode === "employees") {
      setEmployeeRows(
        source.map((row) => {
          const gender = normalize(value(row, ["gioi tinh"]));
          const status = normalize(value(row, ["trang thai"]));
          return {
            citizenId: excelCitizenId(row[column(["cccd", "so cccd", "can cuoc cong dan"])]),
            fullName: value(row, ["ho ten", "ho va ten"]),
            gender: gender === "nu" ? "NU" : gender === "khac" ? "KHAC" : "NAM",
            dateOfBirth: excelDate(
              row[column(["ngay sinh", "ngay thang nam sinh"])],
            ),
            education: value(row, ["trinh do"]),
            unit: value(row, ["don vi"]),
            position: value(row, ["chuc vu"]),
            professionalTitle: value(row, [
              "chuc danh nghe nghiep",
              "chuc danh",
            ]),
            active: !status.includes("ngung"),
          };
        }),
      );
      setAchievementRows([]);
    } else {
      setAchievementRows(
        source.map((row) => {
          const acceptedDate = excelDate(
            row[column(["ngay chap nhan", "ngay ghi nhan", "ngay"])],
          );
          return {
            citizenId: excelCitizenId(row[column(["cccd", "so cccd", "can cuoc cong dan"])]),
            type: parseAchievementType(value(row, ["loai thanh tich", "loai"])),
            level: parseAchievementLevel(
              value(row, ["cap / hang", "cap/hang", "cap hang", "cap", "hang"]),
            ),
            title: value(row, [
              "ten thanh tich",
              "ten de tai thanh tich",
              "ten",
            ]),
            acceptedDate,
            year: Number(acceptedDate.slice(0, 4)),
            organization: value(row, ["don vi thuc hien", "don vi"]),
            decisionNumber: value(row, ["so quyet dinh"]),
            role: value(row, ["vai tro"]),
            notes: value(row, ["ghi chu"]),
          };
        }),
      );
      setEmployeeRows([]);
    }
  };
  const upload = async () => {
    if (!rowCount || invalidCitizenIdCount) {
      if (invalidCitizenIdCount) toast("error", `${invalidCitizenIdCount} dòng có CCCD không đúng 12 chữ số.`);
      return;
    }
    setLoading(true);
    try {
      if (mode === "employees") {
        const result = await api.importEmployees(
          employeeRows,
          overwriteExisting,
        );
        toast(
          "success",
          `Đã thêm ${result.inserted}, cập nhật ${result.updated}, bỏ qua ${result.skipped}, lỗi ${result.rejected}.`,
        );
      } else {
        const result = await api.importAchievements(achievementRows);
        toast(
          "success",
          `Đã nhập ${result.accepted} thành tích, lỗi ${result.rejected}.`,
        );
      }
      reset();
    } catch (error) {
      toast(
        "error",
        error instanceof Error ? error.message : "Không thể nhập dữ liệu.",
      );
    } finally {
      setLoading(false);
    }
  };
  const template =
    mode === "employees"
      ? "mau-nhap-nhan-vien.xlsx"
      : "mau-nhap-thanh-tich.xlsx";
  return (
    <div className="page">
      <PageTitle
        eyebrow="NHẬP DỮ LIỆU HÀNG LOẠT"
        title="Nhập dữ liệu từ Excel"
        description="Chọn loại dữ liệu cần nhập. Thành tích luôn đối chiếu nhân viên bằng CCCD."
        action={
          <a className="ghost-button" href={`./${template}`} download>
            <Download size={17} />
            Tải mẫu {mode === "employees" ? "nhân viên" : "thành tích"}
          </a>
        }
      />
      <div className="import-mode-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={mode === "employees"}
          className={mode === "employees" ? "active" : ""}
          onClick={() => changeMode("employees")}
        >
          <Users />
          Nhập nhân viên<span>Thêm mới hoặc cập nhật hồ sơ</span>
        </button>
        <button
          role="tab"
          aria-selected={mode === "achievements"}
          className={mode === "achievements" ? "active" : ""}
          onClick={() => changeMode("achievements")}
        >
          <Award />
          Nhập thành tích<span>Ghép nhân viên duy nhất bằng CCCD</span>
        </button>
      </div>
      <div className="import-steps">
        <div className="done">
          <span>1</span>
          <div>
            <strong>Chọn tệp</strong>
            <small>.xlsx hoặc .xls</small>
          </div>
        </div>
        <i />
        <div className={rowCount ? "done" : ""}>
          <span>2</span>
          <div>
            <strong>Kiểm tra dữ liệu</strong>
            <small>Ánh xạ và xác thực</small>
          </div>
        </div>
        <i />
        <div>
          <span>3</span>
          <div>
            <strong>Hoàn tất</strong>
            <small>Cập nhật vào CSDL</small>
          </div>
        </div>
      </div>
      {!file ? (
        <div
          className={`dropzone ${drag ? "dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDrag(false);
            const selected = event.dataTransfer.files[0];
            if (selected) void parse(selected);
          }}
        >
          <input
            ref={input}
            type="file"
            accept=".xlsx,.xls"
            hidden
            onChange={(event) => {
              const selected = event.target.files?.[0];
              if (selected) void parse(selected);
            }}
          />
          <div className="upload-icon">
            <UploadCloud />
          </div>
          <h3>
            Kéo và thả Excel {mode === "employees" ? "nhân viên" : "thành tích"}{" "}
            vào đây
          </h3>
          <p>hoặc chọn tệp từ máy tính · tối đa 10 MB</p>
          <button
            className="secondary-button"
            onClick={() => input.current?.click()}
          >
            Chọn tệp Excel
          </button>
          <div className="drop-hint">
            <FileCheck2 size={16} />
            {mode === "employees"
              ? "Bắt buộc: CCCD đúng 12 số, Họ tên, Giới tính, Ngày sinh, Đơn vị"
              : "Bắt buộc: CCCD đúng 12 số, Loại, Cấp/hạng, Tên thành tích, Ngày chấp nhận"}
          </div>
        </div>
      ) : (
        <section className="panel preview-panel">
          <div className="file-summary">
            <div className="excel-icon">
              <FileSpreadsheet />
            </div>
            <div>
              <strong>{file.name}</strong>
              <span>
                {(file.size / 1024).toFixed(1)} KB · {rowCount} dòng dữ liệu
              </span>
            </div>
            <span className={`valid-badge ${invalidCitizenIdCount ? "invalid" : ""}`}>
              {invalidCitizenIdCount ? <AlertCircle /> : <Check />}
              {invalidCitizenIdCount ? `${invalidCitizenIdCount} CCCD không hợp lệ` : "Sẵn sàng nhập"}
            </span>
            <button className="icon-button" onClick={reset}>
              <X />
            </button>
          </div>
          {mode === "employees" && (
            <label
              className={`import-overwrite-option ${overwriteExisting ? "checked" : ""}`}
            >
              <input
                type="checkbox"
                checked={overwriteExisting}
                onChange={(event) => setOverwriteExisting(event.target.checked)}
              />
              <span>
                <strong>Ghi đè hồ sơ trùng CCCD</strong>
                <small>
                  {overwriteExisting
                    ? "Hồ sơ đã tồn tại sẽ được cập nhật bằng dữ liệu trong Excel."
                    : "Đang tắt: hồ sơ đã tồn tại sẽ được giữ nguyên và bỏ qua."}
                </small>
              </span>
            </label>
          )}
          {mode === "achievements" && (
            <div className="achievement-match-note">
              <ShieldCheck />
              <div>
                <strong>Đối chiếu chính xác bằng CCCD</strong>
                <span>
                  Dòng có CCCD không tồn tại trong hồ sơ nhân viên sẽ bị từ
                  chối.
                </span>
              </div>
            </div>
          )}
          <div className="table-scroll">
            {mode === "employees" ? (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>CCCD</th>
                    <th>Họ và tên</th>
                    <th>Giới tính</th>
                    <th>Ngày sinh</th>
                    <th>Đơn vị</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeRows.slice(0, 8).map((row, index) => (
                    <tr key={index} className={!/^\d{12}$/.test(row.citizenId) ? "invalid-import-row" : ""}>
                      <td>{index + 1}</td>
                      <td className="mono">{row.citizenId}</td>
                      <td>
                        <strong>{row.fullName}</strong>
                      </td>
                      <td>{genderLabel(row.gender)}</td>
                      <td>{formatDate(row.dateOfBirth)}</td>
                      <td>{row.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>CCCD</th>
                    <th>Loại</th>
                    <th>Tên thành tích</th>
                    <th>Cấp / hạng</th>
                    <th>Ngày</th>
                  </tr>
                </thead>
                <tbody>
                  {achievementRows.slice(0, 8).map((row, index) => (
                    <tr key={index} className={!/^\d{12}$/.test(row.citizenId) ? "invalid-import-row" : ""}>
                      <td>{index + 1}</td>
                      <td className="mono">{row.citizenId}</td>
                      <td>{typeLabels[row.type]}</td>
                      <td>
                        <strong>{row.title}</strong>
                      </td>
                      <td>{levelLabels[row.level]}</td>
                      <td>{formatDate(row.acceptedDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="import-actions">
            <span>
              {mode === "employees"
                ? overwriteExisting
                  ? "Thêm mới và cập nhật hồ sơ trùng CCCD."
                  : "Chỉ thêm nhân viên mới, bỏ qua CCCD đã có."
                : "Mỗi thành tích được ghép vào hồ sơ theo CCCD."}
            </span>
            <button
              className="primary-button"
              onClick={() => void upload()}
              disabled={loading || !rowCount || Boolean(invalidCitizenIdCount)}
            >
              {loading ? (
                <RefreshCw className="spin" size={17} />
              ) : (
                <UploadCloud size={17} />
              )}
              Nhập {rowCount} {mode === "employees" ? "hồ sơ" : "thành tích"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function UsersPage({
  user,
  toast,
  onCurrentUserUpdated,
}: {
  user: SessionUser;
  toast: (t: Toast["type"], m: string) => void;
  onCurrentUserUpdated: (user: UserRecord) => void;
}) {
  const emptyCounts: UserCounts = {
    ADMIN: 0,
    HR: 0,
    REVIEWER: 0,
    VIEWER: 0,
    total: 0,
    active: 0,
  };
  const [items, setItems] = useState<UserRecord[]>([]);
  const [counts, setCounts] = useState<UserCounts>(emptyCounts);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<UserRecord | "new" | null>(null);
  const load = () => {
    setLoading(true);
    api
      .users()
      .then((result) => {
        setItems(result.items);
        setCounts(result.counts);
      })
      .catch((error) =>
        toast(
          "error",
          error instanceof Error ? error.message : "Không thể tải tài khoản.",
        ),
      )
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  const roleCards: Array<{
    role: Role;
    tone: string;
    icon: LucideIcon;
  }> = [
    {
      role: "ADMIN",
      tone: "navy",
      icon: ShieldCheck,
    },
    {
      role: "HR",
      tone: "teal",
      icon: Users,
    },
    {
      role: "REVIEWER",
      tone: "violet",
      icon: FileCheck2,
    },
    {
      role: "VIEWER",
      tone: "gray",
      icon: UserRound,
    },
  ];
  return (
    <div className="page">
      <PageTitle
        eyebrow="QUẢN TRỊ HỆ THỐNG"
        title="Người dùng & phân quyền"
        description="Số liệu lấy trực tiếp từ tài khoản trên D1."
        action={
          <button className="primary-button" onClick={() => setEditing("new")}>
            <Plus size={18} />
            Thêm người dùng
          </button>
        }
      />
      <div className="role-grid">
        {roleCards.map((card) => {
          const Icon = card.icon;
          return (
            <div className="role-card" key={card.role}>
              <div className={`role-symbol ${card.tone}`}>
                <Icon aria-hidden="true" />
              </div>
              <span>{roleLabel(card.role)}</span>
              <strong>{counts[card.role]}</strong>
            </div>
          );
        })}
      </div>
      <section className="panel user-panel">
        <PanelHeader
          title="Tài khoản hệ thống"
          subtitle={`${counts.active}/${counts.total} tài khoản đang hoạt động`}
        />
        <div className="table-scroll user-table-scroll">
          <table className="user-table">
            <thead>
              <tr>
                <th>Người dùng</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th>Ngày tạo</th>
                <th aria-label="Thao tác" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="user-table-empty" colSpan={5}>
                    Đang tải tài khoản...
                  </td>
                </tr>
              ) : items.length ? (
                items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="person-cell user-person-cell">
                        <div className="avatar">{initials(item.displayName)}</div>
                        <div>
                          <strong>{item.displayName}</strong>
                          <span>
                            @{item.username}
                            {item.id === user.id ? " · Bạn" : ""}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`role-pill role-${item.role.toLowerCase()}`}>
                        {roleLabel(item.role)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={item.active ? "status-active" : "status-inactive"}
                      >
                        <i />
                        {item.active ? "Hoạt động" : "Đã khóa"}
                      </span>
                    </td>
                    <td className="user-created-at">{formatDate(item.createdAt)}</td>
                    <td className="user-action-cell">
                      <button
                        className="row-action"
                        onClick={() => setEditing(item)}
                        aria-label={`Sửa tài khoản ${item.displayName}`}
                      >
                        <ChevronRight />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="user-table-empty" colSpan={5}>
                    Chưa có tài khoản.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {editing && (
        <UserModal
          current={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setEditing(null);
            toast(
              "success",
              editing === "new"
                ? "Đã thêm người dùng."
                : "Đã cập nhật người dùng.",
            );
            if (updated) onCurrentUserUpdated(updated);
            load();
          }}
        />
      )}
    </div>
  );
}

function UserModal({
  current,
  onClose,
  onSaved,
}: {
  current?: UserRecord;
  onClose: () => void;
  onSaved: (updated?: UserRecord) => void;
}) {
  const [username, setUsername] = useState(current?.username ?? "");
  const [displayName, setDisplayName] = useState(current?.displayName ?? "");
  const [role, setRole] = useState<Role>(current?.role ?? "VIEWER");
  const [active, setActive] = useState(current?.active ?? true);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!current && password.length < 10) {
      setError("Mật khẩu phải có ít nhất 10 ký tự.");
      return;
    }
    if (current && password && password.length < 10) {
      setError("Mật khẩu mới phải có ít nhất 10 ký tự.");
      return;
    }
    setSaving(true);
    try {
      if (current) {
        await api.updateUser(current.id, {
          displayName,
          role,
          active,
          ...(password ? { password } : {}),
        });
        onSaved({ ...current, displayName: displayName.trim(), role, active });
      } else {
        await api.createUser({ username, displayName, role, password });
        onSaved();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu tài khoản.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form className="modal user-modal" onSubmit={save}>
        <div className="modal-head">
          <div>
            <span className="eyebrow teal">TÀI KHOẢN & PHÂN QUYỀN</span>
            <h2>{current ? "Sửa người dùng" : "Thêm người dùng"}</h2>
            <p>
              {current
                ? "Tên đăng nhập được giữ cố định để bảo toàn lịch sử."
                : "Tạo tài khoản và cấp đúng vai trò nghiệp vụ."}
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X />
          </button>
        </div>
        {error && (
          <div className="form-error" role="alert">
            <AlertCircle size={18} />
            {error}
          </div>
        )}
        <div className="form-grid">
          <label>
            Tên đăng nhập *
            <input
              required
              disabled={Boolean(current)}
              value={username}
              onChange={(event) => setUsername(event.target.value.trim())}
              autoComplete="username"
            />
          </label>
          <label>
            Họ và tên *
            <input
              required
              minLength={2}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <label>
            Vai trò
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
            >
              {roles.map((value) => (
                <option key={value} value={value}>
                  {roleLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {current ? "Mật khẩu mới" : "Mật khẩu *"}
            <input
              type="password"
              required={!current}
              minLength={10}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              placeholder={
                current ? "Bỏ trống nếu không đổi" : "Ít nhất 10 ký tự"
              }
            />
          </label>
          <label className="status-control span-2">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            <span>
              <strong>Tài khoản hoạt động</strong>
              <small>Tắt để khóa đăng nhập và thu hồi phiên hiện có.</small>
            </span>
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Hủy
          </button>
          <button className="primary-button" disabled={saving}>
            {saving && <RefreshCw className="spin" size={17} />}Lưu tài khoản
          </button>
        </div>
      </form>
    </div>
  );
}

function SettingsPage() {
  const [version, setVersion] = useState("0.1.0");
  const [status, setStatus] = useState("");
  useEffect(() => {
    void window.desktop?.getVersion().then(setVersion);
    return window.desktop?.onUpdateStatus((x) => setStatus(x.status));
  }, []);
  return (
    <div className="page">
      <PageTitle
        eyebrow="CẤU HÌNH"
        title="Thiết lập hệ thống"
        description="Quản lý kết nối, cập nhật phần mềm và chính sách dữ liệu."
      />
      <div className="settings-grid">
        <section className="panel setting-card">
          <div className="setting-icon">
            <RefreshCw />
          </div>
          <div>
            <h3>Cập nhật ứng dụng</h3>
            <p>
              Phiên bản hiện tại <strong>v{version}</strong>. Bản phát hành được
              kiểm tra an toàn qua GitHub Releases.
            </p>
            {status && (
              <span className="update-status">Trạng thái: {status}</span>
            )}
          </div>
          <button
            className="secondary-button"
            onClick={() => void window.desktop?.checkForUpdates()}
          >
            Kiểm tra cập nhật
          </button>
        </section>
        <section className="panel setting-card">
          <div className="setting-icon teal">
            <ShieldCheck />
          </div>
          <div>
            <h3>Lưu trữ & bảo mật</h3>
            <p>
              Dữ liệu nghiệp vụ lưu tại Cloudflare D1; minh chứng lưu riêng
              trong R2.
            </p>
          </div>
          <span className="valid-badge">
            <Check />
            Kết nối thiết kế sẵn
          </span>
        </section>
      </div>
    </div>
  );
}

function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <span className="eyebrow teal">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
function PanelHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel-header">
      <div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
function HospitalLogo() {
  return (
    <img
      className="hospital-logo"
      src={hospitalLogo}
      width="148"
      height="148"
      alt="Logo Bệnh viện Thống Nhất"
    />
  );
}
function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
}
function roleLabel(role: string) {
  return (
    (
      {
        ADMIN: "Quản trị viên",
        HR: "Tổ chức cán bộ",
        REVIEWER: "Hội đồng xét duyệt",
        VIEWER: "Chỉ xem",
      } as Record<string, string>
    )[role] ?? role
  );
}
function genderLabel(gender: string) {
  return (
    ({ NAM: "Nam", NU: "Nữ", KHAC: "Khác" } as Record<string, string>)[
      gender
    ] ?? gender
  );
}
function formatDate(value: unknown) {
  const text = String(value ?? "").slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text || "—";
}
function parseVietnameseDate(value: string) {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]),
    month = Number(match[2]),
    year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}
function pageNumbers(total: number, current: number) {
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1);
  const start = Math.max(1, Math.min(current - 2, total - 4));
  return Array.from({ length: 5 }, (_, index) => start + index);
}
function normalize(v: string) {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim();
}
function parseAchievementType(value: string): AchievementType {
  const key = normalize(value);
  if (achievementTypes.includes(value as AchievementType))
    return value as AchievementType;
  if (key.includes("hoan thanh nhiem vu") || key.includes("danh gia nhiem vu"))
    return "TASK_COMPLETION";
  if (key.includes("chien si") || key.includes("thi dua")) return "EMULATION";
  if (key.includes("bang khen")) return "CERTIFICATE";
  if (key.includes("huan chuong")) return "MEDAL";
  if (key.includes("de tai") || key.includes("nghien cuu")) return "RESEARCH";
  return "OTHER";
}
function parseAchievementLevel(value: string): AchievementLevel {
  const key = normalize(value);
  if (achievementLevels.includes(value as AchievementLevel))
    return value as AchievementLevel;
  const found = achievementLevels.find(
    (level) => normalize(levelLabels[level]) === key,
  );
  if (found) return found;
  if (key.includes("khong hoan thanh")) return "KHONG_HOAN_THANH";
  if (key.includes("hoan thanh xuat sac")) return "HOAN_THANH_XUAT_SAC";
  if (key.includes("hoan thanh tot")) return "HOAN_THANH_TOT";
  if (key.includes("hoan thanh")) return "HOAN_THANH";
  if (key.includes("thu tuong")) return "THU_TUONG";
  if (key.includes("bo")) return "BO";
  if (key.includes("thanh pho")) return "THANH_PHO";
  if (key.includes("nha nuoc")) return "NHA_NUOC";
  if (key.includes("toan quoc")) return "TOAN_QUOC";
  if (key.includes("hang nhat")) return "HANG_NHAT";
  if (key.includes("hang nhi") || key.includes("hang hai")) return "HANG_HAI";
  if (key.includes("hang ba")) return "HANG_BA";
  return "CO_SO";
}
function excelCitizenId(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value).padStart(12, "0");
  }
  return String(value ?? "").trim();
}
function citizenIdForExport(value: unknown) {
  const citizenId = String(value ?? "").trim();
  return /^\d{1,12}$/.test(citizenId) ? citizenId.padStart(12, "0") : citizenId;
}
function excelDate(v: unknown) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  return m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : s;
}

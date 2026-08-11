import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { employeeSchema, achievementSchema, filterSchema, isAchievementLevelValid, isRewardType, levelsAtOrAbove, roles, type AchievementLevel, type AchievementType, type Role } from "@thongnhat/shared";
import { hashPassword, randomToken, sha256, verifyPassword } from "./crypto";
import type { Bindings, Variables } from "./types";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use("*", async (c, next) => cors({
  origin: (origin) => (c.env.ALLOWED_ORIGINS || "http://localhost:5173").split(",").map(x => x.trim()).includes(origin) ? origin : "",
  allowHeaders: ["Authorization", "Content-Type"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: false
})(c, next));

app.use("*", async (c, next) => {
  try { await next(); }
  catch (error) {
    console.error(JSON.stringify({ message: "request_failed", path: c.req.path, error: error instanceof Error ? error.message : String(error) }));
    return c.json({ error: "Không thể xử lý yêu cầu. Vui lòng thử lại." }, 500);
  }
});

const publicPaths = new Set(["/health", "/api/auth/login", "/api/auth/bootstrap"]);
app.use("/api/*", async (c, next) => {
  if (publicPaths.has(c.req.path)) return next();
  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return c.json({ error: "Bạn chưa đăng nhập." }, 401);
  const tokenHash = await sha256(token);
  const user = await c.env.DB.prepare(`
    SELECT u.id, u.username, u.display_name, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > datetime('now') AND u.active = 1
  `).bind(tokenHash).first<{ id: string; username: string; display_name: string; role: Role }>();
  if (!user) return c.json({ error: "Phiên đăng nhập đã hết hạn." }, 401);
  c.set("user", { id: user.id, username: user.username, displayName: user.display_name, role: user.role });
  return next();
});

function requireRole(allowed: Role[]): MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> {
  return async (c, next) => {
    const user = c.get("user");
    if (!allowed.includes(user.role)) return c.json({ error: "Bạn không có quyền thực hiện thao tác này." }, 403);
    await next();
  };
}

async function audit(env: Bindings, userId: string, action: string, entityType: string, entityId?: string, detail: unknown = {}) {
  await env.DB.prepare("INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,detail_json) VALUES (?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), userId, action, entityType, entityId ?? null, JSON.stringify(detail)).run();
}

const clean = (value: string) => value.trim().replaceAll(/\s+/g, " ");
const employeeRow = (row: Record<string, unknown>) => ({
  id: row.id, citizenId: row.citizen_id, fullName: row.full_name, gender: row.gender,
  dateOfBirth: row.date_of_birth, education: row.education, unit: row.unit, position: row.position,
  professionalTitle: row.professional_title, active: Boolean(row.active), createdAt: row.created_at, updatedAt: row.updated_at
});
const achievementRow = (row: Record<string, unknown>) => ({
  id: row.id, employeeId: row.employee_id, type: row.type, level: row.level, title: row.title,
  acceptedDate: row.accepted_date, year: row.year, organization: row.organization,
  decisionNumber: row.decision_number, role: row.role, notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at
});

type RewardCondition = { type: string; level: string; quantity: number; withinYears: number };
type RewardConditionGroup = { operator: "AND" | "OR"; conditions: RewardCondition[] };
type RewardConditions = { operator: "AND" | "OR"; exactLevel: boolean; groups: RewardConditionGroup[] };

function normalizeRewardConditions(value: unknown): RewardConditions {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const legacy = Array.isArray(raw.all) ? raw.all : [];
  const sourceGroups = Array.isArray(raw.groups) ? raw.groups : legacy.length ? [{ operator: "AND", conditions: legacy }] : [];
  const groups = sourceGroups.map((item) => {
    const group = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const conditions = Array.isArray(group.conditions) ? group.conditions : [];
    return {
      operator: group.operator === "OR" ? "OR" as const : "AND" as const,
      conditions: conditions.map((item) => {
        const condition = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
        return {
          type: String(condition.type ?? ""), level: String(condition.level ?? ""),
          quantity: Math.max(1, Math.trunc(Number(condition.quantity) || 1)),
          withinYears: Math.max(0, Math.trunc(Number(condition.withinYears) || 0))
        };
      }).filter((condition) => condition.type && condition.level)
    };
  }).filter((group) => group.conditions.length);
  return { operator: raw.operator === "OR" ? "OR" : "AND", exactLevel: raw.exactLevel === true, groups };
}

function areRewardConditionsValid(conditions: RewardConditions): boolean {
  return conditions.groups.every((group) =>
    group.conditions.every((condition) =>
      isAchievementLevelValid(condition.type, condition.level)
    )
  );
}

function rewardEligibility(conditions: RewardConditions, year: number) {
  const binds: unknown[] = [];
  const groupClauses = conditions.groups.map((group) => {
    const clauses = group.conditions.map((condition) => {
      const rankedLevels = levelsAtOrAbove(
        condition.type as AchievementType,
        condition.level as AchievementLevel,
        conditions.exactLevel,
      );
      const acceptedLevels = rankedLevels.length ? rankedLevels : [condition.level as AchievementLevel];
      binds.push(condition.type, ...acceptedLevels, year, condition.withinYears, year, condition.withinYears, condition.quantity);
      return `(SELECT COUNT(*) FROM achievements a WHERE a.employee_id=e.id AND a.type=? AND a.level IN (${acceptedLevels.map(() => "?").join(",")}) AND a.year<=? AND (?=0 OR a.year>=?-?+1))>=?`;
    });
    return `(${clauses.join(` ${group.operator} `)})`;
  });
  return { clause: groupClauses.join(` ${conditions.operator} `), binds };
}

async function getRewardCandidates(env: Bindings, year: number) {
  const rules = await env.DB.prepare("SELECT * FROM reward_rules WHERE active=1 ORDER BY priority DESC").all<Record<string, unknown>>();
  const candidates: Array<Record<string, unknown>> = [];
  for (const rule of rules.results) {
    const conditions = normalizeRewardConditions(JSON.parse(String(rule.conditions_json)));
    if (!conditions.groups.length) continue;
    const eligibility = rewardEligibility(conditions, year);
    const rows = await env.DB.prepare(`SELECT e.id,e.citizen_id,e.full_name,e.unit FROM employees e WHERE e.active=1 AND (${eligibility.clause}) ORDER BY e.full_name`).bind(...eligibility.binds).all<Record<string, unknown>>();
    for (const employee of rows.results) {
      candidates.push({
        ruleId: rule.id,
        ruleName: rule.name,
        rewardType: rule.reward_type,
        rewardLevel: rule.reward_level,
        conditions,
        employee: { id: employee.id, citizenId: employee.citizen_id, fullName: employee.full_name, unit: employee.unit }
      });
    }
  }
  return candidates;
}

app.get("/health", (c) => c.json({ ok: true, service: "thong-nhat-rewards-api" }));

app.post("/api/auth/bootstrap", async (c) => {
  const body = await c.req.json<{ bootstrapToken?: string; username?: string; password?: string; displayName?: string }>();
  if (!c.env.BOOTSTRAP_TOKEN || body.bootstrapToken !== c.env.BOOTSTRAP_TOKEN) return c.json({ error: "Mã khởi tạo không hợp lệ." }, 403);
  const count = await c.env.DB.prepare("SELECT COUNT(*) AS total FROM users").first<{ total: number }>();
  if ((count?.total ?? 0) > 0) return c.json({ error: "Hệ thống đã được khởi tạo." }, 409);
  if (!body.username || !body.displayName || !body.password || body.password.length < 10) return c.json({ error: "Mật khẩu phải có ít nhất 10 ký tự." }, 400);
  const password = await hashPassword(body.password, c.env.AUTH_PEPPER);
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO users (id,username,display_name,role,password_hash,password_salt,password_iterations) VALUES (?,?,?,?,?,?,?)")
    .bind(id, clean(body.username), clean(body.displayName), "ADMIN", password.hash, password.salt, password.iterations).run();
  return c.json({ ok: true }, 201);
});

app.post("/api/auth/login", async (c) => {
  const body = await c.req.json<{ username?: string; password?: string }>();
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE AND active = 1")
    .bind(body.username?.trim() ?? "").first<Record<string, unknown>>();
  if (!user || !body.password || !(await verifyPassword(body.password, String(user.password_salt), Number(user.password_iterations), String(user.password_hash), c.env.AUTH_PEPPER))) {
    return c.json({ error: "Tên đăng nhập hoặc mật khẩu không đúng." }, 401);
  }
  const token = randomToken();
  const days = Math.min(Math.max(Number(c.env.SESSION_TTL_DAYS) || 14, 1), 90);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')"),
    c.env.DB.prepare("INSERT INTO sessions (id,user_id,token_hash,expires_at) VALUES (?,?,?,datetime('now', ?))")
      .bind(crypto.randomUUID(), String(user.id), await sha256(token), `+${days} days`)
  ]);
  return c.json({ token, user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role } });
});

app.post("/api/auth/logout", async (c) => {
  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return c.json({ ok: true });
});
app.get("/api/me", (c) => c.json({ user: c.get("user") }));

app.get("/api/dashboard", async (c) => {
  const year = Number(c.req.query("year")) || new Date().getFullYear();
  const [employeeCount, achievementCount, unitCount, monthlyRows, recentRows, candidates] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS value FROM employees WHERE active = 1").first<{ value: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS value FROM achievements WHERE year = ?").bind(year).first<{ value: number }>(),
    c.env.DB.prepare("SELECT COUNT(DISTINCT unit) AS value FROM employees WHERE active = 1").first<{ value: number }>(),
    c.env.DB.prepare("SELECT CAST(strftime('%m', accepted_date) AS INTEGER) AS month, COUNT(*) AS value FROM achievements WHERE year=? GROUP BY month ORDER BY month").bind(year).all<{ month: number; value: number }>(),
    c.env.DB.prepare("SELECT a.*,e.full_name,e.citizen_id FROM achievements a JOIN employees e ON e.id=a.employee_id ORDER BY a.created_at DESC LIMIT 6").all<Record<string, unknown>>(),
    getRewardCandidates(c.env, year)
  ]);
  const monthly = Array.from({ length: 12 }, () => 0);
  for (const row of monthlyRows.results) if (row.month >= 1 && row.month <= 12) monthly[row.month - 1] = row.value;
  const candidateEmployees = new Set(candidates.map((candidate) => String((candidate.employee as Record<string, unknown>).id)));
  return c.json({ year, employees: employeeCount?.value ?? 0, achievements: achievementCount?.value ?? 0,
    units: unitCount?.value ?? 0, candidates: candidateEmployees.size, monthly,
    recent: recentRows.results.map((row) => ({ ...achievementRow(row), fullName: row.full_name, citizenId: row.citizen_id })) });
});

app.get("/api/employees", async (c) => {
  const parsed = filterSchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: "Bộ lọc không hợp lệ.", issues: parsed.error.issues }, 400);
  const f = parsed.data; const where: string[] = ["1=1"]; const params: unknown[] = [];
  if (f.search) { where.push("(e.full_name LIKE ? OR e.citizen_id LIKE ?)"); params.push(`%${f.search}%`, `%${f.search}%`); }
  if (f.unit) { where.push("e.unit = ?"); params.push(f.unit); }
  if (f.gender) { where.push("e.gender = ?"); params.push(f.gender); }
  if (f.education) { where.push("e.education LIKE ?"); params.push(`%${f.education}%`); }
  if (f.position) { where.push("e.position LIKE ?"); params.push(`%${f.position}%`); }
  if (f.achievementType || f.achievementLevel || f.fromYear || f.toYear) {
    const sub = ["a.employee_id=e.id"];
    if (f.achievementType) { sub.push("a.type=?"); params.push(f.achievementType); }
    if (f.achievementLevel) { sub.push("a.level=?"); params.push(f.achievementLevel); }
    if (f.fromYear) { sub.push("a.year>=?"); params.push(f.fromYear); }
    if (f.toYear) { sub.push("a.year<=?"); params.push(f.toYear); }
    where.push(`EXISTS (SELECT 1 FROM achievements a WHERE ${sub.join(" AND ")})`);
  }
  const clause = where.join(" AND "); const offset = (f.page - 1) * f.pageSize;
  const sortColumns = {
    fullName: "e.full_name COLLATE NOCASE",
    citizenId: "e.citizen_id",
    unit: "e.unit COLLATE NOCASE",
    position: "(COALESCE(e.position,'') || ' ' || COALESCE(e.professional_title,'')) COLLATE NOCASE",
    education: "e.education COLLATE NOCASE",
    achievementCount: "achievement_count",
    updatedAt: "e.updated_at",
  } as const;
  const orderBy = sortColumns[f.sortBy];
  const direction = f.sortDirection === "desc" ? "DESC" : "ASC";
  const [rows, count] = await Promise.all([
    c.env.DB.prepare(`SELECT e.*, (SELECT COUNT(*) FROM achievements a WHERE a.employee_id=e.id) AS achievement_count FROM employees e WHERE ${clause} ORDER BY ${orderBy} ${direction}, e.full_name COLLATE NOCASE ASC LIMIT ? OFFSET ?`).bind(...params, f.pageSize, offset).all<Record<string, unknown>>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM employees e WHERE ${clause}`).bind(...params).first<{ total: number }>()
  ]);
  return c.json({ items: rows.results.map((r) => ({ ...employeeRow(r), achievementCount: r.achievement_count })), total: count?.total ?? 0, page: f.page, pageSize: f.pageSize });
});

app.get("/api/employees/options", async (c) => {
  const [units, education, positions] = await Promise.all([
    c.env.DB.prepare("SELECT DISTINCT unit AS value FROM employees WHERE unit<>'' ORDER BY unit").all<{ value: string }>(),
    c.env.DB.prepare("SELECT DISTINCT education AS value FROM employees WHERE education<>'' ORDER BY education").all<{ value: string }>(),
    c.env.DB.prepare("SELECT DISTINCT position AS value FROM employees WHERE position<>'' ORDER BY position").all<{ value: string }>()
  ]);
  return c.json({ units: units.results.map(x => x.value), education: education.results.map(x => x.value), positions: positions.results.map(x => x.value) });
});

app.get("/api/employees/:id", async (c) => {
  const employee = await c.env.DB.prepare("SELECT * FROM employees WHERE id=?").bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!employee) return c.json({ error: "Không tìm thấy nhân viên." }, 404);
  const achievements = await c.env.DB.prepare("SELECT * FROM achievements WHERE employee_id=? ORDER BY year DESC, accepted_date DESC").bind(c.req.param("id")).all();
  return c.json({ ...employeeRow(employee), achievements: achievements.results.map(achievementRow) });
});

app.post("/api/employees", requireRole(["ADMIN", "HR"]), async (c) => {
  const parsed = employeeSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Dữ liệu nhân viên chưa hợp lệ.", issues: parsed.error.issues }, 400);
  const x = parsed.data; const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare(`INSERT INTO employees (id,citizen_id,full_name,gender,date_of_birth,education,unit,position,professional_title,active) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, x.citizenId, clean(x.fullName), x.gender, x.dateOfBirth, clean(x.education), clean(x.unit), clean(x.position), clean(x.professionalTitle), x.active ? 1 : 0).run();
  } catch (error) { if (String(error).includes("UNIQUE")) return c.json({ error: "CCCD đã tồn tại trong hệ thống." }, 409); throw error; }
  await audit(c.env, c.get("user").id, "CREATE", "EMPLOYEE", id, { citizenId: x.citizenId });
  return c.json({ id }, 201);
});

app.put("/api/employees/:id", requireRole(["ADMIN", "HR"]), async (c) => {
  const parsed = employeeSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Dữ liệu nhân viên chưa hợp lệ.", issues: parsed.error.issues }, 400);
  const x = parsed.data; const id = c.req.param("id");
  const result = await c.env.DB.prepare(`UPDATE employees SET citizen_id=?,full_name=?,gender=?,date_of_birth=?,education=?,unit=?,position=?,professional_title=?,active=?,updated_at=datetime('now') WHERE id=?`)
    .bind(x.citizenId, clean(x.fullName), x.gender, x.dateOfBirth, clean(x.education), clean(x.unit), clean(x.position), clean(x.professionalTitle), x.active ? 1 : 0, id).run();
  if (!result.meta.changes) return c.json({ error: "Không tìm thấy nhân viên." }, 404);
  await audit(c.env, c.get("user").id, "UPDATE", "EMPLOYEE", id);
  return c.json({ ok: true });
});

app.post("/api/employees/bulk-delete", requireRole(["ADMIN"]), async (c) => {
  const body = await c.req.json<{ ids?: unknown[] }>();
  const ids = [...new Set((body.ids ?? []).filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (!ids.length || ids.length > 100) return c.json({ error: "Chọn từ 1 đến 100 nhân viên để xóa." }, 400);
  const placeholders = ids.map(() => "?").join(",");
  const keys = await c.env.DB.prepare(
    `SELECT object_key FROM attachments WHERE achievement_id IN (SELECT id FROM achievements WHERE employee_id IN (${placeholders}))`,
  ).bind(...ids).all<{ object_key: string }>();
  if (keys.results.length) await c.env.MEDIA.delete(keys.results.map((row) => row.object_key));
  const result = await c.env.DB.prepare(`DELETE FROM employees WHERE id IN (${placeholders})`).bind(...ids).run();
  await audit(c.env, c.get("user").id, "BULK_DELETE", "EMPLOYEE", undefined, { ids, deleted: result.meta.changes });
  return c.json({ deleted: result.meta.changes });
});

app.delete("/api/employees/:id", requireRole(["ADMIN"]), async (c) => {
  const id = c.req.param("id");
  const keys = await c.env.DB.prepare("SELECT object_key FROM attachments WHERE achievement_id IN (SELECT id FROM achievements WHERE employee_id=?)").bind(id).all<{ object_key: string }>();
  if (keys.results.length) await c.env.MEDIA.delete(keys.results.map(x => x.object_key));
  const result = await c.env.DB.prepare("DELETE FROM employees WHERE id=?").bind(id).run();
  if (!result.meta.changes) return c.json({ error: "Không tìm thấy nhân viên." }, 404);
  await audit(c.env, c.get("user").id, "DELETE", "EMPLOYEE", id);
  return c.json({ ok: true });
});

app.post("/api/employees/import", requireRole(["ADMIN", "HR"]), async (c) => {
  const body = await c.req.json<{ rows?: unknown[]; overwriteExisting?: boolean }>();
  if (!Array.isArray(body.rows) || body.rows.length > 1000) return c.json({ error: "Mỗi lần chỉ nhập tối đa 1.000 dòng." }, 400);
  const valid: ReturnType<typeof employeeSchema.parse>[] = []; const errors: { row: number; message: string }[] = [];
  body.rows.forEach((row, index) => { const parsed = employeeSchema.safeParse(row); parsed.success ? valid.push(parsed.data) : errors.push({ row: index + 2, message: parsed.error.issues[0]?.message ?? "Không hợp lệ" }); });
  const unique = new Map(valid.map(row => [row.citizenId, row]));
  const duplicateRows = valid.length - unique.size; const rows = [...unique.values()]; const existing = new Set<string>();
  for (let i = 0; i < rows.length; i += 100) {
    const ids = rows.slice(i, i + 100).map(row => row.citizenId);
    if (ids.length) {
      const found = await c.env.DB.prepare(`SELECT citizen_id FROM employees WHERE citizen_id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all<{ citizen_id: string }>();
      found.results.forEach(row => existing.add(row.citizen_id));
    }
  }
  const importing = body.overwriteExisting ? rows : rows.filter(row => !existing.has(row.citizenId));
  for (let i = 0; i < importing.length; i += 100) {
    await c.env.DB.batch(importing.slice(i, i + 100).map(x => c.env.DB.prepare(body.overwriteExisting
      ? `INSERT INTO employees (id,citizen_id,full_name,gender,date_of_birth,education,unit,position,professional_title,active) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(citizen_id) DO UPDATE SET full_name=excluded.full_name,gender=excluded.gender,date_of_birth=excluded.date_of_birth,education=excluded.education,unit=excluded.unit,position=excluded.position,professional_title=excluded.professional_title,active=excluded.active,updated_at=datetime('now')`
      : `INSERT INTO employees (id,citizen_id,full_name,gender,date_of_birth,education,unit,position,professional_title,active) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), x.citizenId, clean(x.fullName), x.gender, x.dateOfBirth, clean(x.education), clean(x.unit), clean(x.position), clean(x.professionalTitle), x.active ? 1 : 0)));
  }
  const updated = body.overwriteExisting ? existing.size : 0; const inserted = importing.length - updated; const skipped = duplicateRows + (body.overwriteExisting ? 0 : existing.size);
  await audit(c.env, c.get("user").id, "IMPORT", "EMPLOYEE", undefined, { inserted, updated, skipped, rejected: errors.length, overwriteExisting: Boolean(body.overwriteExisting) });
  return c.json({ accepted: importing.length, inserted, updated, skipped, rejected: errors.length, errors });
});

app.post("/api/achievements", requireRole(["ADMIN", "HR"]), async (c) => {
  const parsed = achievementSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Dữ liệu thành tích chưa hợp lệ.", issues: parsed.error.issues }, 400);
  const x = parsed.data; const id = crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO achievements (id,employee_id,type,level,title,accepted_date,year,organization,decision_number,role,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, x.employeeId, x.type, x.level, clean(x.title), x.acceptedDate, x.year, clean(x.organization), clean(x.decisionNumber), clean(x.role), x.notes).run();
  await audit(c.env, c.get("user").id, "CREATE", "ACHIEVEMENT", id);
  return c.json({ id }, 201);
});

app.post("/api/achievements/import", requireRole(["ADMIN", "HR"]), async (c) => {
  const body = await c.req.json<{ rows?: Array<Record<string, unknown>> }>();
  if (!Array.isArray(body.rows) || body.rows.length > 1000) return c.json({ error: "Mỗi lần chỉ nhập tối đa 1.000 dòng." }, 400);
  const citizenIds = [...new Set(body.rows.map(row => String(row.citizenId ?? "")).filter(id => /^\d{12}$/.test(id)))];
  const employees = new Map<string,string>();
  for (let i = 0; i < citizenIds.length; i += 100) {
    const ids = citizenIds.slice(i, i + 100);
    const found = await c.env.DB.prepare(`SELECT id,citizen_id FROM employees WHERE citizen_id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all<{id:string;citizen_id:string}>();
    found.results.forEach(row => employees.set(row.citizen_id,row.id));
  }
  const valid: ReturnType<typeof achievementSchema.parse>[]=[];const errors:{row:number;message:string}[]=[];
  body.rows.forEach((row, index) => {
    const citizenId = String(row.citizenId ?? "");
    if (!/^\d{12}$/.test(citizenId)) {
      errors.push({ row: index + 2, message: "CCCD phải gồm đúng 12 chữ số." });
      return;
    }
    const employeeId = employees.get(citizenId);
    if (!employeeId) {
      errors.push({ row: index + 2, message: `Không tìm thấy nhân viên có CCCD ${citizenId}.` });
      return;
    }
    const parsed = achievementSchema.safeParse({ ...row, employeeId });
    parsed.success
      ? valid.push(parsed.data)
      : errors.push({ row: index + 2, message: parsed.error.issues[0]?.message ?? "Thành tích không hợp lệ." });
  });
  for(let i=0;i<valid.length;i+=100)await c.env.DB.batch(valid.slice(i,i+100).map(x=>c.env.DB.prepare(`INSERT INTO achievements (id,employee_id,type,level,title,accepted_date,year,organization,decision_number,role,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),x.employeeId,x.type,x.level,clean(x.title),x.acceptedDate,x.year,clean(x.organization),clean(x.decisionNumber),clean(x.role),x.notes)));
  await audit(c.env,c.get("user").id,"IMPORT","ACHIEVEMENT",undefined,{accepted:valid.length,rejected:errors.length,matchedBy:"citizenId"});
  return c.json({accepted:valid.length,rejected:errors.length,errors});
});

app.put("/api/achievements/:id", requireRole(["ADMIN", "HR"]), async (c) => {
  const parsed = achievementSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Dữ liệu thành tích chưa hợp lệ.", issues: parsed.error.issues }, 400);
  const x = parsed.data; const id = c.req.param("id");
  await c.env.DB.prepare(`UPDATE achievements SET employee_id=?,type=?,level=?,title=?,accepted_date=?,year=?,organization=?,decision_number=?,role=?,notes=?,updated_at=datetime('now') WHERE id=?`)
    .bind(x.employeeId, x.type, x.level, clean(x.title), x.acceptedDate, x.year, clean(x.organization), clean(x.decisionNumber), clean(x.role), x.notes, id).run();
  await audit(c.env, c.get("user").id, "UPDATE", "ACHIEVEMENT", id);
  return c.json({ ok: true });
});

app.delete("/api/achievements/:id", requireRole(["ADMIN", "HR"]), async (c) => {
  const id = c.req.param("id");
  const keys = await c.env.DB.prepare("SELECT object_key FROM attachments WHERE achievement_id=?").bind(id).all<{ object_key: string }>();
  if (keys.results.length) await c.env.MEDIA.delete(keys.results.map(x => x.object_key));
  await c.env.DB.prepare("DELETE FROM achievements WHERE id=?").bind(id).run();
  await audit(c.env, c.get("user").id, "DELETE", "ACHIEVEMENT", id);
  return c.json({ ok: true });
});

app.post("/api/achievements/:id/attachments", requireRole(["ADMIN", "HR"]), async (c) => {
  const achievementId = c.req.param("id"); const body = await c.req.parseBody(); const file = body.file;
  if (!(file instanceof File)) return c.json({ error: "Chưa chọn tệp." }, 400);
  if (file.size > 25 * 1024 * 1024) return c.json({ error: "Tệp không được lớn hơn 25 MB." }, 413);
  const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) return c.json({ error: "Chỉ nhận PDF, JPG, PNG hoặc WebP." }, 415);
  const exists = await c.env.DB.prepare("SELECT id FROM achievements WHERE id=?").bind(achievementId).first();
  if (!exists) return c.json({ error: "Không tìm thấy thành tích." }, 404);
  const attachmentId = crypto.randomUUID(); const safeName = file.name.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
  const key = `achievements/${achievementId}/${attachmentId}-${safeName}`;
  await c.env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { originalName: file.name } });
  await c.env.DB.prepare("INSERT INTO attachments (id,achievement_id,object_key,file_name,content_type,size) VALUES (?,?,?,?,?,?)")
    .bind(attachmentId, achievementId, key, file.name, file.type, file.size).run();
  await audit(c.env, c.get("user").id, "UPLOAD", "ATTACHMENT", attachmentId, { achievementId, fileName: file.name });
  return c.json({ id: attachmentId, fileName: file.name }, 201);
});

app.get("/api/attachments/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM attachments WHERE id=?").bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!row) return c.json({ error: "Không tìm thấy tệp." }, 404);
  const object = await c.env.MEDIA.get(String(row.object_key));
  if (!object?.body) return c.json({ error: "Tệp không còn trong kho lưu trữ." }, 404);
  const headers = new Headers(); object.writeHttpMetadata(headers); headers.set("etag", object.httpEtag);
  headers.set("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(String(row.file_name))}`);
  return new Response(object.body, { headers });
});

app.get("/api/reward-candidates", async (c) => {
  const year = Number(c.req.query("year")) || new Date().getFullYear();
  const [rules, members] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM reward_rules WHERE active=1 AND evaluation_year=? ORDER BY priority DESC, name").bind(year).all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT pm.* FROM proposal_members pm JOIN reward_rules r ON r.id=pm.proposal_id WHERE r.active=1 AND r.evaluation_year=? ORDER BY pm.full_name").bind(year).all<Record<string, unknown>>()
  ]);
  const employeesByProposal = new Map<string, Array<Record<string, unknown>>>();
  for (const member of members.results) {
    const proposalId = String(member.proposal_id);
    if (!employeesByProposal.has(proposalId)) employeesByProposal.set(proposalId, []);
    employeesByProposal.get(proposalId)!.push({
      id: member.employee_id, citizenId: member.citizen_id,
      fullName: member.full_name, unit: member.unit
    });
  }
  const proposals = rules.results.map((rule) => ({
    id: rule.id, name: rule.name, rewardType: rule.reward_type, rewardLevel: rule.reward_level,
    year: rule.evaluation_year, conditions: normalizeRewardConditions(JSON.parse(String(rule.conditions_json))),
    snapshotUpdatedAt: rule.snapshot_updated_at, employees: employeesByProposal.get(String(rule.id)) ?? []
  }));
  const candidates = proposals.flatMap((proposal) => proposal.employees.map((employee) => ({
    ruleId: proposal.id, ruleName: proposal.name, rewardType: proposal.rewardType,
    rewardLevel: proposal.rewardLevel, conditions: proposal.conditions, employee
  })));
  return c.json({ year, candidates, proposals });
});

app.get("/api/reward-rules", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM reward_rules ORDER BY priority DESC, name").all<Record<string, unknown>>();
  return c.json({ items: rows.results.map(row => ({ ...row, conditions: JSON.parse(String(row.conditions_json)) })) });
});

app.post("/api/reward-rules", requireRole(["ADMIN"]), async (c) => {
  const body = await c.req.json<{ name?: string; rewardType?: string; rewardLevel?: string; conditions?: unknown; priority?: number; year?: number }>();
  const conditions = normalizeRewardConditions(body.conditions);
  const year = Math.trunc(Number(body.year));
  if (
    !body.name?.trim() ||
    !body.rewardType ||
    !body.rewardLevel ||
    !Number.isInteger(year) || year < 1900 || year > 2100 ||
    !conditions.groups.length ||
    !isRewardType(body.rewardType) ||
    !isAchievementLevelValid(body.rewardType, body.rewardLevel) ||
    !areRewardConditionsValid(conditions)
  ) {
    return c.json({ error: "Bộ tiêu chuẩn cần có tên, kết quả và ít nhất một điều kiện hợp lệ." }, 400);
  }
  const id = crypto.randomUUID();
  const eligibility = rewardEligibility(conditions, year);
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO reward_rules (id,name,reward_type,reward_level,conditions_json,priority,evaluation_year,snapshot_updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'))")
      .bind(id, clean(body.name), body.rewardType, body.rewardLevel, JSON.stringify(conditions), Math.trunc(body.priority ?? 0), year),
    c.env.DB.prepare(`INSERT INTO proposal_members (proposal_id,employee_id,citizen_id,full_name,unit) SELECT ?,e.id,e.citizen_id,e.full_name,e.unit FROM employees e WHERE e.active=1 AND (${eligibility.clause})`).bind(id, ...eligibility.binds)
  ]);
  await audit(c.env, c.get("user").id, "CREATE", "REWARD_RULE", id, { year, snapshot: true });
  return c.json({ id }, 201);
});

app.post("/api/reward-rules/:id/refresh", requireRole(["ADMIN"]), async (c) => {
  const id = c.req.param("id");
  const rule = await c.env.DB.prepare("SELECT * FROM reward_rules WHERE id=?").bind(id).first<Record<string, unknown>>();
  if (!rule) return c.json({ error: "Không tìm thấy đề xuất." }, 404);
  const year = Number(rule.evaluation_year);
  const conditions = normalizeRewardConditions(JSON.parse(String(rule.conditions_json)));
  if (!Number.isInteger(year) || !conditions.groups.length) return c.json({ error: "Đề xuất chưa có năm xét hoặc bộ tiêu chuẩn hợp lệ." }, 400);
  const eligibility = rewardEligibility(conditions, year);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM proposal_members WHERE proposal_id=?").bind(id),
    c.env.DB.prepare(`INSERT INTO proposal_members (proposal_id,employee_id,citizen_id,full_name,unit) SELECT ?,e.id,e.citizen_id,e.full_name,e.unit FROM employees e WHERE e.active=1 AND (${eligibility.clause})`).bind(id, ...eligibility.binds),
    c.env.DB.prepare("UPDATE reward_rules SET snapshot_updated_at=datetime('now'),updated_at=datetime('now') WHERE id=?").bind(id)
  ]);
  const count = await c.env.DB.prepare("SELECT COUNT(*) AS value FROM proposal_members WHERE proposal_id=?").bind(id).first<{ value: number }>();
  await audit(c.env, c.get("user").id, "REFRESH", "REWARD_RULE", id, { year, employees: count?.value ?? 0 });
  return c.json({ ok: true, employees: count?.value ?? 0 });
});

app.put("/api/reward-rules/:id", requireRole(["ADMIN"]), async (c) => {
  const body = await c.req.json<{ name?: string; rewardType?: string; rewardLevel?: string; conditions?: unknown; priority?: number; active?: boolean }>();
  const conditions = normalizeRewardConditions(body.conditions);
  if (
    !body.name?.trim() ||
    !body.rewardType ||
    !body.rewardLevel ||
    !conditions.groups.length ||
    !isRewardType(body.rewardType) ||
    !isAchievementLevelValid(body.rewardType, body.rewardLevel) ||
    !areRewardConditionsValid(conditions)
  ) return c.json({ error: "Bộ tiêu chuẩn không hợp lệ." }, 400);
  const result = await c.env.DB.prepare("UPDATE reward_rules SET name=?,reward_type=?,reward_level=?,conditions_json=?,priority=?,active=?,updated_at=datetime('now') WHERE id=?")
    .bind(clean(body.name), body.rewardType, body.rewardLevel, JSON.stringify(conditions), Math.trunc(body.priority ?? 0), body.active === false ? 0 : 1, c.req.param("id")).run();
  if (!result.meta.changes) return c.json({ error: "Không tìm thấy bộ tiêu chuẩn." }, 404);
  await audit(c.env, c.get("user").id, "UPDATE", "REWARD_RULE", c.req.param("id"));
  return c.json({ ok: true });
});

app.delete("/api/reward-rules/:id", requireRole(["ADMIN"]), async (c) => {
  const result = await c.env.DB.prepare("DELETE FROM reward_rules WHERE id=?").bind(c.req.param("id")).run();
  if (!result.meta.changes) return c.json({ error: "Không tìm thấy bộ tiêu chuẩn." }, 404);
  await audit(c.env, c.get("user").id, "DELETE", "REWARD_RULE", c.req.param("id"));
  return c.json({ ok: true });
});

app.get("/api/users", requireRole(["ADMIN"]), async (c) => {
  const rows = await c.env.DB.prepare("SELECT id,username,display_name,role,active,created_at,updated_at FROM users ORDER BY active DESC,display_name").all<Record<string, unknown>>();
  const counts: Record<Role, number> & { total: number; active: number } = { ADMIN: 0, HR: 0, REVIEWER: 0, VIEWER: 0, total: rows.results.length, active: 0 };
  const items = rows.results.map((row) => {
    const role = row.role as Role;
    if (roles.includes(role)) counts[role] += 1;
    if (Boolean(row.active)) counts.active += 1;
    return { id: row.id, username: row.username, displayName: row.display_name, role, active: Boolean(row.active), createdAt: row.created_at, updatedAt: row.updated_at };
  });
  return c.json({ items, counts });
});

app.post("/api/users", requireRole(["ADMIN"]), async (c) => {
  const body = await c.req.json<{ username?: string; displayName?: string; role?: Role; password?: string }>();
  if (!body.username || !body.displayName || !body.password || body.password.length < 10 || !roles.includes(body.role as Role)) return c.json({ error: "Thông tin tài khoản chưa hợp lệ." }, 400);
  const duplicate = await c.env.DB.prepare("SELECT id FROM users WHERE username=? COLLATE NOCASE").bind(body.username.trim()).first();
  if (duplicate) return c.json({ error: "Tên đăng nhập đã tồn tại." }, 409);
  const password = await hashPassword(body.password, c.env.AUTH_PEPPER); const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO users (id,username,display_name,role,password_hash,password_salt,password_iterations) VALUES (?,?,?,?,?,?,?)")
    .bind(id, clean(body.username), clean(body.displayName), body.role, password.hash, password.salt, password.iterations).run();
  await audit(c.env, c.get("user").id, "CREATE", "USER", id, { role: body.role });
  return c.json({ id }, 201);
});

app.put("/api/users/:id", requireRole(["ADMIN"]), async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ displayName?: string; role?: Role; active?: boolean; password?: string }>();
  if (!body.displayName?.trim() || !roles.includes(body.role as Role) || typeof body.active !== "boolean" || (body.password !== undefined && body.password.length < 10)) {
    return c.json({ error: "Thông tin tài khoản chưa hợp lệ. Mật khẩu mới cần ít nhất 10 ký tự." }, 400);
  }
  const existing = await c.env.DB.prepare("SELECT id,role,active FROM users WHERE id=?").bind(id).first<{ id: string; role: Role; active: number }>();
  if (!existing) return c.json({ error: "Không tìm thấy tài khoản." }, 404);
  if (id === c.get("user").id && (!body.active || body.role !== "ADMIN")) return c.json({ error: "Không thể tự khóa hoặc bỏ quyền quản trị của tài khoản đang đăng nhập." }, 400);
  if (existing.role === "ADMIN" && existing.active && (!body.active || body.role !== "ADMIN")) {
    const admins = await c.env.DB.prepare("SELECT COUNT(*) AS value FROM users WHERE role='ADMIN' AND active=1").first<{ value: number }>();
    if ((admins?.value ?? 0) <= 1) return c.json({ error: "Hệ thống phải còn ít nhất một quản trị viên đang hoạt động." }, 400);
  }
  if (body.password) {
    const password = await hashPassword(body.password, c.env.AUTH_PEPPER);
    await c.env.DB.prepare("UPDATE users SET display_name=?,role=?,active=?,password_hash=?,password_salt=?,password_iterations=?,updated_at=datetime('now') WHERE id=?")
      .bind(clean(body.displayName), body.role, body.active ? 1 : 0, password.hash, password.salt, password.iterations, id).run();
  } else {
    await c.env.DB.prepare("UPDATE users SET display_name=?,role=?,active=?,updated_at=datetime('now') WHERE id=?")
      .bind(clean(body.displayName), body.role, body.active ? 1 : 0, id).run();
  }
  if (!body.active) await c.env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(id).run();
  await audit(c.env, c.get("user").id, "UPDATE", "USER", id, { role: body.role, active: body.active, passwordChanged: Boolean(body.password) });
  return c.json({ ok: true });
});

export default app;

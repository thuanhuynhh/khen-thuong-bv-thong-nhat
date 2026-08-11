import { z } from "zod";

export const roles = ["ADMIN", "HR", "REVIEWER", "VIEWER"] as const;
export const achievementTypes = ["RESEARCH", "EMULATION", "CERTIFICATE", "MEDAL", "OTHER"] as const;
export const achievementLevels = [
  "CO_SO", "TRUONG_DAI_HOC", "THANH_PHO", "BO", "NHA_NUOC", "TOAN_QUOC",
  "THU_TUONG", "HANG_BA", "HANG_HAI", "HANG_NHAT", "KHAC"
] as const;

export type Role = typeof roles[number];
export type AchievementType = typeof achievementTypes[number];
export type AchievementLevel = typeof achievementLevels[number];

export const achievementLevelsByType = {
  RESEARCH: ["CO_SO", "TRUONG_DAI_HOC", "THANH_PHO", "BO", "NHA_NUOC", "KHAC"],
  EMULATION: ["CO_SO", "THANH_PHO", "BO", "TOAN_QUOC", "KHAC"],
  CERTIFICATE: ["THANH_PHO", "BO", "THU_TUONG", "KHAC"],
  MEDAL: ["HANG_BA", "HANG_HAI", "HANG_NHAT"],
  OTHER: ["KHAC"]
} as const satisfies Record<AchievementType, readonly [AchievementLevel, ...AchievementLevel[]]>;

export function levelsForAchievementType(type: AchievementType): readonly [AchievementLevel, ...AchievementLevel[]] {
  return achievementLevelsByType[type] as readonly [AchievementLevel, ...AchievementLevel[]];
}

export function isAchievementLevelValid(type: string, level: string): boolean {
  if (!achievementTypes.includes(type as AchievementType)) return false;
  return (levelsForAchievementType(type as AchievementType) as readonly string[]).includes(level);
}

export const employeeSchema = z.object({
  citizenId: z.string().trim().regex(/^\d{9,12}$/, "CCCD phải gồm 9–12 chữ số"),
  fullName: z.string().trim().min(2).max(120),
  gender: z.enum(["NAM", "NU", "KHAC"]),
  dateOfBirth: z.string().date(),
  education: z.string().trim().max(120).default(""),
  unit: z.string().trim().min(1).max(160),
  position: z.string().trim().max(160).default(""),
  professionalTitle: z.string().trim().max(160).default(""),
  active: z.boolean().default(true)
});

export const achievementSchema = z.object({
  employeeId: z.string().uuid(),
  type: z.enum(achievementTypes),
  level: z.enum(achievementLevels),
  title: z.string().trim().min(2).max(500),
  acceptedDate: z.string().date(),
  year: z.number().int().min(1900).max(2200),
  organization: z.string().trim().max(240).default(""),
  decisionNumber: z.string().trim().max(120).default(""),
  role: z.string().trim().max(160).default(""),
  notes: z.string().trim().max(2000).default("")
}).superRefine((value, context) => {
  if (!isAchievementLevelValid(value.type, value.level)) {
    context.addIssue({
      code: "custom",
      path: ["level"],
      message: "Cấp / hạng không phù hợp với loại thành tích"
    });
  }
});

export const filterSchema = z.object({
  search: z.string().max(120).optional(),
  unit: z.string().max(160).optional(),
  gender: z.enum(["NAM", "NU", "KHAC"]).optional(),
  education: z.string().max(120).optional(),
  position: z.string().max(160).optional(),
  fromYear: z.coerce.number().int().min(1900).max(2200).optional(),
  toYear: z.coerce.number().int().min(1900).max(2200).optional(),
  achievementType: z.enum(achievementTypes).optional(),
  achievementLevel: z.enum(achievementLevels).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

export type EmployeeInput = z.infer<typeof employeeSchema>;
export type AchievementInput = z.infer<typeof achievementSchema>;
export type EmployeeFilter = z.infer<typeof filterSchema>;

export interface Employee extends EmployeeInput { id: string; createdAt: string; updatedAt: string; }
export interface Achievement extends AchievementInput { id: string; createdAt: string; updatedAt: string; attachments?: Attachment[]; }
export interface Attachment { id: string; achievementId: string; fileName: string; contentType: string; size: number; objectKey: string; createdAt: string; }
export interface SessionUser { id: string; username: string; displayName: string; role: Role; }

export const levelLabels: Record<AchievementLevel, string> = {
  CO_SO: "Cấp cơ sở", TRUONG_DAI_HOC: "Cấp trường đại học", THANH_PHO: "Cấp thành phố",
  BO: "Cấp Bộ", NHA_NUOC: "Cấp Nhà nước", TOAN_QUOC: "Toàn quốc", THU_TUONG: "Thủ tướng",
  HANG_BA: "Hạng Ba", HANG_HAI: "Hạng Nhì", HANG_NHAT: "Hạng Nhất", KHAC: "Khác"
};
export const typeLabels: Record<AchievementType, string> = {
  RESEARCH: "Đề tài", EMULATION: "Chiến sĩ thi đua", CERTIFICATE: "Bằng khen", MEDAL: "Huân chương", OTHER: "Khác"
};

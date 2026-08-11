# Hướng dẫn agent cho dự án Khen thưởng Bệnh viện Thống Nhất

## Bắt đầu mỗi phiên chat

1. Đọc toàn bộ `skills/caveman/SKILL.md` trước khi trả lời hoặc sửa mã.
2. Dùng Caveman mức `full` ngay từ phản hồi đầu: tiếng Việt ngắn, đủ kỹ thuật, không filler, không tự giới thiệu mode.
3. Caveman giữ hiệu lực toàn phiên. Chỉ dừng khi người dùng nói rõ `stop caveman` hoặc `normal mode`.
4. Khi cảnh báo bảo mật, thao tác phá hủy hoặc thứ tự triển khai dễ hiểu nhầm: viết câu đầy đủ, rõ thứ tự. Sau đó quay lại Caveman.
5. Đọc skill liên quan trước khi làm: `cloudflare`, `wrangler`, `workers-best-practices`, `electron`, `ui-ux-pro-max`, `frontend-design`.

## Kiến trúc cố định

- Monorepo npm workspaces.
- `apps/desktop`: Electron 43 + React 19 + Vite.
- `apps/api`: Hono Worker + Cloudflare D1 + R2.
- `packages/shared`: Zod schemas và TypeScript types dùng chung.
- CCCD là khóa nghiệp vụ duy nhất. Luôn giữ kiểu chuỗi; không ép sang number.
- D1 chứa nhân viên, thành tích, user, session, luật xét thưởng, audit log.
- R2 chỉ chứa media/minh chứng; D1 chứa metadata và object key.
- Renderer dùng `app://bundle`, `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Màu thương hiệu chính: `#007BFF`. Light mode. Không đổi màu chủ đạo nếu người dùng không yêu cầu.
- Icon chính: `apps/desktop/build/icon.png`, đúng 512×512.

## Kiểm tra trước khi sửa

```powershell
git status --short
npm install
npm run typecheck
```

Không ghi đè thay đổi chưa commit của người dùng. Không commit `.dev.vars`, token, password, Cloudflare secret hoặc GitHub token.

## Chạy local

```powershell
npm run db:migrate:local
npm run dev
```

- Renderer: `http://127.0.0.1:5173`
- Worker: `http://127.0.0.1:8787`
- Secret local: `apps/api/.dev.vars` (đã bị gitignore).

## Build app

Kiểm tra nhanh:

```powershell
npm run typecheck
npm audit
npm run build -w @thongnhat/api
npm run build -w @thongnhat/desktop
```

Build NSIS để phát hành Windows:

```powershell
npm run release:win
```

Nếu electron-builder báo `EPERM` khi rename `win-unpacked.tmp`, dừng mọi tiến trình Electron/Vite đang chạy rồi build lại. Không xóa dữ liệu nguồn.

## Redeploy API Cloudflare nhanh

Yêu cầu `npx wrangler whoami` đang đăng nhập đúng account. Chạy tại root:

```powershell
npm run redeploy:api
```

Lệnh này build shared, dry-run Worker, áp D1 migration remote, deploy Worker. Không tạo lại D1/R2 nếu tài nguyên đã tồn tại.

Kiểm tra sau deploy:

```powershell
Invoke-RestMethod https://<worker-url>/health
npx wrangler deployments list -c apps/api/wrangler.jsonc
```

Muốn xem lỗi production:

```powershell
npx wrangler tail -c apps/api/wrangler.jsonc --status error
```

`npm run redeploy:api` chỉ phát hành Worker. Nếu yêu cầu `redeploy` bao gồm thay đổi desktop/UI, không được dừng ở bước này: bắt buộc tiếp tục tăng version, commit/push, tạo tag mới và xác nhận GitHub Release có bộ cài cùng `latest.yml`.

## Phát hành GitHub và auto-update

1. Tăng `version` trong `apps/desktop/package.json`.
2. Chạy typecheck, audit, build.
3. Commit và push `main`.
4. Tạo tag trùng version, ví dụ `v0.1.1`, rồi push tag.
5. Workflow `.github/workflows/desktop-release.yml` build NSIS, tạo GitHub Release, tải `latest.yml` cho `electron-updater`.

```powershell
git add -A
git commit -m "release: v0.1.1"
git push origin main
git tag v0.1.1
git push origin v0.1.1
```

Không tạo lại tag đã tồn tại. Kiểm tra `gh release view v0.1.1` trước.

Khi người dùng yêu cầu `redeploy` sau bất kỳ thay đổi nào ảnh hưởng ứng dụng desktop, quy trình phát hành GitHub ở trên là bắt buộc. Mỗi lần phát hành phải dùng version mới theo SemVer; không tái sử dụng version/tag cũ. Chỉ báo hoàn tất sau khi:

- Tag mới đã được push lên `origin`.
- Workflow `Desktop release` chạy thành công.
- `gh release view v<version>` tìm thấy Release.
- Release có bộ cài `.exe`, file `.blockmap` và `latest.yml` để `electron-updater` tải bản mới.

## Quy tắc hoàn tất

- Typecheck sạch.
- `npm audit` không có lỗ hổng high/critical.
- Migration local hoặc remote đã chạy đúng môi trường.
- Worker `/health` trả `ok: true`.
- Bản desktop dùng đúng API production.
- Báo rõ URL Worker, GitHub repo, release/tag và phần nào còn cần người dùng cung cấp.

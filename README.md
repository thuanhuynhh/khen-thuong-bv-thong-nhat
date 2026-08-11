# Khen thưởng Bệnh viện Thống Nhất

Ứng dụng desktop quản lý hồ sơ thành tích và sàng lọc đề xuất khen thưởng theo CCCD. Giao diện Electron/React, API chạy trên Cloudflare Workers, dữ liệu quan hệ ở D1 và hồ sơ minh chứng ở R2.

## Chức năng đã có

- Đăng nhập, phiên đăng nhập và 4 vai trò: Quản trị viên, Tổ chức cán bộ, Hội đồng xét duyệt, Chỉ xem.
- Hồ sơ nhân viên neo theo CCCD duy nhất; thêm, sửa, xóa và cập nhật hàng năm.
- Thành tích gồm đề tài, chiến sĩ thi đua, bằng khen, huân chương và nhóm khác; lưu cấp/hạng, tên, ngày chấp nhận, đơn vị, số quyết định, vai trò và ghi chú.
- Kéo thả PDF/JPG/PNG/WebP tối đa 25 MB vào R2; metadata tệp nằm trong D1.
- Nhập Excel tối đa 1.000 dòng/lần. CCCD đã có sẽ được cập nhật (upsert), không tạo trùng.
- Bộ lọc theo tên/CCCD, đơn vị, giới tính, trình độ, chức vụ, năm, loại và cấp thành tích.
- Luật đề xuất lưu dưới dạng JSON, có thể kết hợp nhiều điều kiện. Migration mẫu đã tạo luật “Bằng khen Thủ tướng + đề tài cấp Bộ → Huân chương Lao động hạng Ba”.
- Audit log cho các thao tác thay đổi quan trọng.
- Electron tự kiểm tra và cài bản cập nhật từ GitHub Releases.

## Chạy local

Yêu cầu Node.js 22 trở lên.

```powershell
npm install
Copy-Item apps/api/.dev.vars.example apps/api/.dev.vars
npm run db:migrate:local
npm run dev
```

Đặt `BOOTSTRAP_TOKEN` trong `apps/api/.dev.vars`, sau đó gọi một lần để tạo quản trị viên đầu tiên:

```powershell
$body = @{
  bootstrapToken = "ma-khoi-tao"
  username = "admin"
  password = "MatKhauManh-ToiThieu10KyTu"
  displayName = "Quản trị hệ thống"
} | ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:8787/api/auth/bootstrap -Method Post -ContentType application/json -Body $body
```

## Tạo tài nguyên Cloudflare

```powershell
npx wrangler login
npx wrangler d1 create thong-nhat-rewards
npx wrangler r2 bucket create thong-nhat-rewards-media
```

Thay `database_id` trong `apps/api/wrangler.jsonc` bằng ID D1 thật. Cập nhật `ALLOWED_ORIGINS` với hostname Worker/app cần dùng, rồi:

```powershell
Set-Location apps/api
npx wrangler secret put BOOTSTRAP_TOKEN
Set-Location ../..
npm run db:migrate:remote
npm run deploy:api
```

Sao chép `apps/desktop/.env.example` thành `.env.production` và đặt `VITE_API_URL` là URL Worker đã deploy.

## Phát hành và tự cập nhật qua GitHub

1. Thay `REPLACE_GITHUB_OWNER` trong `apps/desktop/package.json` bằng GitHub owner thật.
2. Tạo repository GitHub và push mã nguồn.
3. Cấu hình repository variable `VITE_API_URL`.
4. Tạo tag phiên bản trùng với `apps/desktop/package.json`, ví dụ `v0.1.0`, rồi push tag.

Workflow `desktop-release.yml` tạo NSIS installer và file `latest.yml` trên GitHub Release. `electron-updater` dùng các tệp này để tải bản mới. Với phát hành nội bộ chính thức, nên ký mã Windows bằng chứng thư code-signing trước khi phân phối.

## Header Excel hỗ trợ

Các tên cột được chuẩn hóa không dấu. Tối thiểu cần: `CCCD`, `Họ và tên`, `Giới tính`, `Ngày sinh`, `Đơn vị`. Có thể thêm `Trình độ`, `Chức vụ`, `Chức danh nghề nghiệp`.

CCCD phải được định dạng Text trong Excel để giữ số 0 ở đầu.

## Lệnh kiểm tra

```powershell
npm run typecheck
npm audit
npm run build -w @thongnhat/api
npm run build -w @thongnhat/desktop
```

Thư mục đóng gói thử: `apps/desktop/release/<version>/win-unpacked`.

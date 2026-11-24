# 得茶 Tehcha · 手搖飲管理系統 BMS

依 `資料庫系統.pdf`（SRS v1.0）實作的線上點餐系統：顧客點餐與自取、店員出餐看板與後台、管理員帳號與資料庫維護。

```
frontend/   Vue 3 + Vite + TypeScript（顧客網站 /、店員後台 /staff、管理員 /admin）
backend/    TypeScript REST API（Hono + node-postgres），8 個子系統各一個 service
  db/migrations/001_schema.sql   資料表、限制條件、觸發器、檢視表
  db/seed.sql                    範例資料（含 60 天銷售紀錄）
  test/                          單元、整合、併發測試
api/index.ts  Vercel Function 入口（把 /api/* 交給 backend）
vercel.json   部署設定：建置指令、路由、每日備份排程
```

## 本機開發（IR-003）

需要 Node.js 22 以上。不需要另外安裝 PostgreSQL：`db:local` 會下載並啟動真正的 PostgreSQL 17。

1. `npm install`
2. `npm install --prefix backend/devdb`（本機資料庫，只需一次）
3. `cp .env.example .env`
4. 開一個終端機：`npm run db:local`（保持執行）
5. `npm run db:reset`（建立所有資料表並載入範例資料）
6. 開第二個終端機：`npm run dev:api`（API：http://localhost:8787/api）
7. 開第三個終端機：`npm run dev:web`，打開 http://localhost:5173

已有 PostgreSQL 15 以上（或 Neon）的話，略過 2、4，把 `.env` 的 `DATABASE_URL` 改成你的連線字串即可。

### 試用帳號

| 帳號 | 密碼 | 角色 |
|---|---|---|
| `demo` | `demo1234` | 顧客（有歷史訂單與點數） |
| `staff_ntut` / `staff_xinyi` / `staff_dadao` | `staff1234` | 店員（各負責一間門市） |
| `admin` | `admin1234` | 管理員，同時是三間門市的店員 |

> **部署到公開網址後，請先用 admin 登入「帳號與權限」，改掉 admin 與店員的密碼。** 這些是公開的範例密碼。

## 部署到 Vercel + Neon

1. 把專案推上 GitHub。
2. Vercel → **Add New → Project** → 匯入這個 repo。Framework Preset 選 **Other**，其他設定保持空白（`vercel.json` 已經指定）。
3. 專案的 **Storage → Create Database → Neon**，Region 選 **Singapore (aws-ap-southeast-1)**，連到這個專案。Vercel 會自動加入 `DATABASE_URL` 與 `DATABASE_URL_UNPOOLED`。
   （也可以在 neon.tech 自己建專案，再手動把這兩個環境變數加到 Vercel。）
4. **Settings → Environment Variables** 加入：
   - `JWT_SECRET`：一串夠長的隨機字（例如 `openssl rand -hex 32` 的結果）
   - `CRON_SECRET`：另一串隨機字（保護每日備份排程）
   - 選填 `MAIL_HOST`、`MAIL_PORT`、`MAIL_USER`、`MAIL_PASSWORD`、`MAIL_FROM`：開啟註冊驗證信與訂單確認信
5. **Deploy**。建置時會自動建立資料表；資料庫是空的時候也會自動載入範例資料。
6. 打開網址，用上面的試用帳號登入，然後改掉預設密碼。

說明：

- API 與網頁在同一個網域（`/api/*` 由 `api/index.ts` 處理），不需要設定 CORS。
- `vercel.json` 把 Function 放在 `sin1`（新加坡），跟 Neon 新加坡同區。Neon 若選了別的區域，請把 `regions` 改成最近的 Vercel 區域，否則每個查詢都要跨洲，會變慢。
- 每天台灣時間 02:00 會自動備份一次（Vercel Cron，Hobby 方案可用），保留 30 天。
- 之後新增 migration（`backend/db/migrations/002_*.sql`），下次部署會自動套用；已套用過的不會重跑。

## 測試（TR-001～TR-003）

```bash
npm test                              # 後端 40 項 + 前端 4 項
npm run coverage -w backend           # 覆蓋率
```

後端測試會自己啟動一個暫時的 PostgreSQL 17（第一次約 15 秒），每次都從空資料庫建表、載入範例資料：

- `pricing.test.ts`：金額計算、三種折扣疊加、買一送一、點數上限與累積、狀態機（核心邏輯覆蓋率 100%）
- `flow.test.ts`：註冊 → 加入購物車 → 結帳 → 店員出餐 → 結案得點 → 評論；取消還原庫存與點數；角色權限；登入鎖定
- `concurrency.test.ts`：12 位顧客同時搶 5 杯，剛好成交 5 筆、庫存停在 0；同一會員同時兩筆不會重複花點數；兩位店員同時按推進只會前進一步
- `database.test.ts`：資料庫本身的限制（狀態不可跳階、金額不可改、點數帳本不可改、評論限結案訂單、折扣期間）、報表、備份還原、維護模式

## 與規格書不同的地方

實作時發現不正確或不方便的設計，已直接調整：

| 規格書 | 實作 | 原因 |
|---|---|---|
| 後端 PHP + Laravel、Eloquent ORM | TypeScript（Hono）+ node-postgres，參數化 SQL | Vercel 沒有官方 PHP 執行環境；改用 Vercel 原生支援的 Node.js，資料庫設計不變 |
| Redis 快取與狀態推播 | 每 3 秒輪詢 + CDN 快取菜單 15 秒 | Vercel + Neon 沒有 Redis；輪詢仍符合 BMS-N-003「3 秒內更新」 |
| 訂單狀態只有 4 種 | 加上 `cancelled` | OCS-F-006 允許取消，原本 4 種狀態無法表示已取消的訂單 |
| 折扣類型 `seasonings` | `seasonal` | seasonings 是「調味料」，應為筆誤 |
| `TIMESTAMP` | `TIMESTAMPTZ`，營業日以台北時間計算 | 伺服器在 UTC，不帶時區會讓日報表與取餐編號差 8 小時 |
| UMS-F-007「店員與管理員帳號不可透過系統新增」 | 管理員可建立店員帳號；任何帳號都不刪除，只停用或停權 | 與 UMS-F-006、Scenario 3、AUI-001 互相矛盾，採多數條文 |
| `users.status` 0/1 | 0 正常、1 停權、2 停用 | 規格同時提到「停用」與「停權」 |
| 2.4 節 CartItem 用 `user_id` | 用 `member_id`（同 4.2 節） | 購物車屬於會員點數帳戶 |
| 折扣、客製化選項可刪除 | 軟刪除（`is_deleted`） | 已有訂單引用，硬刪除會破壞外鍵 |

新增的欄位與資料表（標註於 schema 的 `[SRS+]`）：

- `users.email_verified_at`、`failed_login_count`、`locked_until`：E-mail 驗證（UMS-F-003）與登入鎖定（UMS-N-003）
- `product.name_en`、`tagline`、`art_tint`、`art_topping`、`category.name_en`：雙語菜單與沒有照片時的插畫杯
- `order_status_log`：每個狀態的時間與操作的店員（訂單追蹤頁顯示時間）
- `user_warning`：管理員警告紀錄（Scenario 3）
- `backup_snapshot`：備份（DBS-F-002、DBS-N-002）
- `app_setting`：維護模式（BMS-N-005）

由資料庫本身保證的規則（觸發器與 CHECK）：訂單狀態只能依序前進（BR-001）、只有「已接單」可取消（BR-006）、訂單總額公式（BR-002）、成立後金額不可改、點數餘額等於點數紀錄總和且不為負（IC-005）、點數紀錄只能新增、同一商品特殊活動期間不重疊（BR-010/011）、評論只限已結案訂單且一單一則（BR-012、IC-008）、庫存不為負（IC-003、TR-003）、取餐編號每店每日不重複。

仍是「暫定」的商業規則（稅率 5%、外送 NT$60、NT$10 得 1 點、點數最多折抵 50%）集中在 `backend/src/domain/pricing.ts` 開頭；稅以折扣前的商品小計計算，折扣率 0.1 代表折 10%（9 折）。

## 子系統對照

| 子系統 | 後端 | 前端頁面 |
|---|---|---|
| UMS 會員與權限 | `services/ums.ts`、`auth.ts` | 登入／註冊、會員資料、後台「帳號與權限」 |
| PIS 商品與庫存 | `services/pis.ts` | 後台「商品管理」「客製化選項」「門市與庫存」 |
| SRMS 搜尋推薦 | `services/srms.ts` | 菜單（搜尋、熱門、你常點的、買過的人也買了）、門市與評價 |
| SCMS 購物車 | `services/scms.ts` | 購物車、結帳 |
| OCS 訂單與自取 | `services/ocs.ts` | 訂單狀態、我的訂單、後台「訂單看板」 |
| DIS 折扣與點數 | `services/dis.ts` | 結帳明細、茶點數、後台「折扣政策」 |
| SRS 銷售報表 | `services/srs.ts` | 後台「銷售報表」（圖表、表格、CSV） |
| DBS 資料庫 | `services/dbs.ts`、`db/` | 後台「資料庫維護」（備份、還原、完整性檢查、維護模式） |

# 測試與驗收方法（Testing & Verification）

適用範圍：所有功能 issue 的 DoD、PR 審查。角色定位與規範文件之間的關係見 [`CLAUDE.md`](../../CLAUDE.md)。這份文件橫跨 Rust 與 Svelte 兩邊（四層框架本來就是前後端共用），寫進每張功能 issue 的 DoD 時直接引用這裡的層級定義，不用每次重新描述一次。

---

## 四層驗證框架

### Layer 1（`cargo test`）—— Rust 業務邏輯正確性

唯一的邏輯正確性依據。用 `#[tokio::test]` 測 async 函式，透過 [`rust-backend.md`](rust-backend.md) 定義的 trait 抽象（例如 `TokenStore`）注入假實作，不需要真的碰 OS Keychain 或網路。用 `// Given` / `// When` / `// Then` 註解組織測試邏輯，不需要引入額外 BDD 框架。覆蓋下方「已知錯誤碼邊界」對應的每個情境，不是只測 happy path。

### Layer 2（瀏覽器 mock）—— Svelte UI 流程

透過 `src/lib/tauri.js` 的 `invoke()` shim，在一般瀏覽器（`npm run dev`）驗證 UI 流程/互動，不需要真的 Tauri 視窗。用 Given-When-Then 描述驗收情境，例如「Given 使用者在登入畫面輸入錯誤密碼，When 送出表單，Then 密碼欄位下方顯示『帳號或密碼錯誤』」。**目前沒有自動化元件測試框架**（未安裝 vitest/testing-library），現階段是手動在瀏覽器操作（或由 Claude 透過瀏覽器自動化工具操作）確認，不是跑自動化測試套件產生報告——這是現況記錄，不是決議，要不要加自動化框架是另一個要討論的決定。

### Layer 3（`tauri dev` 手動 smoke test）—— 真實視窗

真實視窗跑一次，確認前兩層真的串得起來。**Claude 沒有工具能看到原生視窗，這層一定要由使用者動手跑**，Claude 只能讀 code 判斷邏輯，不能宣稱「已視覺驗證」。

### Layer 4（真實後端整合測試）—— 對接真實 TPS2

對接真實 TPS2 環境時才驗證，不卡在 mock 階段的 issue 上；沒有可連線環境前，Layer 4 獨立拆成後續 issue，不阻擋 mock 版本先合併。

---

## 已知錯誤碼邊界（TPS2）

驗收/測試時優先覆蓋以下情境，這是目前已知的完整清單（依 TPS2 回覆整理，非我方自行假設）：

| Reason | gRPC / HTTP | 出現在 |
|---|---|---|
| `IAM_ERR_INVALID_CREDENTIALS` | Unauthenticated / 401 | Login |
| `IAM_ERR_USER_LOCKED` | PermissionDenied / 403 | Login（帳號停用） |
| `IAM_ERR_EMAIL_TAKEN` | AlreadyExists / 409 | RegisterTenant |
| `IAM_ERR_WEAK_PASSWORD` | InvalidArgument / 400 | RegisterTenant |
| `IAM_ERR_PROVISION_FAILED` | Internal / 500 | RegisterTenant（交易失敗） |
| `IAM_ERR_TENANT_NOT_ASSIGNED` | PermissionDenied / 403 | SelectTenant（選了不屬於自己的租戶） |
| `IAM_ERR_TENANT_CODE_TAKEN` | AlreadyExists / 409 | CreateTenant（tenant_code 重複） |

這份清單只涵蓋目前已實作的 use case（UC-01、UC-02），之後補上新功能才會有新代碼——新增時直接更新這張表，不要另外開一份。

---

## 驗收查核原則

- **必須同時核對設計文件與實際程式碼**：不能只對照 DoD checklist 打勾，要確認文件（issue、system_design docs）裡描述的機制跟目前程式碼的真實實作一致。文件過期、跟程式碼對不上時，要當成**文件缺陷明確指出**，不要略過或自行腦補文件是對的。
- **審查 PR 要對實際 `git diff`**：用 git 指令直接比對兩個 commit（例如 `git diff <base>..<head>`），不要只信 `gh pr view` 的檔案列表——曾經發生過快取過期、看到的是舊 diff 的狀況。分支若被 force-push 過，本地 remote-tracking ref 可能卡在舊狀態，要用 `+refs` 強制更新後再比對（見 `CLAUDE.md` 的環境注意事項）。
- **審查 PR 不能只看 diff 的 hunk**：diff 顯示的是「改了哪幾行」，但一個改動（例如重新命名/刪除函式）可能會讓 diff 沒顯示到的既有程式碼（呼叫點在別的地方、不在這次改動範圍內）壞掉——曾經發生過一個函式被改名，但檔案裡另一處呼叫舊名稱的地方沒被這次 diff 觸及，審查時差點漏掉。正確做法是把 patch 套用後的完整檔案內容組出來，全域搜尋被改動的符號（函式名、變數名），確認所有呼叫點都還一致，不能只信 diff 本身沒顯示問題就代表沒問題。

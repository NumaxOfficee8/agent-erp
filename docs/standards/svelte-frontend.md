# Svelte 前端規範（`src`）

適用範圍：`src` 底下所有 Svelte/JS 程式碼。跨領域共通規範（依賴方向、四層驗證框架、驗收原則）見 [`CLAUDE.md`](../../CLAUDE.md)。

---

## 一、系統架構分析

- **元件邊界**：Svelte 元件負責呈現與使用者互動，不持有業務邏輯、不直接呼叫 `invoke()`。所有跟 Rust 的溝通、跨元件共用的狀態，一律透過 `store.svelte.js`（或依領域拆分的獨立 store，例如未來的 auth store）匯出的函式進行。元件只依賴 store 暴露的介面，不知道 IPC command 名稱或參數格式。
- **響應式狀態邊界**：用 Svelte 5 runes（`$state`/`$derived`/`$effect`）時，先判斷這個狀態是單一元件內部的（放元件自己的 `$state`），還是跨元件/跨畫面共用的（放 `appState` 這類全域 store）。不要為了方便把明明是區域性的狀態塞進全域 store，也不要因為要跨元件共用就用 prop-drilling 一路往下傳，該用共用 store 就直接用。
- **路由/狀態機**：導覽邏輯集中在 `appState.route` + `navigate(path)`（見 `CLAUDE.md` 的 hash-based 路由決策），畫面切換一律透過 `navigate()`，不要在元件裡直接改 `appState.route`。認證狀態閘門（`get_auth_status()` 回傳的四種狀態）由 `App.svelte` 頂層依狀態 conditionally render 對應畫面，子元件不用重複判斷登入狀態。
- **依賴方向**：元件 → store → `invoke('api_call'|'get_auth_status', ...)`。store 不依賴任何特定元件，元件之間不互相依賴彼此的內部狀態。

---

## 二、系統設計

- **先定義介面再寫實作**：新元件先定義 props（輸入）跟 events/callback（輸出）；新 store 函式先定義簽章與回傳型別（例如 `async function createTenant(input: { tenantName, companyName, tenantCode, taxId }): Promise<void>`），不要邊寫元件邊決定介面。
- **UI 錯誤呈現慣例**（本專案已定案）：
  - 表單驗證錯誤（輸入格式、必填、後端回傳的欄位級錯誤）→ inline 顯示在對應欄位旁邊。
  - 跨畫面/session 類錯誤（token 過期、網路錯誤、系統層級提示）→ `showToast()`。
  - 不要混用：表單欄位錯誤不要丟 toast，全域性錯誤也不要硬塞進某個表單欄位旁邊。
- **錯誤碼對應**：後端（`api_call`）回傳的錯誤結構（`{ code, message }`，`code` 對應 `IAM_ERR_*` 系列或本地 `AGENT_ERR_*`）要在 store 層統一轉換成使用者看得懂的中文訊息，不要在每個元件各自寫一份錯誤碼對照表。
- 進度標記的禁令見 `CLAUDE.md`。

---

## 三、系統驗收測試

Svelte 這邊對應的是 Layer 2（瀏覽器 mock）——表單驗證訊息、路由切換、載入狀態、錯誤呈現位置是否符合上面的慣例。完整的四層框架、Given-When-Then 慣例、已知錯誤碼邊界清單、驗收查核原則都在 [`testing-verification.md`](testing-verification.md)，不要在這裡重複，直接去讀那份。

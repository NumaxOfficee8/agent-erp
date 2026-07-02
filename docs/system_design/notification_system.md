# 跨模組站內通知系統設計說明書 (In-App Notification System)

本設計定義了 AgentERP Shell 如何提供一套統一的 API，使所有業務模組（及 Rust 後端）皆能以一致的方式觸發通知，並根據通知類型自動路由至正確的顯示區域。

---

## 1. 設計目標

- **統一 API**：所有模組無論前端或後端，均使用同一套通知介面，不自行實作 Toast 或 Modal。
- **跨模組來源**：通知可由任何已安裝的模組觸發，亦可由 Rust 後端事件驅動。
- **類型驅動路由**：Shell 根據通知的 `type` 欄位自動決定顯示區域，開發者無需手動指定（可選擇覆蓋）。
- **可稽核持久化**：特定嚴重程度的通知自動寫入 SQLite，提供操作稽核軌跡。

---

## 2. 六種通知類型與嚴重等級

| 類型       | 嚴重等級 | 顏色   | 預設行為           | 說明                                     |
|------------|----------|--------|--------------------|------------------------------------------|
| `success`  | 1（最低）| 綠色   | 自動消失（3 秒）   | 操作成功確認（如：訂單核准完成）          |
| `info`     | 2        | 藍色   | 自動消失（5 秒）   | 一般資訊提示（如：資料同步完成）          |
| `warning`  | 3        | 黃色   | 持續顯示           | 需要注意的警告（如：庫存低於安全水位）    |
| `error`    | 4        | 紅色   | 持續顯示，需手動關閉 | 操作失敗或系統錯誤（如：IPC 呼叫失敗）   |
| `alert`    | 5        | 橙色   | 持續顯示           | 需要採取行動的業務警示（如：訂單逾期未審）|
| `critical` | 6（最高）| 紅色   | 全螢幕 Modal，阻斷所有互動 | 安全性攔截或需要即時授權的操作  |

---

## 3. 五個顯示區域（Display Zones）

### 3.1. Toast Stack（右下角，固定定位）

- **位置**：固定在視窗右下角，`position: fixed; bottom: 36px; right: 20px; z-index: 9000`
- **行為**：由下往上堆疊，最多同時顯示 3 條，超出時最舊的自動捨棄
- **自動消失**：`success` 3 秒後消失，`info` 5 秒後消失
- **適用類型**：`success`, `info`
- **可互動**：點擊 Toast 可提前關閉；若通知附帶 `action`，點擊可導航至目標模組

### 3.2. Alert Banner（agent-main 頂部）

- **位置**：插入 `agent-main` 插槽的頂部，使用 `flex-shrink: 0` 不擠壓對話區
- **行為**：需手動點擊關閉按鈕（`×`）；若附帶 `action`，點擊通知本體可跳轉至指定模組
- **適用類型**：`warning`, `alert`
- **多條疊加**：多個 Banner 從上往下疊加，各自獨立關閉
- **視覺識別**：左側 4px 色條（`warning`：黃色；`alert`：橙色）

### 3.3. Inline Panel Alert（context-panel 內部）

- **位置**：`context-panel` 插槽內，由模組的 context 元件自行決定插入位置
- **行為**：與模組資料緊密綁定（例如：顯示在某個訂單項目上方）；模組元件負責其生命週期管理
- **觸發方式**：模組元件透過 `window.__SHELL__.notify()` 傳入 `zone: 'inline'` 搭配模組內部 DOM 選擇器，**或**由模組元件直接在內部渲染，不使用 Shell API
- **適用類型**：所有類型（模組自定義）

### 3.4. Notification Bell + Drawer（側邊欄 + 抽屜）

- **位置**：`sidebar-rail` 底部固定一個鈴鐺圖示，點擊後從右側滑出通知抽屜 Drawer
- **徽章（Badge）**：紅色圓形徽章顯示未讀通知數量，計算規則詳見第 8 節
- **Drawer 內容**：依時間倒序列出所有歷史通知，支援依模組來源篩選
- **適用類型**：所有持久型通知（`warning`, `error`, `alert`, `critical` 解除後）均自動加入歷史列表

### 3.5. Critical Modal（全螢幕蓋板）

- **位置**：全螢幕半透明黑色蓋板（`z-index: 99999`），中央顯示模態對話框
- **行為**：阻斷所有背景互動，包括鍵盤快捷鍵；必須由使用者明確點擊「確認授權」或「取消」才能關閉
- **適用場景**：安全性操作授權（如：大額付款確認、刪除生產資料）
- **適用類型**：`critical`（僅此類型）
- **限制**：同一時間最多顯示一個 Critical Modal，後續的 `critical` 通知排隊等待

---

## 4. Shell 通知 API 規格（前端）

所有前端模組（JavaScript）透過以下介面觸發通知：

```javascript
window.__SHELL__.notify({
  type: 'warning',            // 必填：通知類型（見第 2 節）
  zone: 'banner',             // 選填：手動指定顯示區域（省略時由 Shell 依類型自動路由）
  title: '庫存警告',           // 必填：通知標題（短句，≤20 字）
  message: '原料 A 剩餘 12 單位，低於安全水位 20 單位', // 必填：詳細說明
  sourceModule: 'inventory',  // 必填：觸發來源的模組 ID
  action: {                   // 選填：通知附帶的操作快捷鍵
    label: '查看庫存',          // 按鈕/連結文字
    target: 'inventory'       // 點擊後切換至的模組 ID
  },
  persistent: true,           // 選填：是否強制持久顯示（覆蓋類型的預設行為）
  timestamp: Date.now()       // 選填：省略時由 Shell 自動填入當前時間戳
});
```

此方法回傳一個通知 ID（`string`），可用於後續程式化關閉通知：

```javascript
const notifId = window.__SHELL__.notify({ ... });
// 稍後關閉此通知
window.__SHELL__.dismiss(notifId);
```

---

## 5. Rust 後端通知（Tauri Events）

Rust 後端（如：背景同步任務、系統監控）可透過 Tauri 事件通道向前端 Shell 發送通知，無需等待使用者互動：

```rust
use tauri::Emitter;

// 定義通知資料結構
#[derive(Clone, serde::Serialize)]
struct ShellNotification {
    r#type: String,
    title: String,
    message: String,
    source_module: String,
    persistent: bool,
    timestamp: u64,
}

// 在任意 Rust 非同步任務中發送通知
app_handle.emit("shell:notify", ShellNotification {
    r#type: "error".to_string(),
    title: "資料同步失敗".to_string(),
    message: "無法連接至 ERP 主機，請檢查網路連線".to_string(),
    source_module: "system".to_string(),
    persistent: true,
    timestamp: std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64,
}).unwrap();
```

前端 Shell 監聽 `shell:notify` 事件，接收後以與前端 API 完全相同的流程處理通知（路由、渲染、持久化）。

---

## 6. 通知資料模型（TypeScript 介面）

```typescript
interface ShellNotification {
  id: string;                  // Shell 自動生成的唯一 ID（UUID v4）
  type: 'success' | 'info' | 'warning' | 'error' | 'alert' | 'critical';
  zone?: 'toast' | 'banner' | 'inline' | 'drawer' | 'modal'; // 省略時自動路由
  title: string;
  message: string;
  sourceModule: string;        // 來源模組 ID，'system' 表示 Rust 後端
  action?: {
    label: string;
    target: string;            // 模組 ID 或外部 URL
  };
  persistent: boolean;
  timestamp: number;           // Unix 毫秒時間戳
  readAt?: number | null;      // 讀取時間；null 表示未讀
  dismissedAt?: number | null; // 關閉時間；null 表示尚未關閉
}
```

---

## 7. 自動路由規則

Shell 依通知 `type` 自動決定顯示區域（若未指定 `zone`）：

| 通知類型   | 預設路由區域      | 同時加入歷史抽屜 |
|------------|-------------------|------------------|
| `success`  | Toast Stack       | 否               |
| `info`     | Toast Stack       | 否               |
| `warning`  | Alert Banner      | 是               |
| `error`    | Alert Banner      | 是               |
| `alert`    | Alert Banner      | 是               |
| `critical` | Critical Modal    | 是（解除後）     |

---

## 8. 通知持久化（SQLite `notifications` 資料表）

嚴重等級 3 以上（`warning`、`error`、`alert`、`critical`）的通知自動持久化至 SQLite，提供稽核軌跡：

```sql
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    source_module TEXT NOT NULL,
    action_label TEXT,
    action_target TEXT,
    timestamp INTEGER NOT NULL,
    read_at INTEGER,
    dismissed_at INTEGER
);
```

`success` 與 `info` 類型通知**不寫入資料庫**，僅存在於前端記憶體中，隨頁面刷新消失。

---

## 9. 徽章數量計算規則

`sidebar-rail` 上的通知鈴鐺徽章數量依以下規則計算：

1. **計數對象**：`notifications` 資料表中，`read_at IS NULL`（未讀）且 `dismissed_at IS NULL`（未關閉）的記錄。
2. **即時更新**：Shell 在每次呼叫 `notify()` 成功後、以及每次關閉通知 Drawer 時重新計算徽章數量。
3. **上限顯示**：徽章最多顯示 `99`，超出時顯示 `99+`。
4. **全部已讀**：使用者開啟通知 Drawer 後，Shell 自動將所有可見通知的 `read_at` 更新為當前時間戳，徽章歸零。
5. **跨模組累計**：徽章數量為**所有模組來源的未讀通知總和**，不區分模組。

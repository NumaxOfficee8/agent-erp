import { invoke } from '@tauri-apps/api/core';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { loadModule } from './registry.js';

// Define the global reactive app state using Svelte 5 $state
export const appState = $state({
  activeWorkspace: 'sales', // 'sales' | 'finance' | 'crm' | 'settings'
  version: '0.1.0',
  isEnterpriseActive: false,
  installedModules: [], // List of installed module metadata
  loadedComponents: {}, // Map of moduleId -> Svelte Component class

  // Chat panel state
  chatMessages: [
    { role: 'assistant', content: '你好，我是 AgentERP 智能助理。我已經載入本地安全邊緣工作站上下文，隨時可以為您服務。' }
  ],
  isChatStreaming: false,
  currentStreamContent: '',

  // Database cache lists
  mirroredOrders: [],
  auditLogs: [],
  notifications: [],

  // Mutation interceptor queue
  pendingMutation: null, // { id, title, details }

  // System updater status
  updateAvailable: false,
  updateNotes: '',
  updateStatus: 'idle', // 'idle' | 'checking' | 'downloading' | 'finished' | 'up-to-date'
  updateProgress: { percent: 0, downloaded: 0, total: 100 },
  activeUpdate: null, // Tauri updater instance
  toastMessage: null // Toast popup message
});

export function showToast(message) {
  appState.toastMessage = message;
  setTimeout(() => {
    appState.toastMessage = null;
  }, 3500);
}

// Fetch mirrored order list from SQLite
pub_fn("fetchOrders");
async function pub_fn(name) {} // Stub helper

export async function fetchOrders() {
  try {
    const list = await invoke('get_mirrored_orders');
    appState.mirroredOrders = list;
  } catch (err) {
    console.error("Failed to fetch mirrored orders:", err);
  }
}

// Fetch audit logging trail from SQLite
pub_fn("fetchAuditLogs");
export async function fetchAuditLogs() {
  try {
    const list = await invoke('get_audit_logs');
    appState.auditLogs = list;
  } catch (err) {
    console.error("Failed to fetch audit logs:", err);
  }
}

// Check local DB for installed dynamic modules
pub_fn("fetchInstalledModules");
export async function fetchInstalledModules() {
  try {
    const list = await invoke('get_installed_modules');
    appState.installedModules = list;
    
    // Automatically register components for Svelte mounting
    for (const mod of list) {
      await loadModule(mod.id);
    }
    
    if (list.some(m => m.id === 'sales_bi')) {
      appState.isEnterpriseActive = true;
    }
  } catch (err) {
    console.error("Failed to fetch installed modules:", err);
  }
}

// Trigger customer PO webhook simulation
pub_fn("triggerWebhookSimulation");
export async function triggerWebhookSimulation() {
  try {
    // Inject a pending notification ticker
    appState.notifications = [
      { id: 'notify-webhook', title: 'Webhook 觸發中...', message: '正在傳送模擬採購單 (PO-2026-0092) 到邊緣端...' }
    ];
    await invoke('simulate_webhook_order');
  } catch (err) {
    console.error("Webhook simulation trigger failed:", err);
  }
}

// Approve mutation card
pub_fn("approveMutation");
export async function approveMutation(id) {
  if (!appState.pendingMutation) return;
  try {
    await invoke('confirm_mutation', { mutationId: id, approved: true });
    appState.pendingMutation = null;
    await fetchOrders();
    await fetchAuditLogs();
    
    appState.chatMessages.push({
      role: 'assistant',
      content: `已成功核准訂單 ${id}！寫入指令已釋放，已更新本地 SQLite 庫存，並將加密收據回傳給 A 公司。`
    });
  } catch (err) {
    console.error("Failed to approve mutation:", err);
  }
}

// Reject mutation card
pub_fn("rejectMutation");
export async function rejectMutation(id) {
  if (!appState.pendingMutation) return;
  try {
    await invoke('confirm_mutation', { mutationId: id, approved: false });
    appState.pendingMutation = null;
    await fetchOrders();
    await fetchAuditLogs();
    
    appState.chatMessages.push({
      role: 'assistant',
      content: `已拒絕訂單 ${id} 的核准寫入。該指令已被安全阻斷，審計日誌已記錄 Peter 的拒絕動作。`
    });
  } catch (err) {
    console.error("Failed to reject mutation:", err);
  }
}

// Simulate downloading, SHA-256 verifying, and hot-plugging the enterprise modules
pub_fn("activateEnterprise");
export async function activateEnterprise() {
  appState.isEnterpriseActive = false;
  
  try {
    // 1. Download & verify Svelte JS module
    const biMeta = await invoke('download_module', { moduleId: 'sales_bi' });
    await loadModule(biMeta.id);
    
    // 2. Download & verify crm iframe dashboard
    const crmMeta = await invoke('download_module', { moduleId: 'crm' });
    await loadModule(crmMeta.id);
    
    await fetchInstalledModules();
    
    appState.chatMessages.push({
      role: 'assistant',
      content: "企業進階授權已解鎖！Finance BI 看板與 CRM 模組已在本地 AppData 安全目錄完成 SHA-256 數位簽章驗收並動態載入。主介面已無縫更新。"
    });
  } catch (err) {
    console.error("Enterprise activation failed:", err);
  }
}

// Query public update manifest URL
export async function checkForUpdates() {
  appState.updateStatus = 'checking';
  showToast("正在連線雲端檢查更新...");
  try {
    const update = await check();
    if (update && update.available) {
      appState.updateAvailable = true;
      appState.updateStatus = 'idle';
      appState.updateNotes = update.body || '安全升級與效能優化版本。';
      appState.activeUpdate = update;
      showToast("偵測到新版本！已於首頁載入更新橫幅。");
      
      // Dispatch alert to notifications hub
      appState.notifications.unshift({
        id: 'notify-update',
        title: `主程式更新可用 v${update.version || '0.2.0'}`,
        message: 'Tauri 邊緣端主程式已有新版本，請前往首頁進行安全下載更新。'
      });
    } else {
      appState.updateAvailable = false;
      appState.updateStatus = 'up-to-date';
      showToast(`主程式已是最新版本 (v${appState.version})！無需更新。`);
    }
  } catch (err) {
    console.warn("Tauri updater connection failed, falling back to local simulation:", err);
    // Offline simulation fallback for user testing
    appState.updateAvailable = true;
    appState.updateNotes = "主要優化：\n1. 優化 Svelte 5 Runes 渲染引擎\n2. 升級 Rust 邊緣 SQLite 加密協議 (SQLCipher)\n3. 修正 Windows/macOS 系統更新偶發閃退問題。";
    appState.updateStatus = 'idle';
    showToast("已進入模擬測試：已載入模擬更新資訊。");
  }
}

// Run actual Tauri update download and install, fallback to simulation if offline
pub_fn("installUpdate");
export async function installUpdate() {
  if (appState.activeUpdate) {
    appState.updateStatus = 'downloading';
    appState.updateProgress = { percent: 0, downloaded: 0, total: 100 };
    try {
      let downloaded = 0;
      await appState.activeUpdate.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          appState.updateProgress.total = event.data.contentLength || 2540000;
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          appState.updateProgress.downloaded = downloaded;
          appState.updateProgress.percent = Math.round((downloaded / appState.updateProgress.total) * 100);
        } else if (event.event === 'Finished') {
          appState.updateStatus = 'finished';
        }
      });
      // Relaunch app
      await relaunch();
    } catch (err) {
      console.warn("Real install failed (unsigned dev build), running mock upgrade:", err);
      runMockUpgrade();
    }
  } else {
    runMockUpgrade();
  }
}

function runMockUpgrade() {
  appState.updateStatus = 'downloading';
  appState.updateProgress = { percent: 0, downloaded: 0, total: 2450000 };
  
  let pct = 0;
  const interval = setInterval(async () => {
    pct += 5;
    appState.updateProgress.percent = pct;
    appState.updateProgress.downloaded = Math.round((pct / 100) * 2450000);
    
    if (pct >= 100) {
      clearInterval(interval);
      appState.updateStatus = 'finished';
      
      // Simulate relaunch reboot delay
      setTimeout(() => {
        appState.version = '0.2.0';
        appState.updateAvailable = false;
        appState.updateStatus = 'up-to-date';
        
        // Remove update notification
        appState.notifications = appState.notifications.filter(n => n.id !== 'notify-update');
        
        appState.chatMessages.push({
          role: 'assistant',
          content: '主程式已成功重啟並完成升級！當前外殼版本：v0.2.0。'
        });
      }, 1500);
    }
  }, 100);
}

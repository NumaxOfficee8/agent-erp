import { appState } from './store.svelte.js';

export async function loadModule(moduleId) {
  // CRM is loaded as a standalone HTML page in an iframe, so it does not need JS mounting
  if (moduleId === 'crm') return;

  const url = `app-module://localhost/modules/${moduleId}_module.js`;
  console.log(`[Registry] Attempting dynamic import for: ${moduleId} from: ${url}`);
  try {
    const module = await import(/* @vite-ignore */ url);
    appState.loadedComponents[moduleId] = module.default;
    
    // Explicitly re-assign to trigger Svelte 5 reactivity updates
    appState.loadedComponents = { ...appState.loadedComponents };
    
    console.log(`[Registry] Successfully dynamic imported module component: ${moduleId}`);
  } catch (err) {
    console.error(`[Registry] Failed to dynamic import module component: ${moduleId}`, err);
  }
}

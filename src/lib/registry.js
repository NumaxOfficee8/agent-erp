import { appState } from './store.svelte.js';

export async function loadModule(moduleId) {
  // CRM is loaded as a standalone HTML page in an iframe, so it does not need JS mounting
  if (moduleId === 'crm') return;

  const url = `app-module://localhost/modules/${moduleId}_module.js`;
  try {
    const module = await import(/* @vite-ignore */ url);
    appState.loadedComponents[moduleId] = module.default;
    console.log(`Successfully dynamic imported module component: ${moduleId}`);
  } catch (err) {
    console.error(`Failed to dynamic import module component: ${moduleId}`, err);
  }
}

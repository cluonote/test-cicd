/** Dev-only Stagewise toolbar (browser element picker → Cursor IDE Bridge). */
export async function initStagewiseToolbar() {
  const { initToolbar } = await import('@stagewise/toolbar')
  initToolbar({ plugins: [] })
}

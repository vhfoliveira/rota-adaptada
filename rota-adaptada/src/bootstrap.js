const mode = new URLSearchParams(location.search).get('modo');
// Dismiss the displayed message without changing the underlying saved state.
document.addEventListener('click', event => {
  if (event.target.closest('button,a,input,select,textarea,summary')) return;
  const message = event.target.closest('.notice,.guide-message.warning,#toast');
  if (!message) return;
  if (message.id === 'toast') message.classList.remove('show');
  else { message.hidden = true; message.style.display = 'none'; }
});
try {
  if (mode === 'planejamento') await import('./main.js');
  else await import('./guided.js');
} catch (error) {
  console.error('Não foi possível abrir o aplicativo.', error);
  document.querySelector('#app').innerHTML = '<main style="max-width:600px;margin:10vh auto;padding:24px;font-family:system-ui"><h1>Não foi possível abrir o aplicativo</h1><p>Confira a conexão e recarregue a página. Seus dados salvos não serão apagados.</p><button type="button" id="retry-app">Tentar novamente</button></main>';
  document.getElementById('retry-app').onclick = () => location.reload();
}
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const {registerAppUpdates} = await import('./pwa-client.js');
  registerAppUpdates();
}

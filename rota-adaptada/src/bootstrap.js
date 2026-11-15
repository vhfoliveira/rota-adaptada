const mode = new URLSearchParams(location.search).get('modo');
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

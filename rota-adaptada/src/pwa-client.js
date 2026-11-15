// Never reload a form without an explicit user action and a successful draft checkpoint.
export function registerAppUpdates() {
  let accepted = false, banner;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (accepted) location.reload();
  });
  navigator.serviceWorker.register('./sw.js').then(reg => {
    const show = () => {
      if (!reg.waiting || banner) return;
      banner = document.createElement('aside');
      banner.className = 'pwa-update';
      banner.setAttribute('role', 'status');
      banner.innerHTML = '<p>Uma nova versão está disponível. Atualize quando terminar esta etapa.</p><button type="button" data-update>Salvar e atualizar</button><button type="button" data-later>Agora não</button>';
      const current = banner;
      const updateButton = current.querySelector('[data-update]');
      const laterButton = current.querySelector('[data-later]');
      document.body.append(current);
      laterButton.onclick = () => { current.remove(); if (banner === current) banner = null; };
      updateButton.onclick = async () => {
        if (updateButton.disabled) return;
        updateButton.disabled = true;
        laterButton.disabled = true;
        const detail = {promise: Promise.resolve(false)};
        try {
          window.dispatchEvent(new CustomEvent('rota:before-update', {detail}));
          if (!await detail.promise) throw Error('Seu preenchimento não pôde ser salvo. Salve ou feche os formulários abertos antes de atualizar.');
          if (!reg.waiting) { location.reload(); return; }
          accepted = true;
          reg.waiting.postMessage({type: 'ACTIVATE_UPDATE'});
        } catch (error) {
          accepted = false;
          current.querySelector('p').textContent = error.message || 'Não foi possível atualizar. Tente novamente quando terminar o preenchimento.';
          updateButton.disabled = false;
          laterButton.disabled = false;
        }
      };
    };
    show();
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) show();
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { reg.update().catch(() => {}); show(); }
    });
  }).catch(() => { /* Offline functionality is optional; form remains usable. */ });
}

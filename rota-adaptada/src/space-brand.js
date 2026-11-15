export const missionBanner = (field = false) => `
<div class="mission-banner ${field ? 'mission-field' : ''}">
  <div class="mission-copy">
    <span class="mission-kicker">NASA SPACE APPS · DADOS PARA O CAMPO</span>
    <${field ? 'h1' : 'h2'}>${field ? 'Do espaço à<br>sua próxima safra.' : 'Uma nova perspectiva<br>para sua próxima safra.'}</${field ? 'h1' : 'h2'}>
    <p>Dados do espaço. Decisões na terra.<br>Explore clima e solo para planejar o que vem a seguir.</p>
    <div class="mission-sources"><span>NASA POWER</span><span>SOILGRIDS</span><span>INTELIGÊNCIA NO CAMPO</span></div>
  </div>
</div>`;

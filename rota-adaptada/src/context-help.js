const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const topic = (title, what, action, example = '', details = '') => Object.freeze({title, what, action, example, details});

// Stable topic IDs are shared by the guided journeys and the advanced workspace.
// These explanations describe current data and behavior, not the retired prototype.
export const helpTopics = Object.freeze({
  location: topic('localização da área', 'É o lugar que será usado na consulta. Um ponto identifica uma localização; não desenha os limites da propriedade.', 'Use o GPS se estiver na área ou escolha a localização no mapa. Confira o município antes de continuar.', 'Se estiver em casa, não use o GPS para representar uma fazenda distante.', 'As condições ZARC são municipais. Clima e estimativas de solo usam o ponto confirmado. Sem um ponto, essas análises ficam pendentes.'),
  map: topic('escolha no mapa', 'O mapa ajuda a apontar onde fica sua área.', 'Busque o município, mova o mapa e marque a propriedade. Confirme o ponto antes de continuar.', 'O centro de uma cidade não representa automaticamente sua lavoura.', 'As malhas municipais são simplificadas. A seleção não é um levantamento de limites ou uma delimitação de talhão. Você também pode informar coordenadas.'),
  privacy: topic('uso da localização', 'A consulta usa a localização informada para buscar informações públicas da região.', 'Confirme a área que deseja analisar. O GPS só é solicitado quando você escolhe usá-lo.', '', 'Clima e solo são consultados na NASA POWER e no SoilGrids; a identificação do município pode usar OpenStreetMap. Rascunhos e planos ficam no navegador deste dispositivo, sem sincronização entre aparelhos.'),
  date: topic('data de plantio', 'É o dia em que você pretende começar o cultivo. Junto com a localização, ele define o período climático a analisar.', 'Informe a data planejada. Se mudar de ideia, volte e edite antes de consultar novamente.', 'Para plantar em 15 de novembro, selecione esse dia no calendário.', 'Na consulta simples, analisamos o histórico da NASA para o mês escolhido no ponto confirmado. No planejamento, a data e o ciclo posicionam o período no histórico; as fases só aparecem quando suas durações estão documentadas. A data também consulta as janelas oficiais do ZARC para o município. Histórico não é previsão do tempo nem garantia de produtividade.'),
  irrigation: topic('disponibilidade de irrigação', 'Indica se a lavoura depende da chuva ou conta com irrigação.', 'Escolha a situação real. Se ainda não souber, mantenha “Ainda não sei” e confira as condições de cada opção.', 'Uma opção que exige irrigação não deve ser interpretada como adequada a uma área que depende somente da chuva.', 'Essa condição é informada por você. O aplicativo não confirma existência, capacidade ou autorização de uso da irrigação.'),
  soil: topic('informações do solo', 'A reserva de água e a classe do solo ajudam a interpretar as condições de plantio.', 'Informe apenas o que conhece. Você pode explorar opções sem confirmar o solo; as pendências continuarão visíveis.', 'Uma estimativa de textura em um mapa não confirma a classe de água disponível exigida pelo ZARC.', 'SoilGrids fornece estimativas regionais. Classes AD e condições oficiais precisam corresponder à sua área. O aplicativo não substitui análise de solo ou confirmação técnica.'),
  zarc: topic('opções oficiais de plantio', 'O ZARC publica condições e períodos de plantio por município, cultura, solo e manejo.', 'Confira as condições da cultura escolhida, especialmente solo, ciclo e irrigação.', '“Risco 20%” é um nível publicado pelo ZARC; não significa 80% de chance de uma safra bem-sucedida.', 'Fonte: MAPA / ZARC, Tábua de Risco. Ausência de registro não é proibição. A consulta não certifica enquadramento para crédito ou seguro; a safra e a atualização da base aparecem nos detalhes.'),
  nasa: topic('histórico climático da NASA', 'São registros históricos de chuva, temperatura e outras variáveis para o ponto consultado.', 'Use o histórico como contexto e observe se os dados estão disponíveis para esta localização.', 'A chuva média de novembro reúne anos passados; não informa quanto vai chover no próximo novembro.', 'Fonte: NASA POWER. A análise é complementar ao ZARC. Dados ausentes não são zero e não devem ser substituídos por clima de outra propriedade.'),
  cycle: topic('duração do ciclo', 'O ciclo define a duração usada no calendário. Nos perfis oficiais, o fim do ciclo de referência pode ser a maturação fisiológica, antes da colheita.', 'Escolha o ciclo correspondente à cultura ou cultivar planejada. Se não souber, salve o rascunho e confirme essa informação.', 'Um ciclo de 100 dias ocupa aproximadamente esse período no planejamento.', 'Confira o ponto final definido na fonte: maturação fisiológica e colheita são etapas diferentes. Os ciclos do catálogo são parâmetros do modelo, não uma previsão exata. Reserve no intervalo seguinte o tempo necessário para secagem, colheita e preparo.'),
  sequence: topic('sequência de cultivos', 'É a ordem das culturas que ocuparão a área ao longo do tempo.', 'Adicione cada cultivo na ordem planejada. Nos perfis oficiais, inclua no intervalo após o fim do ciclo de referência o tempo de secagem, colheita e preparo.', 'Uma cultura inicial seguida de outro cultivo representa duas etapas na mesma área.', 'Adicionar, remover ou reordenar uma etapa altera as datas seguintes. Os planos salvos preservam sua própria sequência.'),
  municipalCrops: topic('culturas do ZARC municipal', 'A lista reúne culturas com registros oficiais para o município na safra disponível, sem selecionar nenhuma por você.', 'Escolha a cultura e um ciclo/manejo documentado para sua região. A origem dos parâmetros aparece nos detalhes do resultado.', '', 'A lista abrange a safra inteira; cada cultivo tem sua própria data. Parâmetros são vinculados por cultura, UF, safra, manejo, grupo e portaria, com versão do documento. Publicações futuras, divergentes ou incompletas permanecem pendentes. Um registro municipal não confirma sozinho as condições de plantio.'),
  officialParameters: topic('ciclos e parâmetros oficiais', 'São durações e critérios extraídos das portarias, conferidos para a cultura, região e safra. Você escolhe uma opção pronta, sem cadastrar parâmetros técnicos.', 'Confira o grupo, o manejo e se o calendário usa um ciclo de referência ou o limite superior de uma faixa publicada.', '', 'Quando a fonte fornece apenas uma faixa, o aplicativo pode usar seu limite superior para planejar a sequência, incluindo o intervalo documentado para emergência quando aplicável. Isso é uma hipótese explícita de calendário, não previsão de colheita. O fim do ciclo de referência pode ser a maturação fisiológica; a fonte nem sempre define quando a área estará liberada. Reserve tempo de secagem, colheita e preparo no intervalo entre cultivos. Grupos sem limite superior ou referência suficiente ficam pendentes. Histórico NASA e indicadores térmicos documentados são complementares ao ZARC; o modelo completo de produtividade e balanço hídrico da portaria não é reproduzido.'),
  interval: topic('intervalo entre cultivos', 'São os dias reservados entre o término da etapa no calendário e o próximo plantio. Em perfis oficiais, a contagem começa no fim do ciclo de referência, que pode ser anterior à colheita.', 'Inclua todo o tempo necessário para secagem, colheita e preparo da próxima operação; confirme esse prazo para sua área.', 'Um intervalo de 7 dias reserva uma semana após o fim da etapa; isso não garante tempo suficiente para liberar a área.', 'O aplicativo desloca o calendário conforme o intervalo. Ele não comprova disponibilidade de máquinas, equipe ou condições operacionais.'),
  delay: topic('atraso do plantio', 'É a diferença, em dias, entre a data inicialmente planejada e o cenário que você quer testar.', 'Informe quantos dias o início atrasou ou pode atrasar.', 'Se o plantio previsto para o dia 10 passou para o dia 22, informe 12 dias.', 'É uma hipótese de simulação. O atraso pode deslocar os cultivos seguintes; não altera sozinho registros de execução no campo.'),
  changes: topic('mudanças permitidas', 'São as escolhas que você aceita rever ao comparar alternativas.', 'Marque somente as mudanças que está disposto a considerar, como outro ciclo ou outra cultura.', 'Se quiser preservar a primeira cultura do planejamento, mantenha essa escolha ao comparar.', 'Permitir uma mudança não a executa. As alternativas dependem do catálogo e dos parâmetros existentes; a viabilidade local ainda precisa ser confirmada.'),
  review: topic('conferência das respostas', 'É uma revisão dos dados que serão usados na consulta ou simulação.', 'Confira área, datas e condições. Edite qualquer informação incorreta antes de continuar.', '', 'Ao alterar uma resposta, os resultados dependentes precisam ser consultados novamente. Isso evita mostrar uma comparação feita com dados antigos.'),
  results: topic('interpretação dos resultados', 'Os resultados mostram o que foi encontrado e as condições que ainda precisam ser confirmadas.', 'Compare as condições e os avisos, não apenas cores ou percentuais.', '“Não avaliado” significa falta de evidência suficiente; não significa risco baixo.', 'Indicações oficiais, histórico climático e cenários de simulação têm significados diferentes. Nenhum deles garante produtividade, lucro ou sucesso da lavoura.'),
  save: topic('salvar o resultado', 'Guardar um resumo permite rever as escolhas e suas condições depois.', 'Confira os dados e use a ação de salvar. Uma alternativa salva deve preservar o planejamento original.', '', 'Planos e rascunhos locais ficam neste navegador e dispositivo. Um arquivo baixado é uma cópia separada. O aplicativo informa se não conseguir gravar; limpar os dados do navegador pode remover os registros locais.'),
  advanced: topic('planejamento avançado', 'É o espaço com todas as ferramentas de cadastro, ciclos e simulação.', 'Use a experiência guiada para receber orientação passo a passo. Abra o painel avançado quando precisar configurar detalhes.', '', 'As duas experiências reutilizam os mesmos cálculos. Informações técnicas e controles adicionais não tornam o resultado uma recomendação agronômica definitiva.'),
  example: topic('demonstração de Vilhena', 'É uma propriedade de exemplo para experimentar o aplicativo.', 'Use o exemplo para conhecer o fluxo. Para analisar sua área, escolha e confirme a localização real.', '', 'Selecionar a demonstração não apaga seus cadastros ou planos. Resultados do exemplo não representam automaticamente sua propriedade.'),
  catalog: topic('catálogo de culturas', 'Reúne culturas e ciclos disponíveis para configurar o planejamento.', 'Escolha a cultura que deseja planejar. Cadastre uma cultura ou ciclo personalizado apenas quando conhecer seus parâmetros.', '', 'Estar no catálogo não comprova indicação oficial para sua região. A consulta ZARC e a existência de parâmetros climáticos são verificações separadas.'),
  customCrop: topic('cultura personalizada', 'É uma cultura adicionada por você ao catálogo local.', 'Informe nome, finalidade, duração e demais parâmetros conhecidos. Não use números inventados para preencher campos.', '', 'O cadastro não cria validação agronômica nem uma indicação oficial ZARC. Parâmetros fornecidos por você precisam ser verificados antes de orientar decisões no campo.'),
  name: topic('nome do cadastro', 'É uma identificação para encontrar a propriedade, o ciclo ou o planejamento depois.', 'Escolha um nome curto e reconhecível.', '“Área do sítio — plantio de novembro”.', 'O nome não é usado para inferir localização, clima ou solo.'),
  plan: topic('planejamento ativo', 'É a sequência de cultivos selecionada para a simulação atual.', 'Confira a propriedade vinculada e escolha o planejamento que deseja analisar.', '', 'Ativar outro plano muda a comparação exibida. Salvar uma nova alternativa preserva o plano original; seus cadastros continuam disponíveis no dispositivo.'),
  suggestions: topic('sugestões do sistema', 'São combinações geradas com o catálogo e os parâmetros do motor existente.', 'Confira cada sequência, suas mudanças e os dados disponíveis antes de salvar.', '', 'A ordem exibida depende dos critérios do modelo. Sugestão não comprova adequação local, produtividade ou lucro e não substitui confirmação técnica.'),
  phases: topic('fases do cultivo', 'Divide o ciclo em etapas para explicar o histórico de estresse calculado pelo modelo.', 'Escolha uma cultura e um ano para ver onde os alertas apareceram.', '', 'As fases e seus parâmetros pertencem ao motor de referência. A leitura é histórica e não uma previsão da próxima safra.'),
  historicalYear: topic('ano histórico', 'É um ano do histórico usado para verificar como o cenário se comportaria com aqueles registros.', 'Selecione um ano para consultar a explicação. Compare também os demais anos disponíveis.', '', 'Um único ano não resume todos os riscos. Lacunas e anos não avaliados permanecem indicados; histórico não é previsão.'),
  export: topic('exportação técnica', 'Cria um arquivo com dados ou relatório do estado atual.', 'Confira a propriedade e o planejamento antes de baixar. Guarde o arquivo em local que reconheça.', '', 'JSON é um formato técnico. Para uma leitura simples, prefira o resumo imprimível. Baixar um arquivo não sincroniza os dados com outro aparelho.'),
  remove: topic('remoção de um cadastro', 'Remove o item escolhido do catálogo ou dos planejamentos locais.', 'Confira qual item está selecionado antes de remover. Guarde uma cópia se precisar consultá-lo depois.', '', 'A ação afeta dados salvos neste navegador. Uma explicação de ajuda não executa a remoção.'),
});

export function helpButton(id) {
  const item = helpTopics[id];
  if (!item) throw new Error(`Unknown context help topic: ${id}`);
  return `<button type="button" class="context-help-button" data-help="${escape(id)}" aria-label="Ajuda sobre ${escape(item.title)}" aria-haspopup="dialog">?</button>`;
}

export function helpContent(id) {
  const item = helpTopics[id];
  if (!item) throw new Error(`Unknown context help topic: ${id}`);
  return `<div class="context-help-heading"><h2 id="context-help-title">${escape(item.title)}</h2><button type="button" class="context-help-close" data-help-close aria-label="Fechar ajuda">Fechar ×</button></div><div class="context-help-content"><h3>O que é?</h3><p>${escape(item.what)}</p><h3>O que você precisa fazer?</h3><p>${escape(item.action)}</p>${item.example ? `<h3>Exemplo</h3><p>${escape(item.example)}</p>` : ''}${item.details ? `<details><summary>Fonte e detalhes</summary><p>${escape(item.details)}</p></details>` : ''}</div>`;
}

// Describe the control's surrounding subject, not its changing DOM position.
// A source update can replace the original card while its help stays open.
function helpIdentity(button) {
  const identity = [button.dataset.help, button.dataset.helpInstance || ''];
  for (let node = button.parentElement; node && node.tagName !== 'BODY'; node = node.parentElement) {
    if (node.id) { identity.push(`#${node.id}`); break; }
    if (!node.matches('article,section,.guide-label,.guide-action,.guide-card-head,.guide-stage,.context-help-field,.context-help-action,.help-tab-item,nav,footer')) continue;
    const field = node.querySelector('label[for]');
    const control = node.querySelector('input[id],select[id],button[id]:not([data-help])');
    const action = node.querySelector('[data-culture],[data-strategy],[data-switch-tab]');
    const heading = node.querySelector('h1,h2,h3');
    identity.push([
      node.tagName,
      node.dataset.helpContext || '',
      field?.htmlFor || control?.id || '',
      action?.getAttribute('data-culture') || action?.getAttribute('data-strategy') || action?.getAttribute('data-switch-tab') || '',
      heading?.textContent.trim() || '',
    ]);
  }
  return JSON.stringify(identity);
}

const mounted = new WeakMap();
export function mountContextHelp(root = document) {
  if (mounted.has(root)) return mounted.get(root);
  const doc = root.ownerDocument || root;
  const dialog = doc.createElement('dialog');
  dialog.id = 'context-help-dialog';
  dialog.className = 'context-help-dialog';
  dialog.setAttribute('aria-labelledby', 'context-help-title');
  doc.body.append(dialog);
  let trigger, triggerIdentity, triggerOrdinal = 0;
  const restoreFocus = () => {
    const replacement = !trigger?.isConnected && triggerIdentity
      ? [...root.querySelectorAll('button[data-help]')].filter(button => helpIdentity(button) === triggerIdentity)[triggerOrdinal]
      : null;
    if (trigger?.isConnected) trigger.focus({preventScroll: true});
    else if (replacement) replacement.focus({preventScroll: true});
    else {
      const heading = doc.querySelector('main h1, main h2');
      if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({preventScroll: true}); }
    }
    trigger = null;
    triggerIdentity = null;
  };
  const close = () => { if (dialog.open) dialog.close(); };
  const openHelp = event => {
    const button = event.target.closest?.('button[data-help]');
    if (!button || !root.contains(button) || !helpTopics[button.dataset.help]) return;
    event.preventDefault();
    event.stopPropagation();
    trigger = button;
    triggerIdentity = helpIdentity(button);
    triggerOrdinal = [...root.querySelectorAll('button[data-help]')].filter(candidate => helpIdentity(candidate) === triggerIdentity).indexOf(button);
    dialog.innerHTML = helpContent(button.dataset.help);
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('[data-help-close]').focus();
  };
  const dialogClick = event => {
    if (event.target.closest('[data-help-close]')) close();
    else if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    }
  };
  root.addEventListener('click', openHelp, true);
  dialog.addEventListener('click', dialogClick);
  dialog.addEventListener('close', restoreFocus);
  const cleanup = () => {
    close();
    root.removeEventListener('click', openHelp, true);
    dialog.remove();
    mounted.delete(root);
  };
  mounted.set(root, cleanup);
  return cleanup;
}

// Explicit selectors keep help aligned with current controls instead of guessing
// meaning from labels. A repeated row gets one help per subject, not per value.
const advancedHelp = [
  ['#btn-toggle-new-prop,#btn-use-gps,#btn-run-auto-lookup,#btn-save-activate-new-prop', 'location', 'action'],
  ['#np-lat,#np-lon,#np-mun', 'location', 'field'],
  ['#np-name,#nc-name,#ncycle-name,#nplan-name', 'name', 'field'],
  ['#np-soil-select,[data-zarc-soil]', 'soil', 'field'],
  ['[data-zarc-management]', 'irrigation', 'field'],
  ['#nplan-base-date,#sys-sug-date,#plan-base-date,#nc-start,#nc-end,[data-zarc-date],[data-stage-field="plannedSowDate"]', 'date', 'field'],
  ['#plan-op-interval,#nplan-interval,#sys-sug-interval,[data-stage-field="intervalDays"]', 'interval', 'field'],
  ['#plan-delay-slider', 'delay', 'field'],
  ['#nc-cycle,#nc-early-cycle,#ncycle-days,[data-nplan-stage-group]', 'cycle', 'field'],
  ['#ncycle-crop,[data-nplan-stage-crop],#nc-role,#nc-tolerance', 'catalog', 'field'],
  ['#nplan-prop,#sys-sug-prop', 'plan', 'field'],
  ['#sel-explain-strategy', 'results', 'field'],
  ['#sel-explain-stage', 'phases', 'field'],
  ['#btn-toggle-new-cycle,[data-add-cycle-for-crop],[data-open-cycle-for-stage],#btn-save-new-cycle', 'cycle', 'action'],
  ['#btn-toggle-new-crop,#btn-save-new-crop', 'customCrop', 'action'],
  ['#btn-toggle-new-planning,#btn-save-new-planning', 'plan', 'action'],
  ['#btn-inline-system-suggest', 'suggestions', 'action'],
  ['#btn-nplan-add-stage', 'sequence', 'action'],
  ['#btn-reset-demo', 'example', 'action'],
  ['#btn-export-state,#btn-download-nasa-json,#btn-download-html-direct,#modal-download-html-btn', 'export', 'action'],
  ['#btn-open-report,#btn-screen4-print,#btn-open-report-bottom,#modal-print-btn', 'save', 'action'],
  ['#btn-nasa-info,#btn-modal-refresh-nasa', 'nasa', 'action'],
  ['.soil-cards-grid,.summary-kpis-grid>.kpi-card:nth-child(2)', 'soil', 'card'],
  ['.summary-kpis-grid>.kpi-card:first-child', 'location', 'card'],
  ['.nasa-live-card', 'nasa', 'card'],
  ['#zarc-region-catalog', 'zarc', 'card'],
  ['.catalog-crop-card', 'catalog', 'card'],
  ['.succession-builder-box,.planning-succession-chain', 'sequence', 'card'],
  ['.preserved-checks-grid,.preserved-checks', 'changes', 'card'],
  ['.delay-control-box,.inline-delay-switcher', 'delay', 'card'],
  ['.strategy-card', 'results', 'card'],
  ['.year-selector-strip', 'historicalYear', 'card'],
  ['.phases-cards-grid', 'phases', 'card'],
  ['.playing-card', 'suggestions', 'card'],
];

export function annotateAdvancedHelp(root = document) {
  for (const [selector, id, placement] of advancedHelp) {
    for (const element of root.querySelectorAll(selector)) {
      const target = placement === 'field' ? element.closest('label') || element : element;
      if (target.dataset.contextHelpAttached) continue;
      target.dataset.contextHelpAttached = id;
      if (placement === 'card') {
        target.classList.add('has-context-help');
        target.insertAdjacentHTML('beforeend', helpButton(id));
      } else {
        const wrapper = target.ownerDocument.createElement('div');
        wrapper.className = placement === 'field' ? 'context-help-field' : 'context-help-action';
        target.before(wrapper);
        wrapper.append(target);
        wrapper.insertAdjacentHTML('beforeend', helpButton(id));
      }
    }
  }
}

export function mountAdvancedHelp(root = document) {
  const unmount = mountContextHelp(root);
  annotateAdvancedHelp(root);
  let queued = false;
  const observer = new MutationObserver(records => {
    if (queued || !records.some(record => !record.target.closest?.('.context-help-dialog'))) return;
    queued = true;
    queueMicrotask(() => { queued = false; annotateAdvancedHelp(root); });
  });
  observer.observe(root, {childList: true, subtree: true});
  return () => { observer.disconnect(); unmount(); };
}

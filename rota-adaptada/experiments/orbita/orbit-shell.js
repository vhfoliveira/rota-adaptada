const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

const paths = {
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  plans:'<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 2v4m8-4v4M4 10h16m-11 4h2m3 0h2m-7 3h2"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  change:'<path d="M4 7h12l-3-3m7 13H8l3 3M16 7l-3 3M8 17l3-3"/>',
  leaf:'<path d="M20 4C9 2 3 7 5 15c7 6 16 0 15-11Z"/><path d="M4 21 15 10"/>',
  settings:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  layers:'<path d="m12 3 10 6-10 6L2 9Zm-9 11 9 5 9-5M3 18l9 5 9-5"/>',
  book:'<path d="M12 5v16M3 4c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2Z"/>',
};
export const icon = name => `<svg class="orbit-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.layers}</svg>`;

const routes = [
  {id:'home',label:'Visão geral',icon:'home',href:'./'},
  {id:'library',label:'Meus planejamentos',icon:'plans',href:'./?visao=planos'},
  {id:'planning',label:'Criar planejamento',icon:'plus',href:'./?acao=planejar'},
  {id:'adaptation',label:'Simular mudanças',icon:'change',href:'./?acao=adaptar'},
  {id:'discovery',label:'Explorar culturas',icon:'leaf',href:'./?modo=campo'},
  {id:'advanced',label:'Painel avançado',icon:'settings',href:'./?modo=planejamento'},
];

export function workspaceSidebar({active='home'}={}) {
  const link = route => `<a class="orbit-nav-link ${active===route.id?'is-active':''}" href="${route.href}" data-workspace-route="${route.id}" ${active===route.id?'aria-current="page"':''}>${icon(route.icon)}<span>${route.label}</span>${active===route.id?'<i aria-hidden="true"></i>':''}</a>`;
  return `<a class="orbit-skip" href="#workspace-content">Ir para o conteúdo</a><aside class="orbit-sidebar" id="workspace-sidebar" aria-label="Menu principal"><a class="orbit-brand" href="./" data-workspace-route="home"><span class="orbit-brand-symbol">${icon('leaf')}</span><span>Rota Adaptada<small>INTELIGÊNCIA PARA CULTIVAR</small></span></a><div class="orbit-workspace-label"><span class="orbit-workspace-dot"></span>Meu espaço de planejamento</div><nav aria-label="Navegação principal"><p class="orbit-nav-caption">ESPAÇO DE TRABALHO</p>${routes.slice(0,2).map(link).join('')}<p class="orbit-nav-caption">DA IDEIA AO CAMPO</p>${routes.slice(2,5).map(link).join('')}<p class="orbit-nav-caption">FERRAMENTAS</p>${link(routes[5])}</nav><div class="orbit-sidebar-bottom"><div class="orbit-science-mark">${icon('globe')}<span>Dados do espaço.<br><strong>Decisões na terra.</strong></span></div><div class="orbit-team"><img src="./branding/interplarios.png" width="28" height="28" alt=""><span>Equipe Interplários<small>NASA Space Apps</small></span><span class="orbit-version">02</span></div></div></aside><button type="button" class="orbit-menu-backdrop" aria-label="Fechar menu" hidden></button>`;
}

export function workspaceTopbar({section='Meu espaço',title='Visão geral',actions=''}={}) {
  return `<header class="orbit-topbar"><div class="orbit-breadcrumb"><button type="button" class="orbit-menu-button" aria-label="Abrir menu" aria-controls="workspace-sidebar" aria-expanded="false">${icon('menu')}</button><span>${escape(section)}</span><span class="orbit-breadcrumb-divider">/</span><strong>${escape(title)}</strong></div><div class="orbit-top-actions"><button type="button" class="orbit-search-trigger" aria-label="Buscar ações">${icon('search')}<span>Buscar ações</span><kbd>Ctrl K</kbd></button>${actions}<span class="orbit-avatar" aria-label="Espaço local">RA</span></div></header>`;
}

let cleanup;
export function bindWorkspaceShell(root,{navigate}={}) {
  cleanup?.();
  const sidebar=root.querySelector('.orbit-sidebar'), toggle=root.querySelector('.orbit-menu-button'), backdrop=root.querySelector('.orbit-menu-backdrop');
  const setMenu=open=>{sidebar?.classList.toggle('is-open',open);toggle?.setAttribute('aria-expanded',String(open));if(backdrop)backdrop.hidden=!open;if(open)sidebar?.querySelector('.is-active')?.focus();};
  toggle?.addEventListener('click',()=>setMenu(toggle.getAttribute('aria-expanded')!=='true'));
  backdrop?.addEventListener('click',()=>{setMenu(false);toggle?.focus();});
  if(navigate)root.querySelectorAll('[data-workspace-route]').forEach(link=>link.addEventListener('click',event=>{
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();setMenu(false);navigate(link.dataset.workspaceRoute,link.href);
  }));
  const dialog=document.createElement('dialog');
  dialog.className='orbit-command';dialog.setAttribute('aria-labelledby','orbit-command-title');
  dialog.innerHTML=`<div class="orbit-command-heading"><h2 id="orbit-command-title">O que você quer fazer?</h2><button type="button" data-command-close aria-label="Fechar busca">${icon('close')}</button></div><label class="orbit-command-input">${icon('search')}<input type="search" placeholder="Busque uma ação…" aria-label="Filtrar ações"></label><nav aria-label="Ações disponíveis">${routes.map(route=>`<a href="${route.href}" data-command-route="${route.id}">${icon(route.icon)}<span>${route.label}</span>${icon('arrow')}</a>`).join('')}</nav><p class="orbit-command-empty" hidden>Nenhuma ação encontrada. Tente “planejamento” ou “culturas”.</p><footer>Esc para fechar · Tab para navegar</footer>`;
  root.append(dialog);
  dialog.querySelector('[data-command-close]').onclick=()=>dialog.close();
  const input=dialog.querySelector('input');
  input.oninput=()=>{const term=input.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();let count=0;dialog.querySelectorAll('[data-command-route]').forEach(link=>{link.hidden=!link.textContent.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(term);if(!link.hidden)count++;});dialog.querySelector('.orbit-command-empty').hidden=count>0;};
  dialog.querySelectorAll('[data-command-route]').forEach(link=>link.onclick=event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;if(navigate){event.preventDefault();dialog.close();navigate(link.dataset.commandRoute,link.href);}});
  const openSearch=()=>{setMenu(false);dialog.showModal();input.focus();};
  root.querySelector('.orbit-search-trigger')?.addEventListener('click',openSearch);
  const keydown=event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(!dialog.open)openSearch();}if(event.key==='Escape'&&sidebar?.classList.contains('is-open')){setMenu(false);toggle?.focus();}if(event.key==='Tab'&&sidebar?.classList.contains('is-open')){const links=[...sidebar.querySelectorAll('a')];if(event.shiftKey&&document.activeElement===links[0]){event.preventDefault();links.at(-1).focus();}else if(!event.shiftKey&&document.activeElement===links.at(-1)){event.preventDefault();links[0].focus();}}};
  document.addEventListener('keydown',keydown);
  cleanup=()=>{document.removeEventListener('keydown',keydown);dialog.remove();};
}

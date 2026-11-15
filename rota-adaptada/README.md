# Rota Adaptada

Aplicação de criação de planejamento agrícola, consulta de opções de plantio e
comparação de mudanças. Usa dados NASA POWER, base municipal ZARC/MAPA, estimativas SoilGrids e
localização confirmada pelo usuário. Vilhena/RO permanece como demonstração
explícita; dados ou regras ausentes são apresentados como **não avaliados**.

## Executar

Na pasta `rota-adaptada`, com Node.js 22:

```bash
npm ci
npm run dev
npm test
npm run build
```

O Vite abre o servidor local na porta 5178. O build estático fica em `dist/`.
O estado do produtor é salvo no navegador com IndexedDB. No ambiente Docker,
o serviço `zarc-updater` mantém a base oficial em um volume separado; o frontend
também inclui uma cópia inicial para hospedagem estática.

## Entradas e jornadas

`index.html` carrega `src/bootstrap.js`, que seleciona a experiência pela URL:

| URL | Módulo | Comportamento |
| --- | --- | --- |
| `/` | `src/guided.js` | Visão geral Órbita com navegação persistente, indicadores locais, ações e retomadas. |
| `?visao=planos` | `src/guided.js` | Biblioteca com busca por nome/município e filtros de planos reais e exemplos. |
| `?acao=planejar` / `?acao=adaptar` | `src/guided.js` | Acesso direto à criação ou à adaptação. |
| `?demo=planejamento` | `src/guided.js` | Inicia ou oferece retomar o exemplo de criação em Vilhena. |
| `?modo=campo` | `src/guided.js` | Consulta guiada de plantio, retomando seu rascunho quando existir. |
| `?modo=planejamento` | `src/main.js` | Painel avançado de planejamento. |
| `?modo=planejamento&plano=<id>` | `src/main.js` | Abre o plano salvo correspondente com sua propriedade e suas decisões. |

A experiência Órbita usa menu lateral no computador e menu recolhível no celular. A busca de ações abre pelo botão do cabeçalho ou por Ctrl/Cmd + K. O painel avançado mantém seus módulos em abas acessíveis por teclado; `?modo=planejamento&aba=0..4` abre um módulo específico.

Celular e computador usam as mesmas jornadas. A instalação PWA abre a visão geral,
conforme `public/manifest.webmanifest`.

- **Criar meu planejamento:** confirmar ponto da área → escolher cultivos, ciclos,
  data e intervalo → revisar → ver e salvar o calendário original, sem atraso.
  O nome é opcional; solo desconhecido permanece pendente. O resultado oferece
  **Simular atraso**, **Ver este plano em detalhes** e **Baixar resumo**.
- **Ajustar um planejamento existente:** escolher plano salvo → informar atraso e
  mudanças permitidas → revisar → comparar e salvar uma alternativa. O progresso
  tem quatro etapas; a edição de cultivos e datas fica disponível na revisão.
  Sem plano salvo, a interface encaminha para criar um.
- **Ainda não sei o que plantar:** confirmar área → informar data e condições → revisar
  → explorar opções municipais ZARC → entender e baixar o resumo.
- **Planejamento avançado:** cadastros de propriedade, culturas e ciclos,
  calendário original no passo 3, simulação de atraso e comparação no passo 4,
  e explicação histórica com relatório imprimível no passo 5. O passo 3 mantém
  datas e condições sem o atraso simulado, mesmo após testar mudanças no passo 4.
  As permissões de mudança, inclusive por etapa, ficam junto da comparação.
  Originais e alternativas salvos pelo guia também ficam disponíveis aqui.
  Abrir um plano não herda o atraso do plano que estava ativo anteriormente.

Consulte [a experiência autoguiada](docs/GUIA_AUTOGUIADO.md) para o roteiro de
interações e [o contrato do motor](docs/MOTOR_CENARIOS.md) para limites e integração.

## Fontes e armazenamento

As consultas NASA POWER e SoilGrids usam o ponto confirmado. Cada solicitação consulta a API com cache desativado. Uma falha climática
não reutiliza respostas anteriores. O guia consulta até o fim do
ano anterior; o painel avançado pode solicitar até a data atual. O período exibido
reflete os registros disponíveis. Não há série NASA embarcada.

A descoberta municipal pode funcionar sem ponto e sem classe de solo confirmada,
exibindo as condições pendentes. Criação e adaptação exigem ponto confirmado e ciclos
explicitamente escolhidos. Culturas ZARC sem modelo climático continuam visíveis,
com a limitação informada. Sem evidência suficiente, o motor não indica uma opção
como melhor. Histórico não é previsão, e percentuais ZARC não são chance geral de
sucesso. Veja [a documentação ZARC](docs/ZARC.md).

Rascunhos, coordenadas informadas e planos salvos ficam neste dispositivo.
Os objetivos `planning`, `adaptation` e `discovery` usam `guided-drafts-v1` no
object store `workspace`; exemplos usam `guided-demo-drafts-v1`, e planos usam
`state`. Demos antigas são migradas atomicamente; em caso de coexistência, a mais
recente é retomada e a outra é preservada na chave de backup
`guided-demo-drafts-legacy-backup-v1`. Não há sincronização entre aparelhos.
Resultados de consulta não são retomados como atuais: o guia pede nova revisão
e consulta. Salvar uma alternativa preserva o plano original. O salvamento de um
original é idempotente; editar um original já salvo pelo guia cria uma cópia.
Falhas de gravação exibem erro e não são apresentadas como sucesso. A criação
permite salvar o calendário enquanto a NASA carrega, mantendo o histórico pendente.

O exemplo usa milho de primeira safra consorciado com braquiária, ciclo de
referência de 120 dias, seguido de feijão de segunda safra, 80 dias, com início
em 01/11/2026 e intervalo demonstrativo de 7 dias. O exemplo consulta a NASA ao vivo, assim como uma área real. O solo permanece
desconhecido. Calendário, histórico e condições ZARC não demonstram superioridade
agronômica; o fim do ciclo não garante a data de colheita.

## Instalação e atualizações PWA

Publique `dist/` em **HTTPS** para GPS, service worker e instalação. No Android,
use o menu do navegador para instalar. No iPhone, use Safari → Compartilhar →
Adicionar à Tela de Início. A disponibilidade depende do navegador.

O build gera um service worker versionado que armazena a interface e seus arquivos
estáticos. Após a primeira abertura online, a interface pode abrir offline;
novas consultas dependem da internet. O worker não armazena consultas de localização
ou respostas das APIs. Atualizações exigem ação explícita e salvamento bem-sucedido
do preenchimento; no painel avançado, salve ou feche os editores abertos. Caches de
versões anteriores são preservados para abas ainda em uso. O desenvolvimento não
registra service worker: valide instalação e offline usando o build.

Validação em dispositivo: permitir/negar GPS, conferir ponto e precisão, consultar
com e sem solo, retomar rascunhos, instalar, fechar e reabrir offline. Conferir
Android/Chrome e iPhone/Safari antes de distribuir.

## Idioma e tradução (PT-BR / EN)

A aplicação usa **PT-BR como projeto principal** e mantém a versão em inglês como uma camada isolada de dicionário em `src/i18n/en.json` via `src/i18n.js`:

- **Detecção e alternância:** na primeira visita, o idioma é detectado pelo navegador (`navigator.languages` / `navigator.language`, ativando `en` somente para localidades `en*` e `pt-BR` nos demais casos). O botão **PT / EN** no cabeçalho alterna o idioma sem recarregar nem perder o rascunho em andamento, salvando a preferência em `localStorage` (`rota-adaptada:lang`).
- **Como desenvolver (foco 100% em PT-BR):** todo texto exibido na interface em JS deve usar `t('Texto em PT-BR')` (ou `t('Etapa {step} de {total}', { step, total })`) e textos estáticos no `index.html` devem usar `data-i18n` (ou `data-i18n-content` / `data-i18n-placeholder`). Se uma frase ainda não existir em `src/i18n/en.json`, `t()` retorna o próprio texto em PT-BR automaticamente. Nunca envolva IDs internos, chaves do IndexedDB ou parâmetros técnicos em `t(...)`.
- **Como traduzir:** quem traduz trabalha exclusivamente em `src/i18n/en.json`, mapeando `"Texto em PT-BR": "English text"`. Execute `npm run i18n:check` para listar frases marcadas com `t(...)` / `data-i18n` que ainda não possuem tradução.
- **Instrução para I.A.:** **não desenvolver, editar nem adicionar entradas em `src/i18n/en.json`** durante tarefas de implementação, ajuste de fluxo ou criação de telas (a menos que o usuário solicite explicitamente traduzir textos). Toda implementação feita por I.A. deve ocorrer apenas em PT-BR usando `t(...)` e `data-i18n`.

## ServerOS

Na raiz do repositório, `./deploy/serveros.sh` executa build e testes, preserva
backup e verifica o serviço. Veja [as instruções de implantação](../deploy/README.md).

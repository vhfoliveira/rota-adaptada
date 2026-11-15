# Validação dos fluxos ativos

Use uma origem local de teste com dados demonstrativos. Não apague o IndexedDB
de um perfil com dados do produtor. A entrada é `index.html` → `src/bootstrap.js`.

## Entradas e navegação

| Entrada | Comportamento esperado |
| --- | --- |
| `/` | Criar planejamento como entrada principal; ajustar plano salvo e descobrir culturas como alternativas |
| `?demo=planejamento` | Exemplo explícito de criação em Vilhena; rascunho separado dos dados reais |
| `?modo=campo` | Abre/retoma a consulta guiada de culturas |
| `?modo=planejamento` | Painel avançado separado, com cinco áreas de navegação |
| `?modo=planejamento&plano=<id>` | Abre o plano salvo indicado, com suas próprias datas e permissões |
| Link do guia para o painel | Aguarda o salvamento do rascunho |
| Arquivo/caminho ausente no Nginx | HTTP 404, sem retornar HTML da aplicação |

O painel avançado continua ativo, inclusive para abrir planos salvos no guia.
Não há outra entrada móvel, observatório ou laboratório de simulação.

## Roteiro no navegador

1. Abra a raiz e confira a hierarquia dos objetivos. Em um navegador de teste
   sem planos, **Ajustar um planejamento existente** deve oferecer criar um.
2. Abra `?demo=planejamento` e percorra as quatro etapas: localização, cultivos e
   datas, revisão e calendário. Confira original com atraso zero, ciclo do milho
   de 120 dias e feijão de 80 dias. O exemplo e o solo desconhecido ficam visíveis.
3. Salve o original. Clique novamente ou recarregue: o mesmo salvamento não pode
   duplicar o plano. Abra **Ver este plano em detalhes** e confira as datas no
   avançado. Volte ao guia; **Editar uma cópia** deve preservar o original.
4. No original salvo, escolha **Simular atraso**, informe 12 dias e autorize
   ciclos mais curtos. O progresso de adaptação tem quatro etapas. Pela revisão,
   confira também a edição opcional de cultivos. Compare as datas com a tabela
   de referência em [GUIA_AUTOGUIADO.md](GUIA_AUTOGUIADO.md), selecione a alternativa
   com milho de 100 dias e salve. O original deve continuar sem atraso, e abrir a
   alternativa não pode reaplicar os 12 dias.
5. Use **Ainda não sei o que plantar** para consultar município/data, com e sem
   ponto. Confira safra, condições oficiais, ajuda e resumo HTML. Sem ponto,
   NASA/SoilGrids não devem ser consultados.
6. Abra uma ajuda, feche com Escape e confira foco e valores. Edite uma resposta:
   resultados antigos devem ser invalidados. Rascunhos reais e exemplos devem
   reaparecer separadamente após recarregar. Retomar resultados pede revisão.
7. Simule NASA lenta ou indisponível: o calendário original continua salvável,
   com histórico pendente. Simule falha de IndexedDB: não pode aparecer sucesso.
   Durante gravação, atualizações de fontes não podem reabilitar salvamentos
   duplicados nem atribuir um plano salvo às respostas que foram editadas depois.
8. No painel, percorra Propriedade, Culturas, Planejamento, Comparação e
   Explicação. Troque entre dois planos com atrasos diferentes: cada um deve
   conservar seu próprio atraso. Abra o resumo imprimível.
9. Em um novo planejamento avançado, preencha culturas/ciclos e gere sugestões. Altere a
   data, intervalo ou etapas: as cartas anteriores devem desaparecer. Gere de
   novo e confira que correspondem aos valores novos. Repita cancelando enquanto
   a consulta está em andamento: a resposta antiga não pode reabrir as cartas.
10. No cadastro de propriedade, consulte coordenadas, depois altere latitude ou
   longitude. O resultado anterior e seu botão de salvar devem desaparecer.
   Faça nova consulta e selecione solo “Não informado”: salvar deve preservar a
   ausência de solo. Fechar o cadastro durante a consulta impede retorno tardio.
11. Confira o guia e o painel em largura de celular. Abra o mapa e confirme o
   ponto explicitamente; GPS negado ou indisponível deve manter a alternativa
   manual. Não solicite a localização real para testar o exemplo.
12. Prepare um exemplo legado em `guided-drafts-v1` num perfil de teste. A leitura
   deve movê-lo para `guided-demo-drafts-v1`, sem retorná-lo entre rascunhos reais.
   Com duas versões do mesmo objetivo, retome a mais recente e confirme a outra
   na chave `guided-demo-drafts-legacy-backup-v1`. Falha da transação não pode
   apagar fonte, destino ou backup.
13. Consulte o ponto de Vilhena em uma jornada real e depois no exemplo, e repita
   na ordem inversa. Os caches não podem misturar a fonte ao vivo com a série
   demonstrativa 2013–2024. Trocar de jornada enquanto o exemplo carrega não deve
   permitir que uma resposta tardia substitua o novo preenchimento.

## Verificações automatizadas

Na pasta `rota-adaptada`, execute `npm test` e `npm run build`. O teste
`source-graph.test.js` percorre o entrypoint real e os imports dinâmicos: falha
se houver import local ausente, dependência não declarada ou código em `src/`
que não pertence a nenhum fluxo ativo. Testes exclusivos das funcionalidades
retiradas também foram removidos.

Os testes de planejamento guiado cobrem criação sem atraso, salvamento
idempotente, ajuste posterior autorizado, snapshots oficiais, concorrência,
falha de armazenamento e migração de demos antigas. Testes de ativação verificam
que abrir um plano respeita sua propriedade e suas decisões. Esses testes não
substituem o roteiro de navegador nem testes com usuários.

Na raiz, execute:

```bash
python3 -m unittest discover -s rota-adaptada/scripts -p 'test_*.py'
./deploy/serveros.sh --check
```

O segundo comando verifica sintaxe e empacotamento sem publicar. Para instalação
e atualização offline, teste o build em HTTPS conforme o
[guia autoguiado](GUIA_AUTOGUIADO.md), incluindo rascunho aberto durante atualização.
O roteiro técnico não substitui os testes com pessoas leigas nem validação
agronômica.

## Validação — 15/11/2026

Executado `tests/browser-smoke.mjs` em Chromium com contextos temporários,
sem acessar o perfil ou os dados pessoais do navegador. Foram conferidas as
larguras de **1280 px**, **390 px** e **360 px**. Não foram observados erros
JavaScript de página nem rolagem horizontal nas telas verificadas.

- **Demonstração em computador e celular:** criação do original, salvamento,
  simulação de 12 dias com ciclos mais curtos, escolha e salvamento de alternativa
  e abertura do plano exato no avançado. O original permaneceu preservado e o
  atraso não foi reaplicado ao abrir a alternativa.
- **Preenchimento real em 360 px:** entrada manual de Vilhena/RO e coordenadas
  `-12.7405, -60.1458`, data `2026-11-01`, seleção de cultura e ciclo pela
  interface, erros junto aos campos de ciclo/intervalo com foco correto, ajuda
  por Enter/Escape e restauração de foco. Recarregar e retomar preservou os dados.
- **Um e dois cultivos:** foi salvo um plano de um cultivo com atraso zero;
  editar uma cópia e adicionar o segundo cultivo preservou o primeiro plano.
  A adaptação posterior abriu no avançado com atraso zero e sem selo de exemplo.
- **Armazenamento e continuidade no avançado:** troca entre planos com atrasos
  diferentes, recarga, link com ID inexistente, falha de gravação por quota e
  nova tentativa, além de proteção de saída com cadastro não confirmado.

A revisão posterior identificou e corrigiu duas condições de corrida no guia.
Reproduções pontuais com conclusão de transação atrasada em 1,5 segundo confirmaram
que o atalho para descobrir culturas não substitui uma navegação posterior e que
voltar/editar durante o salvamento do original permite salvar a cópia. A regressão
de edição durante gravação foi acrescentada ao smoke; não houve nova execução
completa da suíte de navegador depois dessa inclusão.

As requisições externas foram bloqueadas no teste. O ZARC foi carregado da base
local da aplicação. A demonstração usou sua série NASA explicitamente identificada.
No preenchimento real, a requisição NASA foi mantida pendente até salvar o primeiro
calendário, enquanto a estimativa de solo ficou indisponível; depois a requisição
foi interrompida. Nas coordenadas exatas de Vilhena há série histórica local do
mesmo ponto. Portanto, esse teste confirma o tratamento de espera/falha e **não**
comprova disponibilidade ou respostas atuais das APIs externas.

O relatório e as capturas ficam em
`output/pitch-autoguiado/browser-smoke-results.json` e
`output/pitch-autoguiado/`, na raiz do repositório. O roteiro com participantes
leigos e avançados continua pendente. Também permanecem pendentes os testes em
aparelhos físicos e a verificação das fontes externas em condições reais de
rede. Esta rodada usou o servidor local; a publicação foi verificada depois,
conforme o registro abaixo.

### Executar o smoke opcional

Com Node.js 22 e um Playwright/Chromium já disponível no ambiente, inicie o Vite
em um terminal e execute o smoke em outro, a partir de `rota-adaptada`:

```bash
npm run dev -- --host 127.0.0.1 --port 5178
```

```bash
ROTA_SMOKE_URL=http://127.0.0.1:5178 node tests/browser-smoke.mjs
```

Quando Playwright não estiver resolvível como módulo local, informe o caminho do
módulo com `ROTA_PLAYWRIGHT_MODULE`. Se o executável do navegador estiver fora da
instalação padrão do Playwright, informe `ROTA_CHROMIUM_EXECUTABLE`:

```bash
ROTA_PLAYWRIGHT_MODULE=/caminho/para/playwright \
ROTA_CHROMIUM_EXECUTABLE=/caminho/para/chromium \
ROTA_SMOKE_URL=http://127.0.0.1:5178 \
node tests/browser-smoke.mjs
```

`ROTA_SMOKE_OUTPUT` permite escolher outro diretório para o relatório e as
capturas. O smoke é separado de `npm test`; sua inclusão não adiciona dependências
ao projeto nem utiliza um perfil persistente do navegador.

## Publicação HTTPS — 15/11/2026

Publicado em <https://deltashift.udisoft.app.br/> o código do commit `4834090`,
na branch `codex/planejamento-autoguiado`. A base anterior foi registrada em
`versao-vitoria` no commit `af32c1b`; `main` e `teste-visual` foram preservadas.
O script de publicação criou backup da versão anterior e confirmou a saúde do
serviço e a igualdade entre o HTML público e o HTML da imagem publicada.

- O build no servidor aprovou **136 testes JavaScript**, incluindo um build real
  que confere todos os arquivos do cache offline. Também passaram os **13 testes
  Python**, o build local e a checagem de empacotamento.
- A lista de cache passou a ser gerada após a finalização dos arquivos pelo Vite.
  Os **18 recursos** publicados retornaram HTTP 200; o cache é
  `rota-field-801a3fbf9acffb4b`. A mudança conserva a ativação explícita de
  atualizações e o salvamento prévio dos rascunhos.
- Em Chromium temporário, a raiz abriu **Planeje sua próxima safra**, com a
  entrada `index-B2ptp1j9.js`. O Service Worker ficou ativo e controlando a página.
  O exemplo, percorrido pela interface, calculou milho de 01/11/2026 a 28/02/2027
  e feijão de 08/03/2027 a 26/05/2027. Não houve erros de página ou HTTP >= 400.
- Com a rede desligada no contexto de teste, a navegação para a raiz abriu a
  interface já instalada e exibiu o aviso de ausência de conexão. Isso verifica
  o shell offline, não novas consultas de dados sem rede.
- O navegador embutido persistente usado na revisão ainda apresentou uma
  interface antiga em cache. Seus dados não foram limpos. A publicação nova foi
  confirmada por HTTP e pelo Chromium temporário; a migração desse perfil legado
  específico não foi concluída nesta sessão.

Evidências locais: `output/pitch-autoguiado/production-verification.json`,
`https-validacao.json` e capturas `publicado-*.png`, na raiz. O pitch tem sete
slides; o vídeo tem 30 segundos exatos, com capturas reais e legendas, sem áudio.
Foram preparados roteiros de apresentação e vídeo. Continuam pendentes a rodada
com três pessoas pouco digitais e duas avançadas, o ensaio com o apresentador e
os testes em aparelhos físicos. Não foram atribuídos resultados a participantes
que não testaram o aplicativo.

## Correção do catálogo avançado — 15/11/2026

A grade avançada renderizava 402 perfis nacionais, incluindo 109 registros de
sorgo, sob uma identificação de Vilhena. Agora cartões e seletores usam as
culturas e os grupos retornados para o **município da propriedade escolhida**.
O catálogo completo e os dados salvos permanecem intactos; não há remoção ou
migração de registros. Os nomes municipais preservam diferenças de safra.

- Em Vilhena foram conferidas quatro opções oficiais distintas: Sorgo
  Forrageiro, Sorgo Forrageiro 2ª Safra, Sorgo Granífero e Sorgo Granífero
  2ª Safra. Não aparecem perfis oficiais de outras UFs nessa lista.
- Cadastros próprios, modelos do protótipo e escolhas anteriores preservadas
  são identificados separadamente. Uma escolha antiga incompatível com a nova
  área não é substituída automaticamente; o formulário pede revisão.
- Trocar a propriedade do novo planejamento atualiza o município consultado,
  preservando nome, data, seleção anterior e foco, inclusive quando a resposta
  chega enquanto o usuário preenche o formulário.
- Testes unitários cobrem dois municípios da **mesma UF** com catálogos
  diferentes, erros de consulta, repetição explícita e preservação das
  identidades e do catálogo global.
- `tests/browser-crop-catalog.mjs` passou em 1280 px e 390 px: quatro sorgos
  oficiais, nomes completos, troca Vilhena → Sinop, resposta municipal atrasada,
  foco preservado e plano original intacto. Sem erros JavaScript ou rolagem
  horizontal. Foram usados perfis temporários e APIs externas bloqueadas.

Execute o teste opcional com as mesmas variáveis `ROTA_*` descritas para o smoke
acima, substituindo o comando por `node tests/browser-crop-catalog.mjs`.
Relatório e capturas: `output/catalogo-municipal/`, na raiz. A rodada humana
permanece pendente por decisão do usuário.

## Histórico da revisão — 14/11/2026, antes da nova criação

- Removidos 30 arquivos de código desconectados das entradas atuais, 17 testes
  obsoletos e 7 cópias/configurações/documentos sem uso. O painel avançado e os
  dados ativos em `src/data/` foram mantidos, assim como materiais históricos
  de apresentação e backups que não são servidos pelo site.
- Aprovação dos 12 arquivos de testes JavaScript restantes, incluindo o novo
  grafo de dependências; 3 testes Python do atualizador ZARC; build Vite; checagem
  de empacotamento ServerOS e links locais da documentação ativa.
- No navegador: descoberta até resultado e download HTML; ajuda com Escape;
  adaptação com atraso de 12 dias, salvamento e abertura no painel sem reaplicar
  atraso; cinco abas e relatório imprimível; invalidação de sugestões após
  mudar data; descarte de consulta após editar latitude; salvamento com solo
  explicitamente não informado; rascunhos preservados na troca de interface.
- `?modo=campo` retomou a revisão da consulta guiada. Em viewport de 390 px,
  o guia não apresentou rolagem horizontal. Nenhum erro de console foi registrado
  nas navegações conferidas. SoilGrids ficou indisponível e a interface manteve
  corretamente a análise parcial.
- A configuração de 404 do Nginx foi revisada, mas não executada em contêiner:
  o acesso ao socket Docker local não estava disponível. Instalação em aparelho
  físico e atualização PWA offline não foram repetidas nesta revisão; seus testes
  automatizados passaram. Não houve publicação no servidor.

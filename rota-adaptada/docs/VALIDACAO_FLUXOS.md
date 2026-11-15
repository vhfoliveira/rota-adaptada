# Validação dos fluxos ativos

Use uma origem local de teste com dados demonstrativos. Não apague o IndexedDB
de um perfil com dados do produtor. A entrada é `index.html` → `src/bootstrap.js`.

## Entradas e navegação

| Entrada | Comportamento esperado |
| --- | --- |
| `/` | Visão geral Órbita, com ações, indicadores locais e retomadas |
| `?visao=planos` | Biblioteca de planejamentos com busca e filtros |
| `?demo=planejamento` | Exemplo explícito de criação em Vilhena; rascunho separado dos dados reais |
| `?modo=campo` | Abre/retoma a consulta guiada de culturas |
| `?modo=planejamento` | Painel avançado separado, com cinco áreas de navegação |
| `?modo=planejamento&plano=<id>` | Abre o plano salvo indicado, com suas próprias datas e permissões |
| Link do guia para o painel | Aguarda o salvamento do rascunho |
| Arquivo/caminho ausente no Nginx | HTTP 404, sem retornar HTML da aplicação |

O painel avançado continua ativo, inclusive para abrir planos salvos no guia.
Celular e computador usam a mesma entrada.

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
8. No painel, percorra Propriedade, Culturas, Planejamento, Simulação e Comparação,
   e Explicação. O passo 3 deve mostrar o calendário original, sem controles de
   atraso ou permissões de mudança. No passo 4, teste um atraso personalizado e
   os atalhos; confira o efeito nas sucessões e as permissões por etapa. Retorne
   ao passo 3: datas e condições devem continuar originais. Troque entre dois
   planos com atrasos diferentes: cada um deve conservar seu próprio cenário.
   Abra o resumo imprimível.
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
que não pertence a nenhum fluxo ativo.

Os testes de planejamento guiado cobrem criação sem atraso, salvamento
idempotente, ajuste posterior autorizado, snapshots oficiais, concorrência,
falha de armazenamento e migração de demos antigas. Testes de ativação verificam
que abrir um plano respeita sua propriedade e suas decisões. Esses testes não
substituem o roteiro de navegador nem testes com usuários.

Com o Vite iniciado, `node tests/browser-planning-simulation.mjs` verifica a
separação dos passos 3 e 4 em computador e celular, incluindo retomada do
cenário, troca de planos, edição das datas originais e um perfil oficial de
etapa única. Usa contextos temporários e bloqueia APIs externas; aceita as
mesmas variáveis `ROTA_*` de `tests/browser-smoke.mjs`.

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

## Executar o smoke opcional

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


Os testes `browser-crop-catalog.mjs`, `browser-planning-crops.mjs` e
`browser-planning-simulation.mjs` usam as mesmas variáveis de ambiente.
A validação com usuários e em aparelhos físicos permanece pendente.

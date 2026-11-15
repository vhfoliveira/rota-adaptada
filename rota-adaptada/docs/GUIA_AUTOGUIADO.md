# Experiência autoguiada

A raiz abre os dois objetivos. `?modo=campo` abre a consulta guiada e retoma seu rascunho; `?modo=planejamento` abre o painel avançado, que continua ativo. Celular e computador usam as mesmas jornadas. A demonstração é explícita, separada da escolha da propriedade.

`index.html` carrega `src/bootstrap.js`: o guia usa `src/guided.js` e o painel avançado usa `src/main.js`. A PWA instalada abre a raiz. O guia permite retornar ao início, retomar cada objetivo e abrir o painel avançado; o painel oferece o retorno à experiência guiada.

## Inventário de apresentação

| Assunto | Visível na etapa | Ajuda `?` | Avançado |
| --- | --- | --- | --- |
| Local | Município/UF, ponto confirmado, GPS/mapa, alternativa municipal | GPS, privacidade, coordenadas e limites | Coordenadas manuais em seção opcional |
| Plantio | Data, irrigação desconhecida/chuva/irrigada | Significado da data e disponibilidade de água | Solo opcional; estimativa não confirma classe oficial |
| Opções oficiais | Cultura, exigência de irrigação, risco publicado, solo não confirmado | Significado do ZARC, critérios e fonte | Condições completas expansíveis |
| Clima | Histórico do mês, período e indicação de cache | Método, unidades e fonte NASA | Diagnóstico detalhado no painel |
| Sequência | Cultura, ciclo explicitamente escolhido, intervalo | Ciclos, sequência e exemplos | Catálogo, culturas/ciclos personalizados e restrições por etapa |
| Adaptação | Atraso, alterações permitidas, comparação parcial quando aplicável | Explicações das mudanças e limites | Parâmetros e detalhamento histórico |
| Conclusão | Resumo, condições pendentes, salvar | Como guardar/ imprimir e próximo passo | Exportações técnicas |

## Estado e proteção de dados existentes

Rascunhos discovery/adaptation são guardados na chave `guided-drafts-v1` do object store `workspace`, sem substituir a chave `state` do painel avançado. Cada gravação lê e atualiza os dois objetivos na mesma transação. Uma alternativa gera novo identificador e guarda snapshot da origem; o atraso não é reaplicado no plano salvo. Coordenadas e respostas informadas pelo usuário fazem parte do rascunho local.

Resultados não são restaurados como se fossem atuais. Retomar uma etapa de resultado conduz à revisão para nova consulta. Consultas independentes emitem status por fonte; ao editar ou sair, respostas tardias são descartadas. Município sem ponto não dispara NASA/SoilGrids. A adaptação requer um ponto confirmado; consulta municipal ZARC continua disponível no objetivo de descobrir culturas.

`context-help.js` fornece a ajuda das interfaces ativas. IDs estáveis relacionam assuntos e ações. A ajuda é um diálogo independente, com foco restaurado e área de toque de 44 px.

## Culturas na adaptação

A seleção de culturas é carregada da base oficial do município antes de montar a sequência, sem preencher uma opção automaticamente. O catálogo abrange a safra disponível inteira: os cultivos seguintes têm datas diferentes, portanto não são filtrados pela data inicial do primeiro cultivo. A presença no catálogo não confirma a janela de plantio, o solo, o grupo ou o manejo. A jornada de descoberta mantém a consulta específica por data e condições.

Todas as culturas municipais permanecem visíveis. O registro de parâmetros oficiais cruza cultura, UF, safra, manejo, grupo e portaria vigente. Ciclos de referência e fases são usados quando publicados; faixas com teto permitem uma hipótese de calendário explicitamente identificada. Grupos sem duração suficiente permanecem pendentes. Os modelos antigos são identificados como protótipos, sem preencher uma cultura automaticamente. Falhas na consulta não repõem o antigo catálogo manual. Consulte [a integração de parâmetros oficiais](PARAMETROS_OFICIAIS.md) para fontes, limites e atualização.

Escolhas carregadas de um plano salvo são identificadas como anteriores e preservadas, inclusive quando não aparecem na lista municipal. As substituições propostas pelo motor ficam restritas aos modelos com registro municipal, respeitando também as restrições do plano original. Alterar o município exige nova consulta; respostas de consultas antigas não substituem a atual.

## Roteiro de validação com pessoas leigas (pendente)

Recrutar cinco participantes que não conheçam a ferramenta. Não antecipar o caminho nem ensinar siglas. Usar dados fictícios/exemplo de Vilhena, e informar que não se trata de orientação de plantio real.

1. Pedir para descobrir opções de plantio no município e data preparados para a safra disponível, entender solo não confirmado e salvar um resumo.
2. Pedir para montar uma sequência preparada com dois cultivos/ciclos, simular 12 dias de atraso, consultar uma ajuda e salvar uma alternativa.
3. Pedir para voltar à entrada, retomar o preenchimento e explicar onde o dado ficou salvo.
4. Perguntar se o resultado é uma previsão, se risco ZARC é chance de sucesso e o que precisa ser confirmado antes de plantar.

Registrar por participante: conclusão sem orientação, dúvidas, erros, ajuda encontrada e entendimento dos limites. Aceite: pelo menos quatro de cinco concluem cada jornada sem orientação, localizam ajuda e compreendem as condições essenciais. Corrigir dificuldades recorrentes e repetir os casos afetados. Não substituir este teste por uma simulação de IA.

## Publicação

Executar os testes e o build; conferir celular/computador e instalação PWA. Homologar o roteiro humano acima antes da publicação geral. A publicação no ServerOS usa `./deploy/serveros.sh`, com backup, healthcheck e rollback existentes. Não apagar rascunhos para atualizar: o aviso de nova versão exige ação explícita e checkpoint bem-sucedido. O painel avançado solicita salvar/fechar editores antes de atualizar. Caches anteriores ficam disponíveis para abas que ainda estejam concluindo o preenchimento.

## Conferência técnica de 14/11/2026

- Consulta completa em viewport de 390 px: demonstração explícita, revisão, opções ZARC, seleção de cultura e download HTML com condições e fontes.
- Ajuda por toque e Escape: foco devolvido ao botão de origem, data preservada; painel inferior observado no celular.
- Adaptação em 1280 px: localização manual, cultura/ciclo obrigatório, sequência com dois cultivos, atraso de 12 dias, comparação parcial sem solo confirmado, salvamento e plano aberto no painel avançado com datas preservadas.
- Rascunhos de consulta e adaptação reapareceram após recarregar a página.
- Mapa do pacote de produção renderizado; deslocamento pelas setas e seleção explícita do centro confirmados. Corrigidos carregamento do worker e ordem de criação do marcador encontrados durante QA.
- Testes automatizados cobrem falhas independentes de fontes, descarte de resposta cancelada, reutilização de dados do mesmo ponto, condições ZARC completas, validação de localização, paridade com o motor, preservação/concorrência de armazenamento e ativação segura de atualizações.
- Capturas em `screenshots/guided/`. Estes testes técnicos não substituem a validação com os cinco participantes e não certificam recomendações agronômicas.

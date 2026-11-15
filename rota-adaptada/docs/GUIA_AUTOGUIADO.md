# Experiência autoguiada

A raiz destaca **Criar meu planejamento**, seguida de **Ajustar um planejamento existente**. **Ainda não sei o que plantar** preserva a descoberta de culturas. `?modo=campo` abre a consulta guiada e retoma seu rascunho; `?modo=planejamento` abre o painel avançado, que continua separado do guia. Celular e computador usam as mesmas jornadas. `?demo=planejamento` inicia ou oferece retomar a demonstração explícita de Vilhena.

`index.html` carrega `src/bootstrap.js`: o guia usa `src/guided.js` e o painel avançado usa `src/main.js`. A PWA instalada abre a raiz. O guia permite retornar ao início, retomar cada objetivo e abrir o painel avançado; o painel oferece o retorno à experiência guiada.

## Jornadas

| Objetivo | Etapas |
| --- | --- |
| Criar meu planejamento | Localização → cultivos e datas → revisão → calendário original e salvamento. |
| Ajustar um planejamento existente | Plano salvo → atraso e permissões → revisão → comparação e salvamento da alternativa. |
| Descobrir o que plantar | Localização → data e condições → revisão → opções → resumo. |

A criação tem quatro etapas e começa sem cultura, ciclo, data ou intervalo
preenchidos automaticamente. O nome é opcional. A prévia de calendário aparece
quando os dados necessários estão completos; solo desconhecido não impede
montar a sequência. A adaptação mostra quatro etapas de progresso e permite
editar cultivos e datas pela revisão. Sem plano salvo, oferece criar um.

O original é salvo sem atraso. **Simular atraso** abre uma adaptação separada;
**Editar uma cópia** mantém o original e gera outro identificador. **Ver este
plano em detalhes** usa `?modo=planejamento&plano=<id>`. **Baixar resumo** cria um
HTML imprimível; não substitui o salvamento do plano no dispositivo.

## Inventário de apresentação

| Assunto | Visível na etapa | Ajuda `?` | Avançado |
| --- | --- | --- | --- |
| Local | Município/UF, ponto confirmado, GPS/mapa; alternativa municipal somente na descoberta | GPS, privacidade, coordenadas e limites | Coordenadas manuais em seção opcional |
| Plantio | Data, irrigação desconhecida/chuva/irrigada | Significado da data e disponibilidade de água | Solo opcional; estimativa não confirma classe oficial |
| Opções oficiais | Cultura, exigência de irrigação, risco publicado, solo não confirmado | Significado do ZARC, critérios e fonte | Condições completas expansíveis |
| Clima | Histórico por cultivo no planejamento; histórico do mês na descoberta; período e origem identificados | Método, unidades e fonte NASA | Diagnóstico detalhado no painel |
| Sequência | Cultura, ciclo explicitamente escolhido, intervalo | Ciclos, sequência e exemplos | Catálogo, culturas/ciclos personalizados e restrições por etapa |
| Adaptação | Atraso, alterações permitidas, comparação parcial quando aplicável | Explicações das mudanças e limites | Parâmetros e detalhamento histórico |
| Conclusão | Resumo, condições pendentes, salvar | Como guardar/ imprimir e próximo passo | Exportações técnicas |

## Estado e proteção de dados existentes

Rascunhos `planning`, `discovery` e `adaptation` são guardados na chave
`guided-drafts-v1` do object store `workspace`; os exemplos usam
`guided-demo-drafts-v1`. A chave `state` conserva os planos e os cadastros do
painel avançado. Iniciar outro preenchimento pede uma escolha explícita quando
já há um rascunho daquele objetivo. Coordenadas e respostas fazem parte do
rascunho local, sem sincronização entre aparelhos.

Ao ler, exemplos de versões antigas são separados dos rascunhos reais na mesma
transação. Se já houver um exemplo do mesmo objetivo, prevalece o maior
`updatedAt`/`savedAt`; empate favorece o namespace novo. A versão distinta
preterida fica preservada em `guided-demo-drafts-legacy-backup-v1`. Falha na
migração não apaga nenhuma das versões.

O original tem identificador estável e salvamento idempotente; repetir a mesma
gravação não duplica o plano. Seus ciclos mantêm elegibilidade para futuras
mudanças autorizadas. Datas calculadas não viram restrições fixas no original.
Uma alternativa gera novo identificador e guarda snapshot da origem; o atraso
não é reaplicado ao plano salvo. A gravação lê e atualiza o estado mais recente
na mesma transação, preservando outros planos. Falha de armazenamento aparece
como erro; a interface só confirma sucesso após a gravação efetiva.

Resultados não são restaurados como se fossem atuais. Retomar uma etapa de resultado conduz à revisão para nova consulta. Consultas independentes emitem status por fonte; ao editar ou sair, respostas tardias são descartadas. Na criação, o calendário já pode ser salvo enquanto a NASA carrega. Município sem ponto não dispara NASA/SoilGrids. Criação e adaptação requerem ponto confirmado; consulta municipal ZARC continua disponível no objetivo de descobrir culturas.

`context-help.js` fornece a ajuda das interfaces ativas. IDs estáveis relacionam assuntos e ações. A ajuda é um diálogo independente, com foco restaurado e área de toque de 44 px.

## Culturas na criação e na adaptação

A seleção de culturas é carregada da base oficial do município antes de montar a sequência, sem preencher uma opção automaticamente. O catálogo abrange a safra disponível inteira: os cultivos seguintes têm datas diferentes, portanto não são filtrados pela data inicial do primeiro cultivo. A presença no catálogo não confirma a janela de plantio, o solo, o grupo ou o manejo. A jornada de descoberta mantém a consulta específica por data e condições.

Todas as culturas municipais permanecem visíveis. O registro de parâmetros oficiais cruza cultura, UF, safra, manejo, grupo e portaria vigente. Ciclos de referência e fases são usados quando publicados; faixas com teto permitem uma hipótese de calendário explicitamente identificada. Grupos sem duração suficiente permanecem pendentes. Os modelos antigos são identificados como protótipos, sem preencher uma cultura automaticamente. Falhas na consulta não repõem o antigo catálogo manual. Consulte [a integração de parâmetros oficiais](PARAMETROS_OFICIAIS.md) para fontes, limites e atualização.

Escolhas carregadas de um plano salvo são identificadas como anteriores e preservadas, inclusive quando não aparecem na lista municipal. As substituições propostas pelo motor ficam restritas aos modelos com registro municipal, respeitando também as restrições do plano original. Alterar o município exige nova consulta; respostas de consultas antigas não substituem a atual.

## Demonstração reproduzível

`src/guided-demo.js` monta o exemplo a partir dos modelos documentados do catálogo
municipal de Vilhena na safra 2026/2027. O ponto é −12,7405 / −60,1458. A sequência
é milho de primeira safra consorciado com braquiária, Grupo II, 120 dias de
referência, seguido de feijão de segunda safra, Grupo II, 80 dias. A data inicial
é 01/11/2026; os 7 dias de intervalo são uma hipótese do exemplo. Solo ZARC e
perfil de solo permanecem desconhecidos.

| Cenário | Plantio do milho | Fim do ciclo de referência | Plantio do feijão | Fim do ciclo de referência |
| --- | --- | --- | --- | --- |
| Original | 01/11/2026 | 28/02/2027 | 08/03/2027 | 26/05/2027 |
| Atraso de 12 dias | 13/11/2026 | 12/03/2027 | 20/03/2027 | 07/06/2027 |
| Mesmo atraso e ciclo do milho de 100 dias | 13/11/2026 | 20/02/2027 | 28/02/2027 | 18/05/2027 |

A última linha exige autorização para testar ciclos mais curtos; as culturas
são preservadas. A antecipação de 20 dias é uma diferença de calendário em
relação ao plano com atraso, sem comprovação de vantagem agronômica. Os cenários
permanecem parciais. O fim do ciclo de referência não garante colheita ou
liberação da área.

O exemplo usa a série real NASA POWER embarcada de Vilhena, 2013–2024, com cache
separado das consultas reais. O feijão de 80 dias iniciado em 20/03 tem chuva
acumulada média histórica de 236,6 mm; iniciado em 28/02, 383,6 mm, em 12 anos
completos. Mais chuva não demonstra melhor resultado. Estes valores pertencem
à série identificada; consultas ao vivo com outro período podem diferir. O
catálogo ZARC ainda precisa estar acessível no próprio site: a série local não
garante funcionamento integral da demonstração sem rede.

## Roteiro de validação com pessoas leigas (pendente)

Recrutar cinco participantes que não conheçam a ferramenta. Não antecipar o caminho nem ensinar siglas. Usar dados fictícios/exemplo de Vilhena, e informar que não se trata de orientação de plantio real.

1. Pedir para criar uma sequência preparada com dois cultivos/ciclos, entender o calendário sem atraso e salvar o original.
2. Pedir para testar 12 dias de atraso, autorizar ciclos mais curtos, consultar uma ajuda e salvar uma alternativa sem alterar o original.
3. Pedir para descobrir opções por município/data, reconhecer solo não confirmado e baixar um resumo.
4. Pedir para voltar à entrada, retomar o preenchimento e explicar onde o dado ficou salvo; distinguir exemplo, rascunho e plano.
5. Perguntar se o resultado é uma previsão, se risco ZARC é chance de sucesso e o que precisa ser confirmado antes de plantar.

Registrar por participante: conclusão sem orientação, dúvidas, erros, ajuda encontrada e entendimento dos limites. Aceite: pelo menos quatro de cinco concluem cada jornada sem orientação, localizam ajuda e compreendem as condições essenciais. Corrigir dificuldades recorrentes e repetir os casos afetados. Não substituir este teste por uma simulação de IA.

A validação com usuários avançados também está pendente. Exercitar abertura de
um original no painel, ajustes por etapa, comparação e relatório; registrar
tempo, erros e compreensão, sem obrigá-los a percorrer o guia.

## Publicação

Executar os testes e o build; conferir celular/computador e instalação PWA. Homologar o roteiro humano acima antes da publicação geral. A publicação no ServerOS usa `./deploy/serveros.sh`, com backup, healthcheck e rollback existentes. Não apagar rascunhos para atualizar: o aviso de nova versão exige ação explícita e checkpoint bem-sucedido. O painel avançado solicita salvar/fechar editores antes de atualizar. Caches anteriores ficam disponíveis para abas que ainda estejam concluindo o preenchimento.

## Histórico de conferência técnica — 14/11/2026, antes da nova criação

- Consulta completa em viewport de 390 px: demonstração explícita, revisão, opções ZARC, seleção de cultura e download HTML com condições e fontes.
- Ajuda por toque e Escape: foco devolvido ao botão de origem, data preservada; painel inferior observado no celular.
- Adaptação em 1280 px: localização manual, cultura/ciclo obrigatório, sequência com dois cultivos, atraso de 12 dias, comparação parcial sem solo confirmado, salvamento e plano aberto no painel avançado com datas preservadas.
- Rascunhos de consulta e adaptação reapareceram após recarregar a página.
- Mapa do pacote de produção renderizado; deslocamento pelas setas e seleção explícita do centro confirmados. Corrigidos carregamento do worker e ordem de criação do marcador encontrados durante QA.
- Testes automatizados cobrem falhas independentes de fontes, descarte de resposta cancelada, reutilização de dados do mesmo ponto, condições ZARC completas, validação de localização, paridade com o motor, preservação/concorrência de armazenamento e ativação segura de atualizações.
- Capturas em `screenshots/guided/`. Estes testes técnicos não substituem a validação com os cinco participantes e não certificam recomendações agronômicas.

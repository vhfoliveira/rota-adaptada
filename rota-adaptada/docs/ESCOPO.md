# Rota Adaptada — visão integral e auditoria

Objetivo autorizado: implementar toda a visão discutida, com dados científicos simulados e comentários indicando a futura API. Sem redução por prazo. A existência de um item nesta lista não comprova implementação.

## Contratos permanentes
- Português, alcance global com cobertura agronômica declarada; nenhum local pré-selecionado.
- MapLibre como único motor; controles e navegação nativos. Não reintroduzir imagem-base satélite rejeitada.
- Toda ciência demonstrativa identificada; ausências preservadas; proveniência, resolução e períodos visíveis.
- Histórico, observação recente, previsão e projeção separados. Horizonte de rotação não é previsão do tempo.
- Cadastros locais preservados e backup compatível; nenhuma análise pontual representa automaticamente a propriedade.

## Entregas e evidências pendentes
- [ ] Propriedades: edição de polígonos, importação GeoJSON, validação, sistemas de cultivo e irrigação.
- [ ] Talhões: áreas de manejo, histórico detalhado, produtividade informada, fotos e observações.
- [ ] Solo: amostras com coordenadas, profundidade, métodos, unidades, laudos e origem.
- [ ] Observatório: chuva, temperatura do ar, superfície, umidade, vegetação e vento simulados.
- [ ] Tempo: legenda, datas, reprodução pausável, lacunas, transparência e inspeção de células.
- [ ] Comparação espacial: duas datas/variáveis sincronizadas; gráficos associados ao talhão.
- [ ] Contextos: histórico, recente, previsão e projeção com semânticas diferentes.
- [ ] Catálogo: regiões, famílias, ciclos, operações, critérios e proveniência demonstrativa.
- [ ] Planejamento: restrições completas, irrigação/equipamentos, calendário editável e conflitos.
- [ ] Motor: alternativas, objetivos, cenários, sensibilidade, explicação e incertezas.
- [ ] Comparação: prioridades, riscos, operações, investimento sem preços inventados.
- [ ] Proveniência: versão do método e evidências congeladas para reproduzir planos.
- [ ] Acompanhamento: operações, planejado/realizado, revisão de planos e avisos locais configuráveis.
- [ ] Relatórios: exportação legível para produtor/assistência e backup integral.
- [ ] Apresentação: percurso guiado, identidade Interplários, acessibilidade e desempenho.
- [ ] Arquitetura: adaptadores substituíveis, cache explícito, modelos separados da UI.
- [ ] Offline: rascunhos/cadastros e evidências já carregadas; estado de conectividade.
- [ ] Sincronização: definir alternativa opcional sem fingir compartilhamento real em app local.
- [ ] QA: fluxo completo em navegador, reload, migração, backup, geometria, camadas e publicação.

## Produtos candidatos, não integrações ativas
NASA POWER (meteorologia), GPM IMERG (chuva), SMAP (umidade), HLS (vegetação), MODIS (superfície), GEOS-FP (previsão), NEX-GDDP-CMIP6 (projeção), GIBS (visualização). Nutrientes, pH, aptidão e recomendações não são obtidos automaticamente dessas fontes.

## Registro de progresso
- Base existente inspecionada: Vite + JavaScript, MapLibre, IndexedDB; publicação v5. Cadastro e planejamento didático já existentes não foram auditados integralmente nesta expansão.
- Início da separação dos adaptadores científicos simulados, com contrato rastreável e determinístico. Não publicado ainda.

### Incremento observatório 1
- Implementados controles de seis variáveis, quatro contextos, data, reprodução pausável, opacidade, legenda, inspeção de célula e série de 14 dias com tabela. Tudo simulado, sem chamada NASA.
- Browser QA: abrir, inspecionar centro do talhão, trocar para temperatura, avançar dia; valores e unidades atualizados, nenhum erro no console.
- Ainda pendentes: comparação espacial, animação vetorial de vento, persistência de evidências, resolução/células consistente entre zooms e planejamento integrado. Não considerar observatório integral concluído.

### Incremento evidências e explicação
- Planejamento captura 365 dias fictícios anteriores à referência, com lacunas, unidades, fontes futuras e método espacial explícito.
- Removida a antiga série mensal artificial que se estendia pelo horizonte futuro.
- Planos preservam polígono, configuração, solo, histórico, versão e séries; explicação por parcelas da pontuação e exportação JSON individual.
- Reprodução da pontuação detecta divergências; planos antigos identificados sem inventar metadados ausentes.
- Testes cobrem referência temporal, congelamento do polígono, lacunas e reprodução de pontuação. QA visual e publicação pendentes neste registro.
- A integração climática no cálculo agronômico ainda não está concluída: contexto não altera pontuação.
- QA deste incremento concluído: geração de três alternativas, visualização das médias/lacunas, salvamento, reload, reabertura com pontuação reproduzida e download JSON. Arquivo exportado inspecionado: 3 séries × 365 dias e polígono preservados. Console sem erros. 14 testes passaram.

### Incremento territorial
- Importação GeoJSON por arquivo ou texto, revisão prévia e validação integral do lote; exportação individual GeoJSON.
- Edição de nome/coordenadas e redesenho no mapa. Limites anteriores guardados no cadastro; os planos anteriores mantêm seus snapshots.
- Sistema de cultivo, irrigação, equipamentos e restrições locais por talhão, preservados no planejamento novo.
- Testes: roundtrip GeoJSON, rejeição de CRS/furos/anel aberto, contenção após edição e sobreposição de lote sem mutação do estado.
- QA navegador: importar propriedade e talhão, salvar manejo, rejeitar propriedade que excluiria talhão, renomear, redesenhar talhão e recarregar; dados preservados, console sem erros.
- Pendentes: edição arrastando vértices, visualização/restauração do histórico geométrico, zonas de manejo e utilização automática das restrições de irrigação/equipamentos.

### Direcionamento visual do usuário: referência Windy, fontes NASA
- Acompanhamento de operações foi adiado enquanto a visualização climática é corrigida, sem retirar esse item do escopo.
- Substituídas quadrículas por campos sintéticos contínuos, renderizados por CanvasSource/raster nativo do MapLibre. Sem outro motor ou carregador de imagens.
- Adicionadas partículas de vento em camada GeoJSON nativa, cores específicas por variável, controles compactos, linha do tempo e consulta do ponto com valores coerentes com o campo visual.
- Fontes futuras continuam NASA; nenhum dado, API ou serviço Windy é utilizado. Simulação identificada permanentemente.
- Versão científica weather-field-demo-2; snapshots antigos preservam valores anteriores. Ausências agora são regiões localizadas neutras.
- QA: globo e mapa plano, consulta por clique, troca vento/temperatura, controle temporal e reprodução. Testes de continuidade espacial, antimeridiano, lacunas e consistência numérica.

### Diário de operações e explicações contextuais
- Planos salvos oferecem acompanhamento com implantação, encerramento e intervalos derivados do calendário, além de operações adicionais declaradas pelo produtor.
- Registra situação, data efetiva, observações e produtividade opcional com unidade/peso da saca; preserva revisões e o plano original. Exportação individual inclui o diário, e backup integral o preserva.
- Avisos de data passada são locais, calculados ao abrir o diário; não são alerta meteorológico ou confirmação automática. Revisão do plano e notificações configuráveis continuam pendentes.
- A pedido do usuário, detalhamento aparece somente após mouse parado por 2 segundos. Não abre por clique/foco, não adiciona botões. Movimento/saída antes do prazo cancela; Escape fecha. Explicações de unidades, restrições, índices, fontes futuras, ausências e dados locais.
- QA: registro e revisão de operação, reload mantendo diário; explicação ausente imediatamente após hover e visível após espera. Testes de revisão, conversão de produtividade, datas inválidas e duplicidade.

### Relatório legível do plano
- Adicionada prévia ampla e exportação HTML independente, sem dependências externas, com CSS para impressão A4 e comando de impressão do navegador.
- Inclui identidade do talhão preservada, geometria, versões, restrições, janelas, prioridades, calendário, resumos científicos com ausências, fontes futuras, solo, manejo, histórico, execução e limitações.
- Não substitui o backup JSON: séries diárias, anexos e revisões completas continuam no backup/plano exportado. Relatório não recria evidências ausentes de planos antigos.
- Testes: preservação do snapshot, escape de conteúdo, ausência de recursos remotos, legados sem evidência, zero declarado e anexos não incorporados.
- QA: prévia e download HTML conferidos; arquivo contém as sete seções e o diário. Sem erros de console. Comando de impressão acionado, mas a janela nativa/PDF final não ficou acessível no navegador integrado; paginação final ainda requer verificação.

### Calendário editável e revisão de planos
- Planos com retrato completo podem gerar uma revisão de datas, individualmente por cultivo ou deslocando a sequência inteira. A ordem e as culturas são preservadas; mudanças de culturas/restrições continuam no novo planejamento.
- Validação de datas reais, ciclo mínimo demonstrativo, janela máxima, intervalo mínimo e horizonte. Prévia original/revisado antes de salvar; motivo obrigatório.
- Nova versão com identificador e origem próprios, novas evidências simuladas, retrato espacial/local preservado e diário vazio. O diário anterior permanece exclusivamente no plano anterior.
- Horizonte de mês ajusta corretamente o fim do mês (inclusive fevereiro bissexto). Novos calendários registram calendar-demo-1. Pontuação didática não depende das datas e permanece igual.
- Backup valida origem, restrições preservadas e ciclos entre revisões. Relatório mostra origem/motivo e intervalos reais.
- QA: rejeitado intervalo insuficiente; deslocamento de 10 dias revisado, salvo e recarregado. Backup exportado e validado: plano original com 1 operação, revisão com 0, vínculo preservado. Console sem erros.
- Testes cobrem datas inválidas, limites de duração, intervalos, fim de mês, imutabilidade, origem e ciclos. Avisos configuráveis, cenários e restrições operacionais completas permanecem pendentes.

### Cenários e sensibilidade das prioridades
- O planejamento preserva agora sequências representativas além das três alternativas inicialmente exibidas. No caso sem restrições, 11 conjuntos representam 60 ordens compatíveis dentro do catálogo demonstrativo.
- Laboratório permite novos pesos, ordenação com empates explícitos, parcelas da pontuação e análise de uma prioridade por vez em ±1, limitada a 0–5. A faixa de posições não é intervalo de confiança.
- Hipóteses manuais de chuva/umidade (%) e temperatura (°C) transformam cópias das séries-base. Preservam ausências e zeros; não são previsão/projeção NASA nem modelo físico acoplado. Não alteram a ordenação das culturas.
- Experimentos ficam em IndexedDB e no backup, com origem, alternativas, dados, hipóteses e resultados reproduzíveis. Exportação individual JSON preserva o identificador quando não houve alteração.
- É possível salvar uma alternativa com os pesos do cenário. O plano preserva a evidência original e registra as hipóteses como contexto sem efeito na pontuação; critérios de qualidade continuam obrigatórios quando priorizados.
- QA: reordenação por rendimento, empate com todos os pesos zero, chuva −20% e temperatura +2°C, salvamento/reload, exportação individual e backup validados. Plano escolhido reproduz a pontuação. Console sem erros.
- Testes: reordenação, empates, limites, lacunas, imutabilidade, reprodução, adulteração de resultado, conjunto ampliado e critério de qualidade. Relação clima/solo/cultura no motor agronômico permanece pendente; não foi substituída por relações fictícias apresentadas como válidas.

### Amostras de solo com origem, localização e versões
- Novo cadastro separa identificação, tipo (pontual/composta), coleta, emissão do laudo, laboratório informado, responsável, profundidade, coordenadas opcionais, métodos e unidades.
- Coordenadas são explícitas, sem geocodificação de texto ou inferência de satélite. Pontos aparecem em camada nativa MapLibre do talhão ativo; clique abre a análise. Fora do limite atual há aviso, preservando registros históricos.
- Correção guarda versões anteriores. Laudos inalterados não duplicam bytes no histórico; substituídos/retirados ficam arquivados e disponíveis para download. Nenhuma leitura automática.
- Relatório inclui os novos metadados; planos anteriores mantêm seus snapshots. Ausência e zero continuam distintos.
- QA: cadastro com TXT fictício, pH corrigido 5,8 → 6,1, zero em matéria orgânica preservado, seleção pelo ponto do mapa, retirada do laudo atual com histórico acessível, reload, exportação e restauração do backup. Duas versões e arquivo original íntegros; console sem erros.
- Testes: coordenadas parciais/limites, localização externa, datas, valores, arquivos históricos sem duplicação, dados legados e imutabilidade dos planos.
- Continua pendente delimitar áreas das subamostras de uma coleta composta e integrar zonas de manejo; um ponto não foi apresentado como área representativa.

## Comparação espacial — incremento 16

- Dois mapas MapLibre com datas e variáveis independentes, câmera sincronizada opcional e controles nativos. Reutiliza o mapa principal e descarta o segundo ao fechar.
- Consulta da mesma coordenada, legendas independentes, diferença B − A apenas entre variável/unidade/contexto/método compatíveis. Lacunas e zero são preservados.
- Tabelas de 14 dias por janela e exportação JSON com consultas, resultados, séries, método, fontes futuras, câmeras e fotografia do talhão. O ponto de referência do talhão é a média dos vértices, explicitamente não uma média espacial.
- Todos os campos são sintéticos; APIs futuras permanecem documentadas em `src/data/science.js`. Partículas ficam pausadas durante comparação. Nenhum serviço Windy é utilizado.
- QA: zoom sincronizado e independente, variáveis distintas, data vazia, consulta no mapa/talhão, download validado, reabertura e Escape; um único canvas permanece ao fechar e nenhum erro de console observado.
- Ainda pendentes neste eixo: gráficos comparativos e agregações espaciais verdadeiras por talhão, períodos científicos próprios de cada produto e cenários climáticos reais.

### Gráficos temporais — incremento 17
- Comparação espacial agora inclui dois gráficos SVG com datas UTC reais no mesmo domínio horizontal e escalas explícitas por variável; mesma variável usa a mesma escala. Nenhuma biblioteca geográfica adicional.
- Janelas de 14, 30, 90 e 365 dias até cada data. Linhas quebram em dias ausentes e em intervalos omitidos; zeros são preservados. Tabela completa continua disponível.
- Média, mínimo, máximo e contagem de ausências usam somente valores disponíveis. Diferenças entre séries pareiam a mesma data e exigem variável, unidade, contexto e método compatíveis; não são correlação, tendência ou relação causal.
- Exportação JSON v2 inclui séries, janela e estatísticas reproduzíveis. Novas explicações dos pontos usam o atraso de 2 segundos e cursor normal. Observação de elementos para ajuda também cobre os diálogos externos ao painel principal.
- QA navegador: 90 e 365 dias, consulta com 4 ausências por série, exportação com 730 registros, tooltip ausente imediatamente e presente após espera, variáveis distintas e janelas sem datas comuns. Sem erros no console.
- Testes cobrem datas duplicadas/inválidas, correspondência de datas, escalas e segmentos, zero/lacunas e estatísticas. Ainda faltam agregações espaciais por talhão e semânticas específicas dos contextos científicos; gráficos atuais representam pontos simulados.

### Média espacial aproximada do talhão — incremento 18
- A comparação permite escolher análise de área ou consulta pontual. Integração do campo sintético usa malha 16 × 16 recortada no polígono, ponderação por área em projeção cilíndrica equivalente e ponto interno por componente do recorte. Limites e integração são aproximações, não levantamento geodésico ou resolução de produto NASA.
- Médias usam apenas a fração válida; cobertura, contagem de pontos, extremos amostrados e cobertura diária permanecem explícitos. Ausência total retorna `null`, sem preencher valores. Diferenças com coberturas distintas exigem interpretação da parcela disponível.
- Cálculo em Web Worker iniciado somente por ação/alteração explícita da consulta. Navegação não recalcula; mudar para ponto ou fechar cancela o trabalho e impede resultados atrasados. Pontos de integração podem ser exibidos em camada MapLibre nativa.
- Exportação v3 preserva escopo, polígono, pontos/pesos, método, limitações, valores e cobertura por dia. APIs candidatas estão comentadas no módulo; uma integração real terá de usar pixels nativos e flags de qualidade.
- QA navegador: análise do talhão ativo, malha nos dois mapas, período anual, exportação reproduzida por pesos, troca imediata para ponto, fechamento durante cálculo, um canvas restante e nenhum erro de console.
- Testes: polígonos côncavos/estreitos, conservação de área/pesos, pontos internos, constantes e zero, cobertura parcial/ausência total, lacuna sintética real, antimeridiano, entradas degeneradas e determinismo.
- A captura de evidências dos planos ainda usa o método pontual histórico e o declara. A nova análise de área não altera silenciosamente planos salvos, suas evidências ou sua pontuação. Integrar o contrato espacial ao planejamento e validar modelos agronômicos permanece no escopo.

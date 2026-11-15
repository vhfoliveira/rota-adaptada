# Escopo regional — Rota Adaptada

Vilhena/RO é o exemplo explícito do aplicativo. A propriedade demonstrativa, o
histórico NASA local de 2013–2024 e as regras regionais de referência estão em
`rota-adaptada/src/data/`. Esses dados não são uma configuração universal para
outras propriedades, municípios ou safras.

A interface atual permite escolher municípios presentes no manifesto ZARC e
consultar suas culturas e condições para a safra e data cobertas. Um ponto
confirmado permite consultar NASA POWER e SoilGrids para aquela coordenada.
Escolher somente o município permite a descoberta municipal, sem análise de clima
ou solo pontual. O mapa indica um ponto, não os limites da propriedade.

## O que o aplicativo avalia

- Condições publicadas na base municipal ZARC, com solo, manejo, grupos e portaria
  preservados. Ausência de solo confirmado produz opções condicionais.
- Calendário de uma ou mais etapas com culturas, ciclos, intervalos e atraso.
- Até três alternativas, cada uma alterando uma etapa, respeitando as permissões do
  produtor e as condições de dados do motor.
- Histórico climático efetivamente disponível para o ponto, com ciclos incompletos
  identificados e sem reutilizar o clima de Vilhena em outra coordenada.
- Dias de cultura viva no horizonte comparado e relatório do cenário avaliado.

## Limites de cobertura

Ampliar o calendário ou cadastrar uma cultura não valida novos parâmetros
agronômicos. Sem solo, clima, parâmetros da cultura ou regras regionais suficientes,
o aplicativo mantém o calendário e identifica a parcela não avaliada. Janelas
informadas pelo usuário não recebem percentuais oficiais automaticamente.

A estimativa de textura do SoilGrids não confirma uma classe oficial de solo ZARC.
A tábua municipal atualizável e o pacote de referência do motor são fontes
separadas. A indicação publicada não substitui a verificação completa da portaria,
nem comprova enquadramento em seguro ou crédito. O histórico não prevê
produtividade ou rentabilidade.

O escopo atual não inclui observatório climático simulado, cadastro de polígonos
de talhões, laudos laboratoriais, diário de operações ou otimização financeira.

Consulte [o contrato do motor](../rota-adaptada/docs/MOTOR_CENARIOS.md),
[a base municipal ZARC](../rota-adaptada/docs/ZARC.md),
[as fontes utilizadas](../DADOS_CONEXAO_APIS.md) e
[o guia de interação](../rota-adaptada/docs/GUIA_AUTOGUIADO.md).

## Maturidade agronômica e continuidade do projeto

O produto atual apoia o planejamento de datas e a comparação de cenários com
histórico climático e condições publicadas. Ainda não reúne evidência suficiente
para oferecer uma recomendação integrada de agricultura de precisão por talhão.
Essa limitação deve acompanhar apresentações, demonstrações e propostas de parceria.
Adicionar mais campos ao cadastro, por si só, não valida uma decisão agronômica.

### Lacunas reconhecidas

A matriz abaixo é uma proposta de evolução a validar com profissionais de agronomia,
não uma lista de funcionalidades já implementadas ou de exames obrigatórios.

| Dimensão | O que ainda não é avaliado de forma integrada | Evidência a obter | Decisão que permanece sem suporte |
| --- | --- | --- | --- |
| Fertilidade e química do solo | Nutrientes disponíveis, pH, matéria orgânica, CTC, saturação por bases e alumínio, conforme cultura e método | Laudo laboratorial com unidades, método, profundidade, data e localização das amostras | Recomendação de adubação e correção do solo |
| Condições físicas e água | Compactação, infiltração, drenagem, profundidade efetiva das raízes e água disponível medida | Levantamento de campo, amostras e sensores calibrados, quando pertinentes | Necessidade e viabilidade de intervenções físicas ou irrigação |
| Qualidade do lote de sementes | Germinação, vigor, pureza, sanidade e umidade | Identificação do lote, boletim de análise, método e data dos testes | Estabelecimento esperado e ajuste de quantidade de sementes |
| Conservação das sementes | Histórico de armazenamento, transporte, embalagem, tratamento e deterioração do lote | Registros de condições de armazenamento e reanálises pertinentes | Se o lote permanece adequado depois de um atraso de plantio |
| Cultivar ou híbrido | Adaptação local, exigências específicas e resistência ou tolerância a problemas identificados | Identificação exata, documentação do obtentor e ensaios regionais | Escolha de material adequado ao ambiente e aos problemas da área |
| Sanidade e histórico da área | Pragas, doenças, nematoides, plantas daninhas e efeitos residuais de manejos anteriores | Monitoramento e registros georreferenciados de ocorrências e operações | Compatibilidade da sucessão com as restrições sanitárias e de manejo |
| Operação e economia | Capacidade de máquinas, equipe, disponibilidade de insumos, custos, contratos e acesso ao mercado | Dados reais da propriedade e registros de execução | Viabilidade operacional e financeira das alternativas |
| Variabilidade dentro da propriedade | Diferenças entre e dentro dos talhões ao longo do tempo | Limites dos talhões, amostragem representativa, mapas e séries de observações | Manejo localizado e aplicação em taxa variável |
| Resultado em campo | Emergência, população estabelecida, datas reais das fases, colheita e produtividade | Acompanhamento de safras e comparação com as estimativas registradas antes do resultado | Comprovação de desempenho do sistema fora da demonstração |

A escolha das variáveis, métodos e frequência de coleta deverá considerar a cultura,
a região, o custo e a decisão pretendida. Não se propõe medir tudo em toda propriedade.

### Termos que precisam ser separados

- **Germinação** é um resultado de teste do lote em condições definidas; não é
  automaticamente a porcentagem de plantas que se estabelecerá no campo.
- **Vigor** acrescenta informação sobre o potencial de desempenho das sementes;
  dois lotes com germinação semelhante podem ter desempenho diferente.
- **Resistência ou tolerância** deve indicar a qual doença, praga ou estresse se
  refere, para qual cultivar e sob quais condições. Não haverá uma nota genérica
  de “semente resistente”.
- **Durabilidade** deve ser tratada como conservação da qualidade do lote ao longo
  do armazenamento. Não é o ciclo da cultura, nem um prazo universal deduzido da
  espécie ou da data de compra.

A distinção entre germinação, vigor e conservação é sustentada pelas publicações
sobre [análise de sementes da Embrapa](https://www.infoteca.cnptia.embrapa.br/infoteca/handle/doc/783114)
e [qualidade e armazenamento de sementes](https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1153777/1/500-PERGUNTAS-Sementes-ed-01-2022-2-Ana-Flavia-do-Nascimento-Dias.pdf).
A necessidade de representar a variabilidade da área orienta a proposta de
amostragem e manejo localizado, conforme a [Embrapa sobre planejamento da adubação
e calagem](https://www.embrapa.br/en/web/agencia-de-informacao-tecnologica/cultivos/milho/producao/manejo-do-solo-e-adubacao/adubacao-e-fertilidade-do-solo/planejamento-da-adubacao-e-calagem).
Essas referências dão contexto; não validam automaticamente os cálculos do aplicativo.

### Como tornar a ausência de dados consciente

Cada dimensão futura deverá informar se o dado está ausente, informado pelo produtor,
estimado por modelo, medido ou conferido documentalmente. Registrar origem, data,
unidade, método, abrangência espacial e limitações; diferenciar “disponível” de
“utilizado pelo cálculo” e de “validado para esta decisão”.

Ausência não pode virar zero, valor médio silencioso ou resultado favorável.
Uma informação estimada por mapa não será apresentada como análise laboratorial.
Um certificado de lote não será apresentado como medição de emergência em campo.
Dados antigos ou de outra área precisam de verificação de aplicabilidade.
Não haverá um percentual de completude apresentado como probabilidade de sucesso.

A interface atual mantém as lacunas específicas nos resultados e explica na ajuda
que fertilidade, qualidade dos lotes, sanidade e diferenças dentro dos talhões ainda
não são avaliadas. O inventário detalhado e o acompanhamento por dimensão descritos
acima são propostas de continuidade, não funcionalidades entregues.

### Etapas propostas e critérios de avanço

1. **Definir o problema com agrônomos e produtores.** Selecionar uma cultura,
   região e decisão concreta. Avançar quando houver requisitos de dados e critérios
   de aceitação documentados, incluindo situações em que não emitir conclusão.
2. **Incorporar evidência da propriedade.** Priorizar talhões, laudos de solo,
   identificação de cultivar e lote de sementes. Avançar após conferir unidades,
   origem, data, representatividade e vínculo com a área e a safra corretas.
3. **Acompanhar um piloto em campo.** Registrar estimativas antes do plantio e
   comparar com emergência, calendário real e resultados observados. Definir as
   métricas e tolerâncias com os responsáveis técnicos antes do piloto; separar
   dados usados para ajustar o modelo dos usados para avaliá-lo.
4. **Validar decisões específicas.** Medir erros, casos sem dados suficientes e
   utilidade frente à prática atual. Só ampliar a recomendação após validação
   técnica no escopo testado. Ganhos econômicos ou de produtividade exigem avaliação
   própria; não serão prometidos com base no histórico climático.
5. **Expandir o manejo localizado.** Avaliar sensores, mapas e integrações conforme
   a necessidade demonstrada. Novas regiões, culturas e safras exigem nova avaliação
   de aplicabilidade, manutenção e custo de coleta.

### Argumento para apresentações e parcerias

> O Rota Adaptada já organiza o calendário agrícola e torna acessíveis o histórico
> climático e as condições publicadas de plantio. A próxima etapa é conectar esse
> contexto aos dados reais da propriedade: fertilidade do solo, qualidade dos lotes
> de sementes, características da cultivar e acompanhamento por talhão. Procuramos
> parceiros técnicos e propriedades piloto para validar essas informações em campo
> e ampliar, com evidência, as decisões que o projeto consegue apoiar.

A continuidade tem entregas e critérios verificáveis. O objetivo é reduzir as
incertezas relevantes para cada decisão; não prometer eliminar o risco agrícola.

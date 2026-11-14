# Rota Adaptada

Proposta de software para o desafio *Field Shift: Adapting Farms with NASA Data* (NASA Space Apps Challenge 2026).

**Objetivo:** ajudar produtores e técnicos a comparar pequenas mudanças no planejamento de cultivos diante de atrasos operacionais ou climáticos, usando dados da NASA, características locais do solo e restrições reais da propriedade.

---

## 1. Recorte do projeto e referências regionais atualizadas

O piloto atende o perfil pré-cadastrado de uma **propriedade produtora de grãos de sequeiro em Vilhena/RO** (Chapada dos Parecis, Macrorregião Sojícola 4, altitude média de $600\text{ m}$).

O ponto de partida é um planejamento de dois anos baseado na sucessão soja e milho, avaliando possibilidades de ajuste de ciclo, diversificação comercial e cobertura do solo quando ocorre um atraso na semeadura da primeira safra.

### Referências oficiais consolidadas no protótipo (Safra 2026/2027)

A Embrapa Rondônia possui referências sobre produção de soja e alternativas de sucessão, incluindo milho, sorgo e milheto ([Publicação regional da Embrapa](https://www.infoteca.cnptia.embrapa.br/infoteca/handle/doc/983788)). Para garantir validade agronômica e regulatória na propriedade pré-cadastrada de Vilhena/RO, os ciclos, cultivares, perfis de solo e calendários seguem as seguintes fontes oficiais:

- **Soja (Safra 2026/2027):** [Portaria SPA/MAPA nº 207, de 30/06/2026](https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/portarias/safra-vigente/rondonia/PORTN207SOJARO.pdf) — janela de menor risco ($20\%$) em Vilhena de 01/10 a 10/01 (Decêndios 28 a 1), com cultivares homologadas de Grupo I ($GMR < 7,9$, ciclo de $100\text{ a }110\text{ dias}$, ex.: BRS 7582, BRS 1075IPRO) e Grupo II ($7,9 \le GMR \le 8,5$, ciclo de $115\text{ a }125\text{ dias}$, ex.: BRS 8481, BRSMT Pintado).
- **Milho 2ª Safra Solteiro e Consorciado (Safra 2026/2027):** Portaria SPA/MAPA nº 331, de 28/07/2026, e [Portaria SPA/MAPA nº 346, de 28/07/2026](https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/portarias/safra-vigente/rondonia/PO46791.PDF) — janela de menor risco ($20\%$) de 01/01 a 20/03 (Decêndios 1 a 8), Grupo I precoce ($\le 110\text{ dias}$, ex.: BRS 1055, 2A401PW, 3040VIP3).
- **Sorgo Granífero (Safra 2026/2027):** [Portaria SPA/MAPA nº 285, de 20/07/2026](https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/portarias/safra-vigente/rondonia/PORTN285SORGOGRANIFERORO.pdf) — janela de menor risco ($20\%$) estendida até 31/03 (Decêndios 1 a 9), Grupo I precoce ($\le 110\text{ dias}$, ex.: BRS 373, 84G02, BM 750) e menor exigência hídrica no florescimento ($\text{ISNA} \ge 0,45$).
- **Milheto (Cobertura e Ciclagem):** Embrapa Milho e Sorgo (Comunicado Técnico 94/2022) e Embrapa Rondônia (Circular Técnica 54) — manejo para cobertura do solo com dessecação/rolagem no pleno florescimento aos $50\text{ a }60\text{ dias}$ (cultivares BRS 1501, BRS 1502 e ADR 300), reciclando nutrientes ($\text{K}$ e $\text{N}$) e suprimindo nematoides (*Meloidogyne* spp. e *Pratylenchus brachyurus*).
- **Travas Fitossanitárias e Legais (2026/2027):** Portaria SDA/MAPA nº 1.579, de 09/04/2026, e [Orientação Oficial da Idaron/RO](https://rondonia.ro.gov.br/inicio-do-vazio-sanitario-da-soja-comeca-nesta-quarta-feira-10-em-rondonia/) — vazio sanitário da soja de 10/06 a 10/09 e janela legal de semeadura de 11/09 a 09/01.

### Catálogo inicial proposto

| Cultura | Papel no protótipo |
|---|---|
| **Soja** | Cultura comercial principal do planejamento inicial (Leguminosa – fixação biológica de $\text{N}$). |
| **Milho** | Cultura comercial de sucessão, distinguindo primeira e segunda safra (Gramínea $\text{C}_4$). |
| **Sorgo granífero** | Alternativa comercial candidata para janelas tardias de março, condicionada à aptidão e às restrições locais. |
| **Milheto** | Alternativa candidata para cobertura do solo, formação rápida de palhada e proteção contra erosão no fechamento das chuvas. |

---

## 2. Problema central e diferencial

A pergunta principal do software é:

> **“Se minha primeira cultura atrasar, qual é a menor mudança que posso fazer no restante do plano?”**

O agricultor revisa seu planejamento pré-cadastrado em Vilhena/RO e define quais decisões precisa manter. O sistema compara alternativas considerando o calendário resultante, o comportamento ano a ano na série histórica da NASA e as regras agronômicas e legais da região.

O diferencial reúne quatro pilares:

- **Dependência entre cultivos (Efeito Dominó):** o atraso na semeadura ou colheita de uma cultura desloca e limita o início da próxima etapa.
- **Mudança limitada:** o agricultor pode preservar sua próxima cultura comercial (ajustando apenas o grupo de maturação/ciclo) ou permitir alterar apenas uma etapa crítica.
- **"Teste de Estresse" contra Anos Históricos Reais (2013–2024):** em vez de resumir o clima em médias abstratas, cada alternativa mostra como o calendário teria se comportado ano a ano (ex.: *"9 anos sem alertas; 3 anos com estresse severo"*) e permite inspecionar em qual fase fenológica o evento crítico ocorreu.
- **Compromissos explícitos e proteção do solo:** trocar uma cultura comercial fora de janela por uma cultura de cobertura aparece de forma transparente como mudança de finalidade produtiva em troca de proteção do solo (redução de dias de solo exposto) e redução de risco financeiro.

Essa é a diferenciação proposta frente às referências analisadas, sem alegação de ineditismo mundial.

---

## 3. Exemplo de utilização

Um produtor com propriedade pré-cadastrada em Vilhena/RO pretende manter a soja de verão, mas deseja avaliar o efeito de um atraso no plantio (ex.: $+15\text{ a }+25\text{ dias}$) sobre a sequência seguinte.

O aplicativo compara quatro caminhos:

| Opção | Pergunta respondida |
|---|---|
| **Plano atual** | Quais alertas de chuva, temperatura, umidade do solo e janela ZARC aparecem se a sequência original for mantida apesar do atraso? |
| **Ajuste de calendário / ciclo** | Há uma mudança de ciclo (ex.: troca para cultivar precoce Grupo I) compatível com as janelas e restrições? |
| **Alternativa comercial (Sorgo)** | Outra espécie comercial do catálogo apresenta janela ZARC mais ampla (até 31/03) e menor exposição ao estresse hídrico histórico? |
| **Alternativa de cobertura (Milheto)** | Faz sentido substituir uma safrinha comercial de alto risco por uma etapa rápida ($58\text{ dias}$) destinada à cobertura viva e palhada, considerando o compromisso produtivo envolvido? |

As opções só aparecem quando passam pelas travas legais e sanitárias cadastradas. O resultado também pode ser: **“Não encontramos alternativa melhor dentro das restrições informadas.”**

---

## 4. Funcionalidades principais e hierarquia visual (4 Telas)

Para manter a experiência convidativa, clara e focada na decisão do produtor, a interface organiza o fluxo em quatro telas com separação estrita entre **informações essenciais (visíveis de imediato)** e **detalhes técnicos opcionais (recolhidos sob demanda)**:

| Tela | Essencial (Visível na superfície) | Opcional / Técnico (Sob demanda) |
|---|---|---|
| **1. Propriedade** | Exibe pré-cadastrada **somente a propriedade padrão de Vilhena/RO** (`Sequeiro · 240 ha`) e **somente a sua classe de solo** (`Solo Argiloso — Classe AD4 · 55 mm`), consultando **ao vivo a NASA POWER API** sempre que utilizada. Inclui o botão **`+ Incluir Nova Propriedade (Lat/Lon)`**, que consulta automaticamente a **NASA POWER API** e a API aberta **ISRIC SoilGrids (licença CC-BY 4.0)** para exibir uma **sugestão de classe de solo estimada** a partir da latitude e longitude informadas. | Laudo físico-químico detalhado da amostra de solo e regras legais detalhadas da Idaron/MAPA. |
| **2. Planejamento** | Controle deslizante de atraso na semeadura da soja ($0\text{ a }+80\text{ dias}$), visualização imediata do **Efeito Dominó** na 2ª safra e seleção das decisões que o produtor deseja preservar. | Ajuste fino da data base original, intervalo operacional de máquinas (dias) e configuração manual do Ano 2. |
| **3. Comparação** | Plano atual e até três alternativas lado a lado com o resumo da mudança, status na janela oficial, placar do **Teste de Estresse ano a ano (2013–2024)** com anos clicáveis, proteção do solo e compromisso prático. | Cronograma completo das 4 safras do biênio (2026–2028), cultivares utilizadas e detalhes de famílias botânicas. |
| **4. Explicação e Resumo** | Seleção do ano histórico (2013–2024), diagnóstico visual das **4 fases da cultura** (Chuva, Umidade do Solo e Temperatura em linguagem direta), resumo da recomendação em 3 pontos e botão para o **Resumo Imprimível**. | Variáveis brutas da NASA (`IMERG_PRECTOT`, `GWETTOP`, `GWETROOT`, `T2M_MAX`, `T2M_MIN`), lista de lacunas pendentes e links das fontes oficiais. |

O cenário de atraso é informado pelo usuário. Ele representa uma hipótese operacional ou climática de planejamento, sem ser apresentado como previsão meteorológica da NASA.

---

## 5. Dados da NASA

O núcleo de observação da Terra utiliza dados diários acessados via **NASA POWER API** (*Agroclimatology Community*), combinando precipitação por satélite, temperaturas de reanálise e umidade do solo na mesma requisição estruturada:

| Fonte / Produto | Parâmetro NASA POWER | Informação | Uso no software |
|---|---|---|---|
| **GPM IMERG** | `IMERG_PRECTOT` | Precipitação diária ($\text{mm/dia}$). | Calcular acumulados por fase fenológica e identificar veranicos (dias secos consecutivos) em fases críticas. |
| **MERRA-2** | `T2M_MAX` e `T2M_MIN` | Temperaturas máxima e mínima diárias a $2\text{ m}$ ($^\circ\text{C}$). | Identificar exposição a estresse térmico no florescimento (ex.: máximas $> 38\text{ a }40\text{ }^\circ\text{C}$ ou noites quentes $> 24\text{ }^\circ\text{C}$ no milho). |
| **MERRA-2 Land Surface** | `GWETTOP` | Umidade superficial do solo de $0\text{ a }5\text{ cm}$ (fração $0,0\text{ a }1,0$). | Exibir alertas de déficit de umidade para germinação e emergência na **Fase I (Estabelecimento)**. |
| **MERRA-2 Land Surface** | `GWETROOT` | Umidade na zona radicular (fração $0,0\text{ a }1,0$). | Exibir alertas de déficit de umidade radicular durante a **Fase III (Floração e Enchimento de Grãos)**. |

**Transparência espacial:** O NASA POWER documenta o produto IMERG diário em UTC, em grade de aproximadamente $10\text{ km}$ ($0,1^\circ \times 0,1^\circ$), enquanto as temperaturas e a umidade do solo derivam da reanálise MERRA-2 em resolução regional ($\approx 50\text{ km}$). O aplicativo apresenta as coordenadas consultadas ($-12,7405^\circ$, $-60,1458^\circ$) e as respectivas resoluções, sem atribuir precisão de talhão aos resultados. [Documentação das fontes do NASA POWER](https://power.larc.nasa.gov/docs/methodology/data/sources_meteorology/).

**Recorte histórico:** séries diárias completas de **2013 a 2024** ($12\text{ anos}$) para a área agrícola de Vilhena, armazenadas localmente junto ao demonstrador com registro de origem, período e parâmetros de consulta.

---

## 6. Informações locais e calendário agrícola de Vilhena/RO

A adaptação na propriedade pré-cadastrada de Vilhena/RO combina os dados orbitais da NASA com três conjuntos de regras locais:

| Referência | Aplicação no sistema |
|---|---|
| **Embrapa Rondônia e Embrapa Milho e Sorgo** | Ciclos fenológicos divididos em 4 fases ($\text{F1}$ a $\text{F4}$), funções agronômicas de saúde do solo, compatibilidade entre culturas e manejo de cobertura com milheto. |
| **ZARC do MAPA (Safra 2026/2027)** | Janelas decendiais (Decêndios 1 a 36) em Vilhena por cultura, grupo de maturação e classe de Água Disponível do solo ($\text{AD3}$, $\text{AD4}$ e $\text{AD5}$). [Orientação oficial sobre o ZARC](https://www.gov.br/agricultura/pt-br/assuntos/noticias/2026/novo-painel-do-zarc-moderniza-consulta-as-janelas-de-plantio-e-reforca-gestao-de-riscos-na-agricultura). |
| **Idaron/RO e SDA/MAPA (2026)** | Travas obrigatórias de vazio sanitário da soja (10/06 a 10/09) e limite legal de semeadura (11/09 a 09/01). [Orientação da Idaron](https://rondonia.ro.gov.br/inicio-do-vazio-sanitario-da-soja-comeca-nesta-quarta-feira-10-em-rondonia/). |

---

## 7. Como comparar as alternativas e executar o "Teste de Estresse"

O motor determinístico executa a comparação em duas etapas:

1. **Verificação de Restrições Operacionais, Legais e ZARC:** Ao aplicar o atraso na primeira cultura, o sistema propaga as novas datas de colheita e plantio ao longo dos dois anos, bloqueia imediatamente qualquer sequência que invada o vazio sanitário da Idaron e classifica cada semeadura nos decêndios de risco do ZARC ($20\%$, $30\%$, $40\%$ ou fora de janela) conforme o solo da propriedade.
2. **"Teste de Estresse" contra Anos Históricos Reais (2013–2024):** Em vez de calcular médias climáticas genéricas que escondem extremos, o motor testa o calendário resultante contra cada um dos **12 anos históricos reais** da série da NASA.
   - Os resultados aparecem em linguagem direta para o produtor: por exemplo, ***"Em 12 anos históricos (2013–2024): 9 anos sem alertas críticos; 3 anos com estresse severo na Fase III"***.
   - **Inspeção de Anos Críticos por Fase Fenológica:** O usuário pode clicar sobre qualquer ano com alerta (ex.: 2015, 2019 ou 2023) para visualizar exatamente em qual fase sensível da cultura (`Fase 1: Emergência`, `Fase 2: Crescimento`, `Fase 3: Floração e Grãos` ou `Fase 4: Maturação`) ocorreu a redução de chuva, a queda na umidade do solo ou o pico de temperatura.

Os indicadores comparativos permanecem transparentes e separados:

- Quantidade de etapas e datas alteradas em relação ao plano original do produtor.
- Desempenho no Teste de Estresse ano a ano (2013–2024) e fases fenológicas afetadas.
- Enquadramento na janela oficial do ZARC (proteção ao crédito e seguro rural).
- Diversidade de espécies/famílias botânicas e alerta de **sucessão recorrente** (quando a sequência Soja $\rightarrow$ Milho se repete nos dois anos sem rotação efetiva).
- Contador de **dias de solo protegido** por cobertura viva/palhada versus dias de solo exposto entre safras.

Os indicadores históricos são exploratórios e voltados à comparação de resiliência entre calendários. Não representam previsão de safra futura, produtividade garantida ou substituição de recomendação agronômica presencial.

---

## 8. MVP viável para a equipe pequena

O escopo fechado para desenvolvimento ágil compreende:

- Uma propriedade pré-cadastrada em Vilhena/RO (`Fazenda Chapada dos Parecis`, sequeiro).
- Catálogo validado com quatro espécies (Soja, Milho 1ª/2ª safra, Sorgo Granífero e Milheto) e cultivares reais homologadas em Rondônia.
- Comparação simultânea entre o plano atual (com atraso) e até três estratégias alternativas no horizonte de dois anos.
- Série histórica diária real da NASA (2013–2024) contendo precipitação (`IMERG_PRECTOT`), temperaturas (`T2M_MAX`, `T2M_MIN`) e umidade do solo (`GWETROOT`, `GWETTOP`).
- Teste de Estresse ano a ano com clique nos anos críticos para inspeção por fase fenológica.
- Quatro telas interativas enxutas e resumo técnico imprimível (capaz de rodar $100\%$ offline no navegador após o carregamento inicial).

---

## 9. Execução em aproximadamente 48 horas

| Período | Entrega |
|---|---|
| **0–8 horas** | Consolidar as referências ZARC/Embrapa/Idaron 2026/2027 para a propriedade pré-cadastrada de Vilhena/RO e o arquivo histórico local do NASA POWER (2013–2024) incluindo `GWETROOT` e `GWETTOP`. |
| **8–24 horas** | Implementar o motor determinístico de efeito dominó no calendário, validação decendial/sanitária e o algoritmo do Teste de Estresse ano a ano por fase fenológica. |
| **24–36 horas** | Construir as quatro telas focadas (com o perfil de Vilhena pré-cadastrado, simulação de atraso, clique em anos críticos e resumo imprimível). |
| **36–48 horas** | Conferir cálculos contra as regras documentadas, testar cenários de atraso extremo e preparar a demonstração final. |

Se for necessário reduzir escopo durante o evento, a entrega mantém a comparação completa entre o plano atual atrasado e uma alternativa comercial/cobertura com inspeção detalhada dos anos críticos.

---

## 10. Demonstração para os avaliadores

A equipe abre a aplicação com a propriedade do produtor de Vilhena/RO já pré-cadastrada e seu planejamento original de dois anos (Soja seguida de Milho 2ª safra). Em seguida, introduz um atraso hipotético na semeadura da soja, preservando a decisão do produtor de colher a cultura principal.

A aplicação demonstra visualmente:
1. O **efeito dominó** empurrando o milho safrinha para o final de março, fora da janela de baixo risco do ZARC.
2. O **Teste de Estresse ano a ano (2013–2024)** revelando quantos anos históricos sofreram déficit de chuva e de umidade radicular exatamente na Fase III (florescimento) do milho atrasado — permitindo clicar em um ano crítico para inspecionar o evento.
3. Como a troca mínima por **Sorgo Granífero** (janela até 31/03) ou **Milheto de cobertura** ($58\text{ dias}$) reduz os alertas históricos, respeita o vazio sanitário da Idaron e protege o solo.

A mensagem central para os juízes será: **dados históricos de chuva, temperatura e umidade do solo da NASA combinados às regras agronômicas locais de Vilhena/RO, ajudando o produtor a adaptar seu calendário com a menor mudança possível, de forma visual, convidativa e transparente.**

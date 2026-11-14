# Rota Adaptada — Documentação do Plano e Proposta de Solução

Proposta de software para o desafio *Field Shift: Adapting Farms with NASA Data* (NASA Space Apps Challenge 2026).

**Objetivo:** ajudar produtores e técnicos a planejar safras e comparar pequenas mudanças na cadeia de sucessões diante de atrasos operacionais ou climáticos, utilizando exclusivamente **dados agroclimáticos da NASA POWER (2013–2024)** e **APIs abertas de solo e geolocalização (ISRIC SoilGrids + OpenStreetMap Nominatim)** cruzados com as culturas e ciclos disponíveis na propriedade.

---

## 1. Escopo Enxuto e Foco Estrito nos Dados da NASA e APIs de Terceiros

Para provar o ponto de solução com máxima clareza e sem ruído técnico fora do escopo do desafio, todas as informações regulatórias, burocráticas ou laboratoriais que não são alimentadas pela NASA ou pelas APIs integradas foram removidas. O sistema opera estritamente sobre **três pilares de dados verificáveis**:

1. **Dados Agroclimáticos Diários da NASA POWER API (`2013–2024` — 12 safras históricas):**
   - `PRECTOTCORR` / `IMERG_PRECTOT`: Precipitação diária corrigida por satélite ($\text{mm/dia}$) para cálculo de chuva acumulada por fase fenológica e detecção de veranicos (dias secos consecutivos).
   - `GWETTOP`: Umidade superficial do solo de $0\text{ a }5\text{ cm}$ (fração $0,0\text{ a }1,0$) para avaliar condições de germinação e emergência na **Fase 1 (Estabelecimento)**.
   - `GWETROOT`: Umidade na zona radicular (fração $0,0\text{ a }1,0$) para diagnosticar déficit hídrico durante a **Fase 3 (Floração e Enchimento de Grãos)**.
   - `T2M_MAX` e `T2M_MIN`: Temperaturas máxima e mínima diárias a $2\text{ m}$ ($^\circ\text{C}$) para identificar picos de calor e estresse térmico noturno.
   - `Altitude (m)`: Extraída da geometria do ponto consultado na NASA POWER.

2. **Dados de Solo e Localização via APIs de Terceiros (`ISRIC SoilGrids v2.0` + `OpenStreetMap Nominatim` + `Web Geolocation GPS`):**
   - **ISRIC SoilGrids v2.0 REST API:** Consulta os teores médios estimados de argila (`clay`) e areia (`sand`) na camada de $0\text{ a }60\text{ cm}$ para sugerir automaticamente a classe de retenção de água do solo:
     - **Solo de Textura Média (`AD3_MEDIA` — reserva útil de $48\text{ mm}$):** Maior sensibilidade a veranicos; fechamento mais cedo da janela segura de 2ª safra.
     - **Solo Argiloso (`AD4_ARGILOSA` — reserva útil de $62\text{ mm}$):** Equilíbrio entre drenagem e retenção hídrica (perfil pré-cadastrado de referência em Vilhena/RO).
     - **Solo Muito Argiloso (`AD5_MUITO_ARGILOSA` — reserva útil de $78\text{ mm}$):** Maior amortecimento hídrico na transição para a estação seca.
   - **OpenStreetMap Nominatim API:** Geocodificação reversa das coordenadas (`latitude`/`longitude`) para preenchimento automático de **Município** e **UF**.

3. **Catálogo Dinâmico de Culturas e Ciclos (Pré-Cadastrados + Cadastrados pelo Usuário):**
   - Cada cultura possui ciclos fenológicos em dias (automaticamente fatiados nas 4 fases da planta: **F1 Emergência**, **F2 Crescimento Vegetativo**, **F3 Floração/Enchimento** e **F4 Maturação/Colheita**), janelas recomendadas de plantio ajustadas pela classe de solo e limites de tolerância climática testados contra a série da NASA.

---

## 2. Catálogo de Culturas, Finalidades sem Restrição de Safra e Cadastro de Ciclos

O sistema parte de 4 culturas pré-cadastradas de referência para Vilhena/RO e permite que o usuário expanda livremente tanto as **culturas** quanto os **ciclos de duração**:

### 2.1. Culturas Pré-Cadastradas
| Cultura | Finalidade no Planejamento | Ciclos Pré-Cadastrados | Janela Recomendada Base |
|---|---|---|---|
| **Soja** | Safra Principal (1ª Safra / Verão) | Ciclo Precoce ($105\text{d}$) · Ciclo Médio ($115\text{d}$) | 01/10 a 10/01 |
| **Milho 2ª Safra** | 2ª Safra Comercial (Sucessão) | Ciclo Precoce ($100\text{d}$) · Ciclo Médio ($110\text{d}$) | 01/01 a 20/03 |
| **Sorgo Granífero** | Alternativa Comercial (Maior Tolerância à Seca) | Ciclo Precoce ($95\text{d}$) · Ciclo Médio ($108\text{d}$) | 01/01 a 31/03 |
| **Milheto** | Cobertura do Solo / Formação de Palhada | Ciclo Rápido ($58\text{d}$) · Ciclo Médio ($75\text{d}$) | 01/01 a 30/04 |

### 2.2. Cadastro de Nova Cultura sem Restrição à 2ª Safra
Como o produtor pode cadastrar novas propriedades e desenhar sucessões variadas, o campo **Papel / Finalidade no Planejamento e Sucessão** não restringe a cultura à 2ª safra, oferecendo **4 finalidades**:
1. **`SAFRA_PRINCIPAL` (`1ª Safra / Safra Principal · Cultura Base de Abertura`)**: Permite iniciar o planejamento ou substituir a cultura principal por uma versão de ciclo mais curto diante de atraso.
2. **`ALTERNATIVA_COMERCIAL` (`2ª Safra / Sucessão Comercial · Produção de Grãos ou Fibra`)**: Entra na sucessão comercial pós-colheita da 1ª safra.
3. **`ROTACAO_CULTURAS` (`Rotação / Diversificação · Qualquer Etapa da Sucessão`)**: Permite alternar espécies na 1ª safra do Ano 2 ou nas sucessões para quebrar ciclos de estresse.
4. **`COBERTURA_SOLO` (`Cobertura do Solo / Palhada · Proteção e Conservação Hídrica`)**: Foca na proteção física do solo e conservação da umidade (`GWETTOP`/`GWETROOT`) na transição para a seca.

Ao cadastrar uma nova cultura, o usuário já define a **Duração do Ciclo Médio (dias)** e a **Duração do Ciclo Precoce (dias)**, registrando automaticamente ambas as opções de ciclo para uso no planejamento e no ajuste de ciclo.

### 2.3. Cadastro Independente de Novos Ciclos (`+ Cadastrar Novo Ciclo`)
Disponível tanto na tela de **Culturas (Passo 2)** quanto na tela de **Planejamento (Passo 3)** (inclusive dentro de cada etapa da sucessão via botão **`+ Cadastrar Ciclo`**):
- O usuário escolhe qualquer cultura disponível, informa o **Nome / Tipo do Ciclo** (ex.: *Ciclo Superprecoce*, *Ciclo Tardio*) e a **Duração Total em Dias** ($40\text{ a }180\text{ dias}$).
- O motor divide automaticamente a duração informada nas 4 fases fenológicas ($\text{F1: }14\%$, $\text{F2: }31\%$, $\text{F3: }35\%$, $\text{F4: }20\%$) e disponibiliza o ciclo imediatamente nos seletores do planejamento e nas simulações da NASA POWER.

---

## 3. Arquitetura do Planejamento e Sugestão Inteligente do Sistema (Baralho de 3 Cartas)

Na tela **3. Planejamento**, o usuário conta com:

1. **Planejamentos Disponíveis (Pré-Cadastrado + Cadastrados pelo Usuário):**
   - Cada card de planejamento exibe a **propriedade vinculada**, o **perfil de solo**, a **data inicial do 1º plantio**, o **intervalo operacional** e o fluxo visual completo da **ordem das culturas, ciclos e sucessões** (`1ª Safra Inicial ➔ 1ª Sucessão ➔ 2ª Sucessão ➔ 3ª Sucessão...`).

2. **Inclusão de Novo Planejamento (`+ Incluir Novo Planejamento`) com Campos Iniciais em Branco:**
   - Permite escolher qualquer propriedade disponível (pré-cadastrada ou cadastrada pelo usuário), definir a data inicial e o intervalo operacional entre safras, e montar passo a passo a **ordem cronológica das sucessões** (com botões para adicionar etapas, remover etapas ou reordenar com `↑ Subir` e `↓ Descer`).
   - Ao clicar em **`+ Incluir Novo Planejamento`** (ou em **`+ Adicionar Etapa na Sucessão`**), os campos de **Cultura** e **Ciclo na Etapa** vêm **em branco**, evitando preenchimentos automáticos indesejados até que o usuário escolha cada etapa ou acione a sugestão do sistema.

3. **Sugestão de Planejamento pelo Sistema (`✨ Sugerir Planejamento (NASA + APIs)`):**
   - Localizado exclusivamente dentro do painel **Incluir Novo Planejamento**.
   - **Elemento de Loading Animado:** Ao clicar no botão, exibe um indicador visual de carregamento informando a consulta e o cruzamento entre a série histórica **NASA POWER (2013–2024)**, a classe de solo **ISRIC SoilGrids** da propriedade selecionada e todas as combinações de culturas e ciclos disponíveis.
   - **Exibição em 3 Cartas de Baralho (`♠ CARTA 01`, `♦ CARTA 02`, `♣ CARTA 03`) + Botão de Cancelar/Sair:**
     - **`♠ CARTA 01` — Opção 1 · Segurança Comercial (NASA + Solo):** Seleciona a combinação de safra principal e sucessão comercial com maior número de anos sem falha severa nos 12 anos da NASA POWER e melhor encaixe na janela hídrica do solo da propriedade.
     - **`♦ CARTA 02` — Opção 2 · Rotação Diversificada:** Prioriza a diversidade de culturas na sequência do biênio (incluindo culturas e ciclos cadastrados pelo usuário) e equilíbrio hídrico.
     - **`♣ CARTA 03` — Opção 3 · Blindagem e Cobertura do Solo:** Maximiza os dias de solo coberto no biênio e reduz a exigência de água na zona radicular (`GWETROOT`) no fechamento das chuvas.
   - Em cada carta, o usuário pode clicar em **`🃏 Escolher CARTA 0X (Incluir e Ativar) →`**, **`↳ Carregar no Formulário (Editar Antes)`** ou fechar a qualquer momento pelo botão **`✕ Cancelar / Sair`**.

---

## 4. Fluxo de 5 Telas da Aplicação (`rota-adaptada-novo/src/main.js`)

| Passo / Tela | Foco Principal e Funcionalidades |
|---|---|
| **1. Propriedade** | Propriedade pré-cadastrada de Vilhena/RO com consulta ao vivo à **NASA POWER API**; botão **`+ Incluir Nova Propriedade (Lat/Lon)`** que consulta automaticamente **NASA POWER**, **ISRIC SoilGrids v2.0** (sugestão de classe de solo `AD3`/`AD4`/`AD5` a partir de `% argila` e `% areia`) e **OpenStreetMap Nominatim** (Município/UF). |
| **2. Culturas** | Catálogo enxuto de culturas e ciclos utilizados pela simulação; **`+ Cadastrar Nova Cultura`** (com 4 finalidades de sucessão e cadastro duplo de Ciclo Médio e Ciclo Precoce) e **`+ Cadastrar Novo Ciclo`** (em dias) para qualquer cultura. |
| **3. Planejamento** | Seleção entre o planejamento pré-cadastrado e os planejamentos do usuário; **`+ Cadastrar Novo Ciclo`**; **`+ Incluir Novo Planejamento`** (iniciando com campos de cultura e ciclo em branco, reordenação de sucessões e botão interno **`✨ Sugerir Planejamento (NASA + APIs)`** com loading e 3 cartas de baralho); e **Simulador de Atraso (`0` a `+45 dias`)** com visualização do **Efeito Dominó**. |
| **4. Comparação** | **Preferências do Produtor** integradas no topo da tela (filtros de ajuste de ciclo, troca comercial e transição para cobertura); comparação lado a lado entre o **Plano Atual (com atraso)** e as **Alternativas de Adaptação**, exibindo o placar nos **12 anos da NASA POWER (`2013–2024`)**, janela recomendada, dias de solo protegido e anos clicáveis. |
| **5. Explicação e Resumo** | Inspeção ano a ano (`2013–2024`) das **4 fases da planta (`F1` a `F4`)** com base em Chuva (`PRECTOTCORR`), Umidade Superficial (`GWETTOP`), Umidade Radicular (`GWETROOT`) e Temperatura (`T2M_MAX`/`T2M_MIN`), síntese da decisão e geração do **Relatório Imprimível (PDF / A4)**. |

---

## 5. Como o Motor Determinístico Executa o Teste Histórico (2013–2024)

1. **Propagação do Calendário e Efeito Dominó (`resolveSuccessionSchedule`):**
   - A partir da data base da 1ª safra, da duração em dias do ciclo escolhido em cada etapa e do intervalo operacional de máquinas, o motor calcula as datas exatas de semeadura e colheita de todas as sucessões, com e sem o atraso simulado.
2. **Avaliação da Janela Recomendada por Classe de Solo (`evaluateZarcWindow`):**
   - Verifica se a data de semeadura de cada etapa cai no período ideal, na faixa de transição ou fora da janela recomendada para a classe de retenção hídrica do solo (`AD3_MEDIA`, `AD4_ARGILOSA` ou `AD5_MUITO_ARGILOSA`).
3. **Teste de Estresse nos 12 Anos da NASA POWER (`runHistoricalStressTest`):**
   - Reaplica o calendário de cada etapa nos 12 anos reais da série histórica da NASA (`2013–2024`), avaliando fase por fase (`F1` a `F4`) a chuva acumulada, o maior veranico (dias secos consecutivos), a umidade superficial (`GWETTOP`), a umidade na zona radicular (`GWETROOT`) e os extremos de temperatura (`T2M_MAX` e `T2M_MIN`), classificando cada ano como **Favorável (`OK`)**, **Alerta Moderado (`MODERADO`)** ou **Falha Severa (`SEVERO`)**.

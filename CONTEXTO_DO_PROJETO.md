# Contexto do Projeto — Rota Adaptada (Histórico de Implementações, Remoções, Alterações e Decisões)

Este documento consolida o contexto completo de evolução do projeto **Rota Adaptada** (*NASA Space Apps Challenge 2026 — Field Shift: Adapting Farms with NASA Data*), detalhando **o que foi implementado**, **o que foi alterado**, **o que foi removido** e **todas as decisões técnicas e de produto tomadas até este ponto**.

---

## 1. Visão Geral e Objetivo Central

- **Problema resolvido:** Apoiar produtores e técnicos no planejamento de safras e na adaptação da cadeia de sucessões diante de atrasos na semeadura da primeira cultura (*“Se a minha primeira cultura atrasar, qual é a menor mudança que posso fazer no restante do plano para continuar viável?”*).
- **Princípio norteador ("Enxuto e Comprovável"):** Manter na aplicação **somente** as informações que são efetivamente consumidas ou geradas pelos **dados da NASA POWER (`2013–2024`)**, pelas **APIs abertas de terceiros (`ISRIC SoilGrids v2.0`, `OpenStreetMap Nominatim` e `Web Geolocation GPS`)** e pelo **motor determinístico de sucessão de culturas e ciclos**.

---

## 2. O Que Foi Implementado

### 2.1. Integração ao Vivo com Dados da NASA e APIs de Terceiros (Passo 1 — Propriedade)
- **Propriedade Pré-Cadastrada de Referência:** `Fazenda Chapada dos Parecis` (Vilhena/RO, `Lat -12.7405`, `Lon -60.1458`, `Solo Argiloso — Classe AD4 · 62 mm`), com consulta ao vivo à **NASA POWER API** e fallback offline local (`4.383 dias` entre `2013–2024`).
- **Cadastro de Nova Propriedade por Coordenadas ou GPS (`+ Incluir Nova Propriedade`):**
  1. **NASA POWER API (`api/temporal/daily/point`):** Consulta ao vivo a série diária de `2013` a `2024` para `PRECTOTCORR` (`IMERG_PRECTOT`), `T2M_MAX`, `T2M_MIN`, `GWETROOT`, `GWETTOP` e `Altitude (m)`.
  2. **ISRIC SoilGrids v2.0 REST API:** Consulta os teores estimados de argila (`clay`) e areia (`sand`) na camada `0–60 cm` e sugere automaticamente a classe de retenção hídrica do solo (`AD3_MEDIA` — 48 mm, `AD4_ARGILOSA` — 62 mm ou `AD5_MUITO_ARGILOSA` — 78 mm).
  3. **OpenStreetMap Nominatim API:** Faz geocodificação reversa das coordenadas para preencher automaticamente **Município** e **UF**.
  4. **Web Geolocation API (`GPS`):** Permite capturar automaticamente a latitude e longitude atuais do dispositivo.

### 2.2. Cadastro de Culturas sem Restrição de Safra e Cadastro de Ciclos (Passo 2 — Culturas)
- **Remoção da trava de 2ª Safra no cadastro de cultura (`CUSTOM_CROP_ROLES` em `src/vilhena-engine.js`):**
  - O campo **Papel / Finalidade no Planejamento e Sucessão** passou a suportar **4 finalidades distintas**:
    1. **`SAFRA_PRINCIPAL`**: *1ª Safra / Safra Principal · Cultura Base de Abertura*
    2. **`ALTERNATIVA_COMERCIAL`**: *2ª Safra / Sucessão Comercial · Produção de Grãos ou Fibra*
    3. **`ROTACAO_CULTURAS`**: *Rotação / Diversificação · Qualquer Etapa da Sucessão*
    4. **`COBERTURA_SOLO`**: *Cobertura do Solo / Palhada · Proteção e Conservação Hídrica*
- **Registro Duplo de Ciclos ao Cadastrar Cultura:**
  - O formulário **`+ Cadastrar Nova Cultura`** registra simultaneamente a **Duração do Ciclo Médio (dias)** e a **Duração do Ciclo Precoce (dias)**, permitindo que o motor teste automaticamente tanto o ciclo padrão quanto o encurtamento de ciclo diante de atrasos.
- **Cadastro Independente de Novos Ciclos (`+ Cadastrar Novo Ciclo`):**
  - Implementado tanto no **Passo 2 (Culturas)** quanto no **Passo 3 (Planejamento)** (e dentro de cada etapa da sucessão via botão **`+ Cadastrar Ciclo`**).
  - Permite escolher qualquer cultura (pré-cadastrada ou cadastrada pelo usuário), dar um nome ao ciclo (ex.: *Ciclo Superprecoce*, *Ciclo Tardio*) e informar a duração total em dias (`40` a `180 dias`).
  - A função `buildCycleGroupObject` divide automaticamente os dias do ciclo nas 4 fases fenológicas da planta (`F1: 14%`, `F2: 31%`, `F3: 35%`, `F4: 20%`) para avaliação na série histórica da NASA POWER.

### 2.3. Gestão Completa de Planejamentos e Cadeia Ordenada de Sucessões (Passo 3 — Planejamento)
- **Planejamentos Disponíveis (Pré-Cadastrado + Cadastrados pelo Usuário):**
  - Exibe cards para o planejamento pré-cadastrado e para todos os planejamentos criados pelo usuário, detalhando a **propriedade vinculada**, a **classe de solo**, a **data base do 1º plantio**, o **intervalo operacional** e a **sequência ordenada de culturas, ciclos e sucessões** (`1ª Safra Inicial ➔ 1ª Sucessão ➔ 2ª Sucessão ➔ 3ª Sucessão...`).
- **Montador de Novo Planejamento (`+ Incluir Novo Planejamento`):**
  - Permite selecionar qualquer propriedade disponível (pré-cadastrada ou do usuário), definir a data inicial do 1º plantio e o intervalo operacional entre safras (`5` a `30 dias`).
  - Permite montar a cadeia de sucessões respeitando a ordem cronológica, com cálculo automático da data de semeadura e colheita de cada etapa a partir da colheita da etapa anterior (`resolveSuccessionSchedule`), além de botões para adicionar etapa (`+ Adicionar Etapa na Sucessão`), remover etapa (`✕`) e reordenar etapas (`↑ Subir` / `↓ Descer`).
  - **Campos Iniciais em Branco (`createBlankPlanningStages`):** Ao clicar em **`+ Incluir Novo Planejamento`** (ou em **`+ Adicionar Etapa na Sucessão`**), os campos de **Cultura** e **Ciclo na Etapa** vêm **em branco** (`cropId: ''`, `groupKey: ''`), aguardando a seleção do usuário ou o uso da sugestão do sistema.

### 2.4. Sugestão de Planejamento pelo Sistema em Cartas de Baralho (`✨ Sugerir Planejamento (NASA + APIs)`)
- **Posicionamento Exclusivo:** O botão **`✨ Sugerir Planejamento (NASA + APIs)`** fica localizado exclusivamente dentro do painel **`+ Incluir Novo Planejamento`**.
- **Elemento de Loading Animado:** Ao acionar a sugestão (ou alterar a propriedade/data analisada), exibe um painel de carregamento com spinner (`suggestion-loading-box`) e etapas visuais enquanto consulta e cruza a série **NASA POWER (`2013–2024`)**, o perfil de solo **ISRIC SoilGrids** e o catálogo de culturas e ciclos.
- **Motor de Recomendação (`generateSystemSuggestedPlannings` em `src/vilhena-engine.js`):**
  - Avalia as combinações de culturas e ciclos disponíveis contra os 12 anos da NASA POWER e a classe de solo da propriedade, pontuando cada sequência por anos sem falha severa (`noCriticalYears`), anos favoráveis (`okYears`), enquadramento na janela recomendada para o solo, chuva média no ciclo (`avgCycleRainMm`), umidade radicular na floração (`avgF3GwetRootPct`) e dias de cobertura do solo (`protectedDays`).
- **Exibição em 3 Cartas de Baralho (`playing-deck-stage` / `playing-card`) + Botão Cancelar/Sair:**
  - **`♠ CARTA 01` — Opção 1 · Segurança Comercial (NASA + Solo):** Maior estabilidade hídrica para produção comercial de 1ª e 2ª safra no solo da propriedade.
  - **`♦ CARTA 02` — Opção 2 · Rotação Diversificada:** Alternância de espécies nas etapas do biênio (priorizando também culturas e ciclos cadastrados pelo usuário) e equilíbrio hídrico.
  - **`♣ CARTA 03` — Opção 3 · Blindagem e Cobertura do Solo:** Máxima proteção física do solo e menor demanda de água radicular (`GWETROOT`) na transição para a estação seca.
  - Cada carta permite **`🃏 Escolher CARTA 0X (Incluir e Ativar) →`** (salva e ativa imediatamente), **`↳ Carregar no Formulário (Editar Antes)`** (preenche as etapas no montador para ajustes manuais), ou fechar a qualquer momento com o botão **`✕ Cancelar / Sair`**.

---

## 3. O Que Foi Alterado

1. **Estrutura de Navegação (De 4 para 5 Passos Dedicados):**
   - **Passo 1:** `1. Propriedade`
   - **Passo 2:** `2. Culturas` (separado em tela própria para dar clareza ao catálogo de culturas e ciclos)
   - **Passo 3:** `3. Planejamento`
   - **Passo 4:** `4. Comparação`
   - **Passo 5:** `5. Explicação e Resumo`
2. **Mudança das Preferências do Produtor para a Tela de Comparação (Passo 4):**
   - Os controles de **Preferências do Produtor** (`Permitir ajuste de ciclo para mais curto`, `Permitir troca por alternativa comercial na sucessão`, `Permitir transição para planta de cobertura do solo`) foram movidos do Passo 3 (Planejamento) para o topo do **Passo 4 (Comparação)**, permitindo que o usuário ligue/desligue filtros vendo imediatamente os cards comparativos serem atualizados ao lado.
3. **Nomenclatura de Ciclos Centrada na Duração em Dias:**
   - Substituída a exibição de nomes comerciais/mantenedores de cultivares por rótulos funcionais baseados no tipo e duração do ciclo (ex.: `Ciclo Precoce (105d)`, `Ciclo Médio (115d)`, `Ciclo Rápido (58d)`), pois o que altera matematicamente o cálculo da NASA POWER é a duração do ciclo em dias e a distribuição nas 4 fases (`F1` a `F4`).

---

## 4. O Que Foi Removido (Limpeza de Escopo)

Para eliminar informações técnicas que não eram utilizadas pelos dados da NASA ou pelas APIs de terceiros, foram removidos da interface (`src/main.js`), do motor (`src/vilhena-engine.js`) e do relatório (`src/vilhena-report.js`):

- **Campos regulatórios e burocráticos estáticos:** Números de Portarias SPA/MAPA, códigos RNC de cultivares, nomes de mantenedores comerciais e referências normativas jurídicas.
- **Travas legais estáticas de vazio sanitário (Idaron):** Removidas as verificações e mensagens de bloqueio jurídico da Idaron (`checkIdaronSanitaryRules`), mantendo o foco 100% no risco agroclimático medido pela NASA POWER e na janela recomendada por classe de solo.
- **Metadados botânicos/taxonômicos não utilizados pelo motor:** Nomes científicos em latim (`Glycine max`, `Zea mays`, etc.), seleção manual de família botânica no cadastro de cultura e notas descritivas de pragas/nematoides que não faziam parte das variáveis da NASA.
- **Campos de laudo químico laboratorial do solo:** Removidas gavetas de laudo químico manual (pH, matéria orgânica, etc.), mantendo apenas a textura física (`% argila` e `% areia`) e a capacidade de água disponível (`mm`) obtidas via **ISRIC SoilGrids**.

---

## 5. Resumo das Decisões Técnicas e de Produto Tomadas

| # | Decisão Tomada | Motivação / Justificativa | Arquivos Principais Impactados |
|---|---|---|---|
| **D1** | Remover a restrição de "2ª Safra" no cadastro de nova cultura e criar 4 finalidades (`SAFRA_PRINCIPAL`, `ALTERNATIVA_COMERCIAL`, `ROTACAO_CULTURAS`, `COBERTURA_SOLO`). | Uma nova propriedade ou um novo planejamento pode demandar culturas para a 1ª safra, rotação no Ano 2, sucessão comercial ou cobertura do solo. | `rota-adaptada-novo/src/vilhena-engine.js`, `rota-adaptada-novo/src/main.js` |
| **D2** | Permitir múltiplos planejamentos (pré-cadastrado + usuário) com cadeia explícita e ordenada de sucessões. | O usuário precisa visualizar quais culturas e sucessões pertencem a cada planejamento e montar novas sequências respeitando a ordem cronológica. | `rota-adaptada-novo/src/vilhena-engine.js`, `rota-adaptada-novo/src/main.js` |
| **D3** | Mover **Preferências do Produtor** da tela de Planejamento para a tela de **Comparação (Passo 4)**. | As preferências funcionam como filtros de decisão sobre as alternativas geradas; posicioná-las na tela de Comparação torna o efeito do filtro imediato e intuitivo. | `rota-adaptada-novo/src/main.js` |
| **D4** | Manter apenas dados utilizados pela **NASA POWER** e **APIs de terceiros (SoilGrids / Nominatim / GPS)**. | Evita poluição visual com dados burocráticos/regulatórios que não entram nas equações climáticas e comprova de forma direta o valor dos dados da NASA no desafio. | `rota-adaptada-novo/src/vilhena-engine.js`, `rota-adaptada-novo/src/vilhena-report.js`, `rota-adaptada-novo/src/main.js` |
| **D5** | Explicitar o **Cadastramento de Ciclo (em dias)** tanto no cadastro de cultura quanto em painel dedicado (`+ Cadastrar Novo Ciclo`) nos Passos 2 e 3. | O ciclo (em dias) é a variável que define quando uma cultura colhe e quando a próxima entra na janela climática da NASA POWER. | `rota-adaptada-novo/src/vilhena-engine.js`, `rota-adaptada-novo/src/main.js` |
| **D6** | Implementar a **Sugestão do Sistema (`✨ Sugerir Planejamento (NASA + APIs)`)** exclusivamente dentro de **Incluir Novo Planejamento**, com **loading** e exibição em **3 cartas de baralho** + botão **Cancelar/Sair**. | Oferece recomendação automatizada baseada nos dados reais da NASA + SoilGrids + cultivos disponíveis, com experiência visual fluida e interativa em formato de cartas (`♠ CARTA 01`, `♦ CARTA 02`, `♣ CARTA 03`). | `rota-adaptada-novo/src/vilhena-engine.js`, `rota-adaptada-novo/src/main.js`, `rota-adaptada-novo/src/style.css` |
| **D7** | Iniciar os campos de **Cultura** e **Ciclo na Etapa** **em branco** ao clicar em **`+ Incluir Novo Planejamento`**. | Garante que o usuário monte conscientemente cada etapa da sucessão a partir do zero ou escolha explicitamente uma das cartas sugeridas pelo sistema. | `rota-adaptada-novo/src/main.js` |

---

## 6. Mapa dos Arquivos Principais do Projeto

- **Motor Determinístico, Integrações NASA POWER / SoilGrids / Nominatim e Sugestão de Planos:**  
  [`rota-adaptada-novo/src/vilhena-engine.js`](rota-adaptada-novo/src/vilhena-engine.js)
- **Interface das 5 Telas, Cadastros de Propriedade/Cultura/Ciclo/Planejamento e Baralho de Sugestões:**  
  [`rota-adaptada-novo/src/main.js`](rota-adaptada-novo/src/main.js)
- **Gerador do Relatório Imprimível (A4 / PDF Offline):**  
  [`rota-adaptada-novo/src/vilhena-report.js`](rota-adaptada-novo/src/vilhena-report.js)
- **Estilos Visuais, Animação de Loading e Layout de Cartas de Baralho:**  
  [`rota-adaptada-novo/src/style.css`](rota-adaptada-novo/src/style.css)
- **Documentação do Plano e Conexões de API:**  
  [`rota_adaptada_proposta_de_software.md`](rota_adaptada_proposta_de_software.md) · [`DADOS_CONEXAO_APIS.md`](DADOS_CONEXAO_APIS.md) · [`docs/ESCOPO_RONDONIA.md`](docs/ESCOPO_RONDONIA.md)

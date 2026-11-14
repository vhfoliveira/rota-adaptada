# Rota Adaptada — Escopo do Projeto e Regras do Motor Determinístico

## 1. Tese do Produto

A **Rota Adaptada** responde a uma decisão prática de planejamento agrícola:

> *Quando a primeira cultura atrasa, qual é a menor mudança justificável no restante do planejamento — ou qual o melhor plano sugerido pelo sistema — considerando os 12 anos de dados agroclimáticos da NASA POWER, a classe de retenção hídrica do solo (ISRIC SoilGrids), o catálogo de culturas/ciclos disponíveis e as preferências do produtor?*

---

## 2. Fontes Ativas de Decisão (Escopo Estrito)

Todas as informações fora do escopo das APIs integradas foram removidas para manter a solução 100% focada e comprovável:

| Camada | Origem | Uso no Motor (`vilhena-engine.js`) |
| --- | --- | --- |
| **Precipitação Diária** | **NASA POWER API** (`PRECTOTCORR` / `IMERG_PRECTOT`) | Soma de chuva acumulada por fase fenológica (`F1` a `F4`) e contagem de veranicos (dias secos consecutivos) nos 12 anos (`2013–2024`). |
| **Umidade do Solo** | **NASA POWER API / MERRA-2** (`GWETTOP` e `GWETROOT`) | Avaliação de umidade superficial na emergência (`F1`) e umidade na zona radicular no florescimento/enchimento (`F3`). |
| **Temperatura Diária** | **NASA POWER API / MERRA-2** (`T2M_MAX` e `T2M_MIN`) | Identificação de picos de calor diurno e noites quentes durante fases reprodutivas. |
| **Solo e Retenção Hídrica** | **ISRIC SoilGrids v2.0 API** (`clay`, `sand` `0–60 cm`) | Estimativa de textura e sugestão automática da classe de retenção de água (`AD3_MEDIA` 48 mm, `AD4_ARGILOSA` 62 mm, `AD5_MUITO_ARGILOSA` 78 mm). |
| **Localização Municipal** | **OpenStreetMap Nominatim API** + **Web Geolocation GPS** | Identificação automática de Município e UF a partir de Latitude/Longitude. |
| **Culturas e Ciclos** | **Catálogo Pré-Cadastrado + Cadastros do Usuário** | 4 finalidades de sucessão (`SAFRA_PRINCIPAL`, `ALTERNATIVA_COMERCIAL`, `ROTACAO_CULTURAS`, `COBERTURA_SOLO`) e ciclos em dias fatiados nas 4 fases da planta. |

---

## 3. Funcionalidades Consolidados no Fluxo de 5 Passos

1. **Passo 1 — Propriedade:**
   - Propriedade pré-cadastrada de Vilhena/RO e inclusão de novas propriedades por coordenadas (`Lat`/`Lon` ou GPS) com consulta automática à **NASA POWER**, **ISRIC SoilGrids** e **Nominatim**.
2. **Passo 2 — Culturas:**
   - Cadastro de novas culturas sem restrição à 2ª safra (4 finalidades no planejamento) com registro duplo de **Ciclo Médio** e **Ciclo Precoce** (em dias).
   - Cadastro de novos ciclos (`+ Cadastrar Novo Ciclo`) para qualquer cultura disponível.
3. **Passo 3 — Planejamento:**
   - Planejamento pré-cadastrado e inclusão de novos planejamentos (`+ Incluir Novo Planejamento`) vinculando propriedade, data inicial, intervalo operacional e ordem cronológica das sucessões.
   - Campos de **Cultura** e **Ciclo na Etapa** iniciam **em branco** ao abrir um novo planejamento ou adicionar etapa.
   - Botão **`✨ Sugerir Planejamento (NASA + APIs)`** (exclusivo dentro de *Incluir Novo Planejamento*), com **elemento de loading** durante a consulta e exibição de **3 opções em cartas de baralho (`♠ CARTA 01`, `♦ CARTA 02`, `♣ CARTA 03`)** + botão **Cancelar / Sair**.
   - Cadastro rápido de novos ciclos (`+ Cadastrar Novo Ciclo` / `+ Cadastrar Ciclo`) e simulador de atraso (`0` a `+45 dias`) com cálculo do **Efeito Dominó**.
4. **Passo 4 — Comparação:**
   - **Preferências do Produtor** posicionadas na tela de Comparação para filtrar em tempo real as alternativas aceitas.
   - Comparação lado a lado entre o Plano Atual (com atraso) e as Alternativas nos 12 anos da NASA POWER (`2013–2024`).
5. **Passo 5 — Explicação e Resumo:**
   - Diagnóstico por ano histórico (`2013–2024`) nas 4 fases da planta (`F1` a `F4`) e **Relatório Imprimível (PDF / A4)**.

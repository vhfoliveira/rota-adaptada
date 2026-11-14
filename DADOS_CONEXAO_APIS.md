# Mapeamento de Conexões de API e Fontes de Dados — Rota Adaptada

Este documento reúne todos os dados de conexão de API, endpoints, parâmetros, cabeçalhos/timeouts, estruturas de resposta e fontes externas encontrados no projeto **Rota Adaptada**, separados entre **ecossistema NASA** e **serviços de terceiros**.

---

## 1. APIs e Fontes de Dados da NASA

### 1.1. Conexão Ativa (Consulta ao Vivo) — NASA POWER API v2 (Daily Agroclimatology)

A aplicação realiza consultas HTTP ao vivo diretamente do navegador para obter a série histórica diária (`2013–2024`) de qualquer coordenada informada.

- **Provedor:** NASA Langley Research Center (LaRC) — *Prediction Of Worldwide Energy Resources (POWER)*
- **Comunidade:** `AG` (*Agroclimatology*)
- **Arquivo de implementação:** `rota-adaptada-novo/src/vilhena-engine.js` (função `fetchLiveNasaPower(lat, lon)`)
- **Consumo na interface:** `rota-adaptada-novo/src/main.js` (funções `refreshLiveNasaForActiveProperty` e `showNasaModal`)
- **Método HTTP:** `GET`
- **Autenticação:** Pública (sem necessidade de API Key ou token)
- **Timeout de requisição:** `14000 ms` (14 segundos via `AbortController`)
- **Endpoint Base:**
  ```text
  https://power.larc.nasa.gov/api/temporal/daily/point
  ```
- **URL de Requisição ao Vivo (implementada no código):**
  ```text
  https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR,T2M_MAX,T2M_MIN,GWETROOT,GWETTOP&community=AG&longitude={cleanLon}&latitude={cleanLat}&start=20130101&end=20241231&format=JSON
  ```
- **URL Template de Referência (registrada em `vilhena_rules-v2.json` e `nasa-vilhena-2013-2024.json`):**
  ```text
  https://power.larc.nasa.gov/api/temporal/daily/point?parameters=IMERG_PRECTOT,PRECTOTCORR,T2M_MAX,T2M_MIN,T2M,GWETROOT,GWETTOP&community=AG&longitude=-60.1458&latitude=-12.7405&start=20130101&end=20241231&format=JSON
  ```

#### Parâmetros de Query (`GET`)
| Parâmetro | Valor utilizado | Descrição |
|---|---|---|
| `parameters` | `PRECTOTCORR,T2M_MAX,T2M_MIN,GWETROOT,GWETTOP` | Lista de variáveis agroclimáticas diárias solicitadas. |
| `community` | `AG` | Comunidade de Agroclimatologia da NASA POWER. |
| `longitude` | `{cleanLon}` (ex.: `-60.1458`) | Longitude em graus decimais (`WGS84`), arredondada para 4 casas decimais. |
| `latitude` | `{cleanLat}` (ex.: `-12.7405`) | Latitude em graus decimais (`WGS84`), arredondada para 4 casas decimais. |
| `start` | `20130101` | Data inicial da série histórica (`YYYYMMDD` — 01/01/2013). |
| `end` | `20241231` | Data final da série histórica (`YYYYMMDD` — 31/12/2024). |
| `format` | `JSON` | Formato de retorno da API. |

#### Variáveis Retornadas e Mapeamento Interno
Os dados são extraídos de `raw.properties.parameter` e da geometria `raw.geometry.coordinates[2]`:

| Parâmetro na API | Nome Interno no App | Fonte Satélite / Modelo | Unidade | Resolução Espacial | Tratamento / Fallback de Valor Inválido |
|---|---|---|---|---|---|
| `PRECTOTCORR` | `IMERG_PRECTOT` | NASA GPM IMERG (corrigido) | `mm/dia` | `~10 km` (`0.1° x 0.1°`, UTC) | Se `< 0` (ex.: `-999`), assume `0` |
| `T2M_MAX` | `T2M_MAX` | NASA MERRA-2 Reanalysis | `°C` (a 2 m) | `~50 km` (`0.5° x 0.625°`) | Se `<= -90`, assume `30.0` |
| `T2M_MIN` | `T2M_MIN` | NASA MERRA-2 Reanalysis | `°C` (a 2 m) | `~50 km` (`0.5° x 0.625°`) | Se `<= -90`, assume `20.0` |
| `GWETROOT` | `GWETROOT` | NASA MERRA-2 Land Surface | Fração (`0.0–1.0`) | `~50 km` (zona radicular) | Se `< 0`, assume `0.55` |
| `GWETTOP` | `GWETTOP` | NASA MERRA-2 Land Surface | Fração (`0.0–1.0`) | `~50 km` (camada `0–5 cm`) | Se `< 0`, assume `0.55` |
| `geometry.coordinates[2]` | `altitudeM` / `elevation_m` | Grade topográfica NASA POWER | `m` (metros) | Ponto consultado | Se ausente, assume `600` |

#### Base Local de Contingência (Fallback Offline NASA)
- **Arquivos:**
  - `rota-adaptada-novo/src/data/nasa-vilhena-2013-2024.json`
  - `rota-adaptada-novo/public/nasa-vilhena-2013-2024.json`
- **Comportamento:** Caso a requisição ao vivo falhe (sem internet, bloqueio de rede ou timeout > 14s), o sistema mantém automaticamente o dataset local pré-consolidado de Vilhena/RO (`4.383 dias` entre `2013-01-01` e `2024-12-31`).

---

### 1.2. APIs e Produtos da NASA Mapeados para Simulação / Integração Futura

No módulo do observatório climático (`rota-adaptada-novo/src/data/science.js`, `rota-adaptada-novo/src/data/evidence.js`, `rota-adaptada-novo/src/data/area-sampling.js` e `data/ro/config.json`), estão catalogadas as seguintes APIs e portais da NASA para evolução de camadas espaciais:

| Variável / Contexto | Produto / Missão NASA | API / Portal Referenciado | URL Documentada no Código | Unidade | Grade Demonstrativa | Status no Projeto |
|---|---|---|---|---|---|---|
| `rain` (Precipitação) | **GPM IMERG** | `NASA GES DISC / GPM IMERG` | `https://gpm.nasa.gov/data/imerg` | `mm/dia` | `0.1°` (~10 km) | Ativo via NASA POWER (`PRECTOTCORR`) / Simulado no mapa 2D |
| `temperature` (Temperatura do ar) | **NASA POWER / MERRA-2** | `NASA POWER Daily API` | `https://power.larc.nasa.gov/api/pages/` | `°C` | `0.5°` (~50 km) | Ativo via NASA POWER (`T2M_MAX`, `T2M_MIN`) / Simulado no mapa 2D |
| `wind` (Vento) | **NASA POWER / MERRA-2** | `NASA POWER Hourly API` | `https://power.larc.nasa.gov/api/pages/` | `m/s` | `0.5°` | Simulado no observatório (`science.js`) |
| `surface` (Temp. da superfície) | **MODIS LST** | `NASA Earthdata / MODIS LST` | `https://science.nasa.gov/earth/earth-observatory/global-maps/land-surface-temperature/` | `°C` | `0.05°` | Mapeado / Simulado (`science.js`) |
| `moisture` (Umidade do solo) | **SMAP L4** | `NASA Earthdata / SMAP L4` | `https://smap.jpl.nasa.gov/` | `m³/m³` | `0.1°` (~9 km) | Mapeado em `science.js` e `data/ro/config.json` (no motor principal usa-se `GWETROOT`/`GWETTOP` do MERRA-2) |
| `vegetation` (Índice de vegetação) | **HLS** (Harmonized Landsat Sentinel-2) | `NASA Earthdata / HLS` | `https://hls.gsfc.nasa.gov/data-products/` | `NDVI` | `0.01°` | Mapeado / Simulado (`science.js`) |
| `forecast` (Previsão meteorológica) | **GEOS-FP** | `NASA GMAO GEOS-FP` | — | — | — | Mapeado como contexto futuro (`science.js`) |
| `projection` (Projeção climática) | **NEX-GDDP-CMIP6** | `NASA NEX-GDDP-CMIP6` | — | — | — | Mapeado como contexto futuro (`science.js`) |
| Documentação Metodológica | **NASA POWER Docs** | Documentação de fontes meteorológicas | `https://power.larc.nasa.gov/docs/methodology/data/sources_meteorology/` | — | — | Referência técnica (`vilhena_rules-v2.json`) |

---

## 2. APIs e Serviços de Terceiros (Não-NASA)

### 2.1. Conexões Ativas (Consultas ao Vivo via HTTP / Web APIs)

#### A) ISRIC SoilGrids v2.0 REST API (Propriedades Físicas do Solo)
Utilizada ao cadastrar uma nova propriedade por coordenadas para estimar os teores de argila e areia (`0–60 cm`) e sugerir automaticamente a classe de retenção de água do solo (`AD3`, `AD4` ou `AD5`).

- **Provedor:** ISRIC — World Soil Information (*SoilGrids v2.0*, licença aberta `CC-BY 4.0`)
- **Arquivo de implementação:** `rota-adaptada-novo/src/vilhena-engine.js` (função `fetchSoilGridsAndSuggestClass(lat, lon, nasaSummary)`)
- **Método HTTP:** `GET`
- **Autenticação:** Pública (sem necessidade de API Key)
- **Timeout de requisição:** `9000 ms` (9 segundos via `AbortController`)
- **Endpoint Base:**
  ```text
  https://rest.isric.org/soilgrids/v2.0/properties/query
  ```
- **URL Completa de Requisição:**
  ```text
  https://rest.isric.org/soilgrids/v2.0/properties/query?lat={cleanLat}&lon={cleanLon}&property=clay&property=sand&depth=0-5cm&depth=5-15cm&depth=15-30cm&depth=30-60cm&value=mean
  ```
- **Parâmetros de Query (`GET`):**
  - `lat`: Latitude em graus decimais (`4` casas decimais)
  - `lon`: Longitude em graus decimais (`4` casas decimais)
  - `property`: `clay` (argila) e `sand` (areia)
  - `depth`: `0-5cm`, `5-15cm`, `15-30cm`, `30-60cm`
  - `value`: `mean` (valor médio estimado por camada)
- **Processamento e Resposta:**
  - Lê `data.properties.layers`, aplica fator de conversão `layer.unit_measure.d_factor` (padrão `10`, convertendo `g/kg` para `%`) e calcula a média ponderada pela espessura de cada camada (`5/60`, `10/60`, `15/60` e `30/60`).
  - **Fallback de Contingência:** Se a API estiver indisponível ou retornar pixel mascarado (`null`), estima a textura com base no recorte geográfico da Chapada dos Parecis (`lat` entre `-13.5` e `-11.5`, `lon` entre `-61.0` e `-59.0` → `46%` argila / `38%` areia) ou pela retenção hídrica média `GWETROOT` da NASA.

---

#### B) OpenStreetMap Nominatim API (Geocodificação Reversa de Município/UF)
Utilizada durante a consulta por coordenadas para preencher automaticamente o nome do município e a sigla do estado (UF).

- **Provedor:** OpenStreetMap — Nominatim Reverse Geocoding
- **Arquivo de implementação:** `rota-adaptada-novo/src/vilhena-engine.js` (linhas 210–222, dentro de `fetchSoilGridsAndSuggestClass`)
- **Método HTTP:** `GET`
- **Autenticação:** Pública (sem chave)
- **Endpoint Base:**
  ```text
  https://nominatim.openstreetmap.org/reverse
  ```
- **URL Completa de Requisição:**
  ```text
  https://nominatim.openstreetmap.org/reverse?format=json&lat={cleanLat}&lon={cleanLon}&zoom=10
  ```
- **Parâmetros de Query (`GET`):**
  - `format`: `json`
  - `lat`: Latitude em graus decimais
  - `lon`: Longitude em graus decimais
  - `zoom`: `10` (nível municipal)
- **Campos Extraídos da Resposta (`geo.address`):**
  - **Município (`detectedMunicipality`):** `address.city || address.town || address.municipality || address.village`
  - **Estado / UF (`detectedState`):** `address.ISO3166_2_lvl4.split('-')[1] || address.state`
  - **Fallback:** Falhas são ignoradas silenciosamente (`try/catch`), mantendo o preenchimento manual do usuário.

---

#### C) OpenFreeMap Tile / Style Server (Mapa Vetorial MapLibre GL)
Utilizada no modo de comparação espacial para renderização do mapa base vetorial.

- **Provedor:** OpenFreeMap (`tiles.openfreemap.org`)
- **Biblioteca Cliente:** `maplibre-gl` (`v6.17.0`)
- **Arquivo de implementação:** `rota-adaptada-novo/src/spatial-comparison.js` (linha 21)
- **URL do Estilo Vetorial:**
  ```text
  https://tiles.openfreemap.org/styles/positron
  ```
- **Método HTTP:** `GET` (gerenciado internamente pelo motor do MapLibre GL)
- **Autenticação:** Pública (sem chave)

---

#### D) Web Geolocation API (GPS do Navegador / W3C)
Utilizada no botão `"📍 Usar Minha Localização (GPS)"` no formulário de inclusão de nova propriedade.

- **Interface:** `navigator.geolocation.getCurrentPosition`
- **Arquivo de implementação:** `rota-adaptada-novo/src/main.js` (linhas 2121–2139)
- **Dados obtidos:** `pos.coords.latitude` e `pos.coords.longitude` (formatados com `.toFixed(4)`).

---

### 2.2. Cruzamento dos Dados da NASA e APIs de Terceiros na Sugestão de Planejamento (`generateSystemSuggestedPlannings`)

Dentro da tela de **Planejamento (`Incluir Novo Planejamento` ➔ `✨ Sugerir Planejamento (NASA + APIs)`)**, a função `generateSystemSuggestedPlannings` (`rota-adaptada-novo/src/vilhena-engine.js`) combina automaticamente os dados das APIs ativas com o catálogo de culturas e ciclos (pré-cadastrados e cadastrados pelo usuário):

| Fonte Integrada | Dados Utilizados pelo Motor de Sugestão | Impacto nas 3 Cartas de Baralho Sugeridas (`♠ CARTA 01`, `♦ CARTA 02`, `♣ CARTA 03`) |
|---|---|---|
| **NASA POWER API (`2013–2024`)** | `PRECTOTCORR` (`IMERG_PRECTOT`), `GWETROOT`, `GWETTOP`, `T2M_MAX`, `T2M_MIN` | Pontua cada combinação candidata pelo número de anos sem falha severa (`noCriticalYears`), anos favoráveis (`okYears`), chuva média no ciclo (`avgCycleRainMm`) e umidade radicular média na fase reprodutiva F3 (`avgF3GwetRootPct`). |
| **ISRIC SoilGrids v2.0 + Nominatim** | Classe de solo sugerida (`AD3_MEDIA` 48 mm, `AD4_ARGILOSA` 62 mm, `AD5_MUITO_ARGILOSA` 78 mm), `% argila` e Município/UF | Ajusta a janela recomendada de semeadura de cada etapa e a tolerância máxima a veranicos conforme a capacidade de retenção hídrica do solo da propriedade. |
| **Catálogo de Culturas e Ciclos** | Culturas (`SAFRA_PRINCIPAL`, `ALTERNATIVA_COMERCIAL`, `ROTACAO_CULTURAS`, `COBERTURA_SOLO`) e ciclos em dias (`F1` a `F4`) | Gera e ranqueia 3 perfis de plano em cartas de baralho: **Opção 1 (Segurança Comercial)**, **Opção 2 (Rotação Diversificada)** e **Opção 3 (Blindagem e Cobertura do Solo)**. |

---

## 3. Resumo Rápido de Endpoints (Conexões HTTP em Código)

| Categoria | Serviço | Endpoint / URL Base | Arquivo e Linha | Status |
|---|---|---|---|---|
| **NASA** | **NASA POWER API v2 (Daily AG)** | `https://power.larc.nasa.gov/api/temporal/daily/point` | `rota-adaptada-novo/src/vilhena-engine.js` (L24) | **Ativo (Ao vivo)** + Fallback JSON |
| **Terceiros** | **ISRIC SoilGrids v2.0 API** | `https://rest.isric.org/soilgrids/v2.0/properties/query` | `rota-adaptada-novo/src/vilhena-engine.js` (L127) | **Ativo (Ao vivo)** + Fallback pedoclimático |
| **Terceiros** | **OpenStreetMap Nominatim** | `https://nominatim.openstreetmap.org/reverse` | `rota-adaptada-novo/src/vilhena-engine.js` (L212) | **Ativo (Ao vivo)** |
| **Terceiros** | **OpenFreeMap (MapLibre Style)** | `https://tiles.openfreemap.org/styles/positron` | `rota-adaptada-novo/src/spatial-comparison.js` (L21) | **Ativo (Ao vivo no Observatório)** |

# Rota Adaptada · Fluxo de 5 Telas Baseado em NASA POWER + APIs de Solo/Localização

> **Desafio NASA Space Apps 2026:** *Field Shift: Adapting Farms with NASA Data*  
> **Pergunta Central:** *“Se a minha primeira cultura atrasar, qual é a menor mudança que posso fazer no restante do plano para continuar viável?”*

Aplicação web determinística, **100% client-side e compatível com hospedagem estática (GoDaddy Registry + SSL)**, focada exclusivamente nos dados da **NASA POWER API (`2013–2024`)** e de **APIs abertas de terceiros (`ISRIC SoilGrids v2.0` + `OpenStreetMap Nominatim` + `GPS`)**.

---

## Estrutura das 5 Telas (`src/main.js`)

1. **Passo 1 — Propriedade (`1. Propriedade`):**
   - **Propriedade Pré-Cadastrada:** `Fazenda Chapada dos Parecis` (Vilhena/RO, `Solo Argiloso — Classe AD4 · 62 mm`), consultando **ao vivo a API da NASA POWER (`2013–2024`)**.
   - **`+ Incluir Nova Propriedade (Lat/Lon)`:** Consulta automaticamente por coordenadas ou GPS:
     1. **NASA POWER API (`api/temporal/daily/point`):** Chuva diária (`PRECTOTCORR`), temperatura (`T2M_MAX`, `T2M_MIN`), umidade superficial e radicular (`GWETTOP`, `GWETROOT`) e altitude;
     2. **ISRIC SoilGrids v2.0 API:** Teores estimados de argila (%) e areia (%) na camada `0–60 cm`, sugerindo automaticamente a classe de retenção hídrica do solo (`AD3_MEDIA`, `AD4_ARGILOSA` ou `AD5_MUITO_ARGILOSA`);
     3. **OpenStreetMap Nominatim API:** Identificação automática de Município e UF.

2. **Passo 2 — Culturas (`2. Culturas`):**
   - Exibe apenas as informações utilizadas pelo motor de simulação (ciclos cadastrados em dias, janela recomendada e tolerância climática).
   - **`+ Cadastrar Nova Cultura`:** Permite cadastrar novas culturas sem restrição à 2ª safra (4 finalidades: `SAFRA_PRINCIPAL`, `ALTERNATIVA_COMERCIAL`, `ROTACAO_CULTURAS` e `COBERTURA_SOLO`), já registrando **Ciclo Médio** e **Ciclo Precoce** (em dias).
   - **`+ Cadastrar Novo Ciclo`:** Permite cadastrar novos ciclos (em dias) para qualquer cultura disponível, fatiando automaticamente as 4 fases fenológicas (`F1` a `F4`) para o teste na NASA POWER.

3. **Passo 3 — Planejamento (`3. Planejamento`):**
   - **Planejamentos Disponíveis:** Exibe o planejamento pré-cadastrado e os planejamentos criados pelo usuário, informando a propriedade vinculada e a cadeia ordenada de culturas, ciclos e sucessões.
   - **`+ Cadastrar Novo Ciclo`:** Permite adicionar novos ciclos diretamente da tela de planejamento ou dentro de cada etapa da sucessão (`+ Cadastrar Ciclo`).
   - **`+ Incluir Novo Planejamento`:**
     - Ao abrir o formulário (ou adicionar uma etapa), os seletores de **Cultura** e **Ciclo na Etapa** iniciam **em branco**.
     - Inclui internamente o botão **`✨ Sugerir Planejamento (NASA + APIs)`**, que exibe um **elemento de loading animado** enquanto analisa todos os cultivos e ciclos disponíveis contra os dados da **NASA POWER** e do **SoilGrids**, apresentando **3 sugestões em formato de cartas de baralho (`♠ CARTA 01`, `♦ CARTA 02`, `♣ CARTA 03`)** com opção de escolher/ativar a carta, carregá-la no formulário para edição ou clicar em **Cancelar / Sair**.
   - **Simulador de Atraso e Efeito Dominó:** Simula atrasos de `0` a `+45 dias` na 1ª safra e mostra o impacto imediato nas sucessões.

4. **Passo 4 — Comparação (`4. Comparação`):**
   - **Preferências do Produtor (Movidas para a tela de Comparação):** Controles para permitir ou restringir ajuste de ciclo, troca comercial na sucessão e transição para cobertura do solo.
   - **Comparação Lado a Lado:** Avalia o **Plano Atual (com atraso)** e as **Alternativas de Adaptação** nos **12 anos históricos reais da NASA (`2013–2024`)**, destacando anos sem falha severa, janela recomendada, dias de solo coberto e anos clicáveis.

5. **Passo 5 — Explicação e Resumo (`5. Explicação e Resumo`):**
   - Inspeção detalhada de qualquer ano histórico (`2013–2024`) nas **4 fases da planta** (`Chuva`, `Umidade do Solo GWETTOP/GWETROOT` e `Temperatura T2M_MAX/T2M_MIN`), resumo em 3 pontos e **Relatório Imprimível (PDF / A4)**.

---

## Como Executar e Publicar

```bash
npm install
npm run dev      # Servidor local de desenvolvimento
npm test         # Suíte de testes unitários (Vitest)
npm run build    # Gera o pacote estático em dist/
```

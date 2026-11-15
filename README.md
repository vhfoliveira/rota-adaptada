# Rota Adaptada — Equipe Interplários (NASA Space Apps 2026)

> **Desafio:** *Field Shift: Adapting Farms with NASA Data*  
> **Pergunta Central:** *“Se a minha primeira cultura atrasar, qual é a menor mudança que posso fazer no restante do plano para continuar viável?”*

Aplicação web de apoio à decisão agrícola para planejamento de safras e adaptação de sucessões, combinando **12 anos de dados diários reais da NASA POWER (`2013–2024`)** com **APIs abertas de solo e localização (`ISRIC SoilGrids v2.0` + `OpenStreetMap Nominatim` + `GPS`)** e um catálogo extensível de **culturas e ciclos**.


O motor agora aceita sequências, datas e intervalos por cenário. Vilhena permanece
como exemplo; clima, solo ou regras regionais ausentes aparecem como **não avaliados**.
Veja [o contrato e os limites do motor](rota-adaptada/docs/MOTOR_CENARIOS.md).

---

## Executar localmente e gerar build estático

```bash
cd rota-adaptada
npm install
npm run dev      # Inicia o servidor local do Vite
```

Para executar os testes unitários e gerar o pacote estático pronto para hospedagem:

```bash
npm test
npm run build
```

O pacote final fica em `rota-adaptada/dist/`, 100% compatível com hospedagem estática (**GoDaddy Registry + SSL**).

---

## Fluxo Enxuto de 5 Telas (`rota-adaptada/src/main.js`)

A aplicação mantém exclusivamente as informações utilizadas pelos dados da **NASA POWER** e das **APIs de terceiros**, organizada em 5 passos diretos:

1. **1. Propriedade:** Propriedade pré-cadastrada em Vilhena/RO (`Solo Argiloso — AD4 · 62 mm`) com consulta ao vivo à **NASA POWER API (`2013–2024`)**, além do botão **`+ Incluir Nova Propriedade (Lat/Lon)`** que consulta automaticamente **NASA POWER**, **ISRIC SoilGrids** (sugerindo a classe de retenção hídrica do solo a partir de `% argila` e `% areia`) e **Nominatim** (Município/UF).
2. **2. Culturas:** Catálogo de culturas e ciclos de duração (em dias). Permite **`+ Cadastrar Nova Cultura`** (com 4 finalidades no planejamento — `1ª Safra Principal`, `2ª Safra Comercial`, `Rotação de Culturas` ou `Cobertura do Solo` — e registro automático de Ciclo Médio e Ciclo Precoce) e **`+ Cadastrar Novo Ciclo`** para qualquer cultura.
3. **3. Planejamento:** Exibe o planejamento pré-cadastrado e os planejamentos do usuário (com a propriedade vinculada e a ordem exata das culturas e sucessões), permite **`+ Cadastrar Novo Ciclo`**, **`+ Incluir Novo Planejamento`** (com campos iniciais de cultura e ciclo em branco, reordenação de etapas e botão interno **`✨ Sugerir Planejamento (NASA + APIs)`** com tela de loading e **3 sugestões em cartas de baralho** `♠ CARTA 01`, `♦ CARTA 02`, `♣ CARTA 03`), além do **Simulador de Atraso e Efeito Dominó**.
4. **4. Comparação:** Reúne no topo as **Preferências do Produtor** (filtros de adaptação aceitos) e compara lado a lado o **Plano Atual (com atraso)** e as **Alternativas de Adaptação** frente aos **12 anos históricos da NASA (`2013–2024`)**, janela recomendada para o solo e dias de solo coberto.
5. **5. Explicação e Resumo:** Diagnóstico visual das **4 fases da planta (`F1` a `F4`)** ao clicar em qualquer ano histórico (`2013–2024`), detalhando Chuva (`PRECTOTCORR`), Umidade Superficial (`GWETTOP`), Umidade Radicular (`GWETROOT`) e Temperatura (`T2M_MAX`/`T2M_MIN`), acompanhado de **Relatório Imprimível (PDF / A4)**.

---

## Documentação no Repositório

- [Contexto do Projeto — Implementações, Remoções, Alterações e Decisões (`CONTEXTO_DO_PROJETO.md`)](CONTEXTO_DO_PROJETO.md)
- [Documentação do Plano e Proposta de Software (`rota_adaptada_proposta_de_software.md`)](rota_adaptada_proposta_de_software.md)
- [Instruções da Aplicação (`rota-adaptada/README.md`)](rota-adaptada/README.md)
- [Mapeamento de Conexões de API e Fontes de Dados (`DADOS_CONEXAO_APIS.md`)](DADOS_CONEXAO_APIS.md)
- [Escopo Técnico (`docs/ESCOPO_RONDONIA.md`)](docs/ESCOPO_RONDONIA.md)

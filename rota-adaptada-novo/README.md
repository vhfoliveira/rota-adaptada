# Rota Adaptada · Vilhena/RO (Fluxo Enxuto de 4 Telas)

> **Desafio NASA Space Apps 2026:** *Field Shift: Adapting Farms with NASA Data*  
> **Pergunta Central:** *“Se a minha primeira cultura atrasar, qual é a menor mudança que posso fazer no restante do plano para continuar viável?”*

Aplicação web determinística, **100% client-side e compatível com hospedagem estática (GoDaddy Registry + SSL)**, focada em uma **propriedade pré-cadastrada de grãos de sequeiro em Vilhena/RO** (`Fazenda Chapada dos Parecis`).

---

## Hierarquia Visual: Essencial vs. Opcional nas 4 Telas (`src/main.js`)

Cada tela destaca na superfície apenas o que é **essencial para a decisão do produtor**, mantendo os **campos opcionais e detalhes técnicos recolhidos** em gavetas expansíveis (`<details>`) sob demanda:

1. **Passo 1 — Propriedade (`1. Propriedade`):**
   - **Pré-cadastro padrão enxuto:** Traz pré-cadastrada **somente a propriedade padrão de Vilhena/RO** (`Fazenda Chapada dos Parecis · Sequeiro · 240 ha`) e **somente a sua respectiva classe de solo** (`Solo Argiloso — Classe AD4 · Reserva 55 mm`), consultando **ao vivo a API da NASA POWER (`2013–2024`)** sempre que utilizada.
   - **Inclusão de Nova Propriedade com Consulta Automática (`+ Incluir Nova Propriedade`):** Permite informar `Latitude` e `Longitude` (ou usar GPS) para consultar automaticamente:
     1. **NASA POWER API (`api/temporal/daily/point`):** Chuva diária, temperatura, umidade superficial/radicular (`GWETTOP`/`GWETROOT`) e altitude ao vivo;
     2. **ISRIC SoilGrids v2.0 API (licença aberta `CC-BY 4.0`):** Estimativa de argila (%), areia (%) e silte (%) na camada `0–60 cm`, exibindo automaticamente a **Sugestão de Classe de Solo Estimada (`AD3`, `AD4` ou `AD5`)**.
   - **Opcional (Recolhido):** Laudo químico detalhado do solo e regras legais da Idaron/MAPA.

2. **Passo 2 — Planejamento (`2. Planejamento`):**
   - **Essencial (Visível):** Simulador de atraso no plantio da Soja (`0` a `+80 dias`, padrão `+20 dias`), visualização imediata do **Efeito Dominó** empurrando a 2ª safra, e seleção simples do que o produtor deseja manter ou aceita ajustar.
   - **Opcional (Recolhido):** Ajuste da data original exata, intervalo operacional de máquinas (dias) e escolha manual do 2º ano.

3. **Passo 3 — Comparação (`3. Comparação`):**
   - **Essencial (Visível):** Comparação lado a lado entre o **Plano Atual** e **até 3 alternativas de menor mudança**, com a data resultante da 2ª safra, 3 indicadores diretos (Janela Oficial, Finalidade e Dias de Solo Protegido), placar nos **12 anos históricos reais da NASA (`2013–2024`)** com anos clicáveis e resumo prático em 1 linha.
   - **Opcional (Recolhido):** Cronograma completo das 4 safras do biênio (`2026–2028`), cultivares e observação sobre rotação.

4. **Passo 4 — Explicação e Resumo (`4. Explicação e Resumo`):**
   - **Essencial (Visível):** Clique em qualquer ano histórico (`2013–2024`) para ver o diagnóstico das **4 fases da planta** em linguagem simples (`Chuva na fase`, `Umidade do solo` e `Temperatura`), resumo executivo em 3 pontos e botão para o **Resumo Imprimível (PDF / A4)**.
   - **Opcional (Recolhido):** Troca da safra inspecionada, códigos das variáveis NASA (`IMERG_PRECTOT`, `GWETTOP`, `GWETROOT`, `T2M_MAX`, `T2M_MIN`) e links das Portarias Oficiais.

---

## Como Executar e Publicar na GoDaddy Registry

```bash
npm install
npm run dev      # Servidor local de desenvolvimento
npm test         # Suíte de testes unitários (Vitest)
npm run build    # Gera o pacote estático em dist/ (com base: './')
```

Para publicar na oferta global **GoDaddy Registry (Free Domain and Website Hosting + SSL)**, basta enviar o conteúdo gerado em `dist/` diretamente para a pasta `public_html/` do domínio.

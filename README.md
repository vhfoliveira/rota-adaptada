# Rota Adaptada — Equipe Interplários (NASA Space Apps 2026)

> **Desafio:** *Field Shift: Adapting Farms with NASA Data*  
> **Pergunta Central:** *“Se a minha primeira cultura atrasar, qual é a menor mudança que posso fazer no restante do plano para continuar viável?”*

Aplicação web de apoio à decisão agrícola para adaptação de planos de dois anos em uma **propriedade pré-cadastrada de grãos de sequeiro em Vilhena, Rondônia (`Fazenda Chapada dos Parecis`)**, combinando **12 anos de dados diários reais da NASA (`2013–2024`)** com as janelas oficiais de plantio da região.

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

O pacote final fica em `rota-adaptada/dist/`, 100% compatível com a oferta global **GoDaddy Registry (Free Domain and Website Hosting + SSL)** do NASA Space Apps.

---

## Fluxo Enxuto de 4 Telas (`rota-adaptada/src/main.js`)

A interface prioriza uma experiência limpa, visual e convidativa, exibindo apenas os **campos essenciais de decisão** na tela principal e mantendo os **detalhes técnicos opcionais** recolhidos sob demanda:

1. **1. Propriedade:** Propriedade pré-cadastrada em Vilhena/RO (`Sequeiro · 240 ha`), escolha simples da retenção de água do solo e visão rápida das 4 culturas da sucessão (`Soja`, `Milho 2ª Safra`, `Sorgo Granífero` e `Milheto`).
2. **2. Planejamento:** Simulador de atraso na semeadura da Soja (`0` a `+80 dias`), visualização imediata do **Efeito Dominó** na 2ª safra e seleção das decisões que o produtor deseja preservar.
3. **3. Comparação:** Comparação lado a lado entre o **Plano Atual** e **até 3 alternativas de menor mudança**, com placar nos **12 anos reais da NASA (`2013–2024`)**, proteção do solo e compromisso prático.
4. **4. Explicação e Resumo:** Diagnóstico visual das **4 fases da planta** ao clicar em qualquer ano histórico (`2013–2024`), síntese em 3 pontos e **Resumo Imprimível (PDF / A4 100% offline)** para conversa com o agrônomo.

---

## Documentação no Repositório

- [Proposta de Software (`rota_adaptada_proposta_de_software.md`)](rota_adaptada_proposta_de_software.md)
- [Instruções da Aplicação e Deploy GoDaddy (`rota-adaptada/README.md`)](rota-adaptada/README.md)
- [Roteiro de Validação com Engenheiro Agrônomo (`docs/ROTEIRO_AGRONOMO.md`)](docs/ROTEIRO_AGRONOMO.md)

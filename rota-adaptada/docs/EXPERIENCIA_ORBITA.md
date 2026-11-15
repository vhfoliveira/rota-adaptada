# Experiência Órbita

Versão experimental na branch `codex/experiencia-orbita`, baseada no planejamento
autoguiado. O checkpoint anterior permanece em `codex/planejamento-autoguiado`.

A referência de UX é o ambiente operacional do `udisoft-erp`: navegação
persistente, contexto da área de trabalho, acesso aos registros e ações
consistentes. A apresentação tem identidade própria, com superfícies claras,
verde profundo, coral e uma ilustração vetorial dos cultivos.

## Experiência

- **Visão geral:** criação, simulação, descoberta, retomadas e planos salvos.
  Indicadores contam apenas dados reais; exemplos são identificados separadamente.
- **Meus planejamentos:** busca por nome, propriedade ou município, filtros de
  planos reais e exemplos, abertura dos detalhes e simulação a partir de um plano.
- **Jornadas:** etapas visíveis, contexto da área e dos cultivos, revisão,
  calendário e comparação. As validações e regras do motor são mantidas.
- **Painel avançado:** contexto da propriedade, módulos em abas, formulários,
  cadastros, simulação e relatório com o mesmo sistema visual.
- **Navegação:** menu móvel com foco controlado, busca de ações com Ctrl/Cmd + K,
  fechamento com Escape e abas avançadas com setas, Home e End.

## Organização

`orbit-shell.js` / `orbit.css` compõem a navegação e os tokens compartilhados.
`orbit-dashboard.js` / `orbit-dashboard.css` apresentam a visão geral e a biblioteca.
`guided-orbit.css` e `advanced-orbit.css` adaptam os fluxos existentes.

O armazenamento continua no mesmo IndexedDB. Nenhuma migração ou limpeza é
necessária. Não há alteração nos contratos de NASA, ZARC, SoilGrids ou no motor
agronômico. Planos originais e alternativas continuam separados.

## Verificação

Execute `npm test` e `npm run build` na pasta da aplicação. A verificação no
navegador cobre criação do exemplo, salvamento, simulação de 12 dias, escolha e
salvamento de alternativa, abertura dos detalhes, filtros, busca de ações e
validação de localização. Confira a apresentação em 1440px e 360px.

A avaliação visual usa dados de demonstração; ela não valida precisão
agronômica nem disponibilidade permanente dos serviços externos.

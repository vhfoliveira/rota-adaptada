# Rota Adaptada — Equipe Interplários

Aplicação de apoio ao planejamento agrícola para o desafio **Field Shift: Adapting
Farms with NASA Data**, do NASA Space Apps 2026. Ajuda a criar um planejamento
agrícola, consultar condições oficiais e comparar mudanças diante de atrasos.

Combina dados históricos NASA POWER, indicações municipais ZARC/MAPA, estimativas
de solo do ISRIC SoilGrids e localização por GPS, mapa ou município. A interface
informa o período e as condições efetivamente avaliados. Vilhena/RO é uma
demonstração explícita; dados ausentes aparecem como **não avaliados**.

## Maturidade e continuidade

O escopo atual é apoio ao planejamento agrícola. Fertilidade medida do solo,
qualidade dos lotes de sementes, sanidade e variabilidade dentro dos talhões
ainda não são avaliadas de forma integrada. A evolução para decisões de
agricultura de precisão depende de dados da propriedade e validação em campo.
Veja as [lacunas, etapas de evolução e argumento para parcerias](docs/ESCOPO_RONDONIA.md#maturidade-agronômica-e-continuidade-do-projeto)
e o [roteiro de validação com agrônomos](docs/ROTEIRO_AGRONOMO.md).

## Executar e validar

```bash
cd rota-adaptada
npm ci
npm run dev
```

```bash
npm test
npm run build
```

O projeto usa Node.js 22. O build estático fica em `rota-adaptada/dist/`.
O ambiente Docker inclui um serviço separado de atualização diária da base ZARC.
Rascunhos e planejamentos ficam no navegador, em IndexedDB.

## Fluxos ativos

A entrada é `rota-adaptada/src/bootstrap.js`. Celular e computador usam as mesmas jornadas:

| Entrada | Experiência |
| --- | --- |
| `/` | Visão geral Órbita com indicadores locais, criação, retomada de rascunhos e acesso aos planos salvos. |
| `?visao=planos` | Biblioteca com busca por nome/município, filtros de planos reais e exemplos e acesso à simulação. |
| `?acao=planejar` / `?acao=adaptar` | Acesso direto à criação ou à adaptação de um planejamento. |
| `?demo=planejamento` | Exemplo explícito de criação em Vilhena, com ciclos documentados e histórico NASA 2013–2024. |
| `?modo=campo` | Acesso direto à consulta guiada de plantio. |
| `?modo=planejamento` | Painel avançado com propriedade, culturas/ciclos, planejamento original, simulação e comparação, e explicação. |
| `?modo=planejamento&plano=<id>` | Abre os detalhes de um plano salvo neste navegador, respeitando suas próprias datas e permissões. |

A criação tem quatro etapas: localização, cultivos e datas, revisão e calendário.
O original é salvo sem atraso; a ação **Simular atraso** abre uma adaptação
separada. Editar um original salvo pelo guia cria uma cópia. Na adaptação, o
usuário escolhe um plano salvo, informa atraso e mudanças aceitas, revisa e
compara alternativas. A consulta de culturas continua acessível por **Ainda não
sei o que plantar**.

Na visão geral e em **Meus planejamentos**, o botão **Excluir** permite remover
um plano salvo após confirmação. A exclusão remove também seus preenchimentos
vinculados, mantém a propriedade e os outros planos e só é confirmada após a
gravação no dispositivo. O painel avançado usa a mesma operação.

Rascunhos reais e exemplos ficam separados. O aplicativo confirma o salvamento
somente após gravar no navegador; falhas permanecem visíveis. O calendário pode
ser salvo enquanto a consulta climática ainda está em andamento.

O painel avançado continua ativo para cadastros, configurações detalhadas e
relatório imprimível. Histórico climático não é previsão de produtividade;
presença no catálogo ZARC não confirma todas as condições da propriedade.

## Idioma e tradução (PT-BR principal / EN em camada)

O projeto tem **PT-BR como idioma principal e fonte de verdade**. A detecção inicial lê o idioma do navegador (`navigator.languages`), usando inglês apenas quando o navegador estiver em `en*` e mantendo `pt-BR` como padrão nos demais casos; o botão **PT / EN** no cabeçalho alterna o idioma e salva a escolha no navegador (`localStorage`).

- **Desenvolvimento de telas e fluxos:** sempre feito em **PT-BR** nos módulos JS e no HTML, envolvendo textos visíveis ao usuário com `t('Texto em PT-BR')` (ou `t('Texto {var}', { var })`) no JS e `data-i18n` no HTML. Se não houver tradução em inglês, `t()` faz **fallback automático para o PT-BR** sem quebrar nenhum fluxo.
- **Tradução para inglês:** mantida exclusivamente no dicionário [rota-adaptada/src/i18n/en.json](rota-adaptada/src/i18n/en.json), sem alterar fluxos, lógica, CSS ou IDs. Para listar textos pendentes de tradução, execute `npm run i18n:check` em `rota-adaptada/`.
- **Regra obrigatória para I.A.:** ao implementar novas funcionalidades, telas, correções ou refatorações, **a I.A. NÃO deve desenvolver, alterar nem preencher o arquivo `src/i18n/en.json`** (salvo se o usuário pedir explicitamente uma tarefa exclusiva de tradução). A I.A. deve desenvolver 100% em PT-BR usando `t(...)` / `data-i18n`, deixando o `en.json` intocado para o fluxo de tradução.

## Documentação atual

- [Execução, fontes, armazenamento e PWA](rota-adaptada/README.md)
- [Interface Órbita](rota-adaptada/docs/EXPERIENCIA_ORBITA.md)
- [Experiência autoguiada e roteiro de validação](rota-adaptada/docs/GUIA_AUTOGUIADO.md)
- [Contrato e limites do motor de cenários](rota-adaptada/docs/MOTOR_CENARIOS.md)
- [Base municipal ZARC e atualização](rota-adaptada/docs/ZARC.md)
- [Conexões de APIs e fontes de dados](DADOS_CONEXAO_APIS.md)
- [Implantação no ServerOS](deploy/README.md)

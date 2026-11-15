# Rota Adaptada — Equipe Interplários

Aplicação de apoio ao planejamento agrícola para o desafio **Field Shift: Adapting
Farms with NASA Data**, do NASA Space Apps 2026. Ajuda a criar um planejamento
agrícola, consultar condições oficiais e comparar mudanças diante de atrasos.

Combina dados históricos NASA POWER, indicações municipais ZARC/MAPA, estimativas
de solo do ISRIC SoilGrids e localização por GPS, mapa ou município. A interface
informa o período e as condições efetivamente avaliados. Vilhena/RO é uma
demonstração explícita; dados ausentes aparecem como **não avaliados**.

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
| `/` | **Criar meu planejamento** como entrada principal; **Ajustar um planejamento existente** e descoberta de culturas como alternativas, com retomada dos rascunhos. |
| `?demo=planejamento` | Exemplo explícito de criação em Vilhena, com ciclos documentados e histórico NASA 2013–2024. |
| `?modo=campo` | Acesso direto à consulta guiada de plantio. |
| `?modo=planejamento` | Painel avançado com propriedade, culturas/ciclos, planejamento, comparação e explicação. |
| `?modo=planejamento&plano=<id>` | Abre os detalhes de um plano salvo neste navegador, respeitando suas próprias datas e permissões. |

A criação tem quatro etapas: localização, cultivos e datas, revisão e calendário.
O original é salvo sem atraso; a ação **Simular atraso** abre uma adaptação
separada. Editar um original salvo pelo guia cria uma cópia. Na adaptação, o
usuário escolhe um plano salvo, informa atraso e mudanças aceitas, revisa e
compara alternativas. A consulta de culturas continua acessível por **Ainda não
sei o que plantar**.

Rascunhos reais e exemplos ficam separados. O aplicativo confirma o salvamento
somente após gravar no navegador; falhas permanecem visíveis. O calendário pode
ser salvo enquanto a consulta climática ainda está em andamento.

O painel avançado continua ativo para cadastros, configurações detalhadas e
relatório imprimível. Histórico climático não é previsão de produtividade;
presença no catálogo ZARC não confirma todas as condições da propriedade.

## Documentação atual

- [Execução, fontes, armazenamento e PWA](rota-adaptada/README.md)
- [Experiência autoguiada e roteiro de validação](rota-adaptada/docs/GUIA_AUTOGUIADO.md)
- [Contrato e limites do motor de cenários](rota-adaptada/docs/MOTOR_CENARIOS.md)
- [Base municipal ZARC e atualização](rota-adaptada/docs/ZARC.md)
- [Conexões de APIs e fontes de dados](DADOS_CONEXAO_APIS.md)
- [Implantação no ServerOS](deploy/README.md)

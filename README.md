# Rota Adaptada — Equipe Interplários

Aplicação de apoio ao planejamento agrícola para o desafio **Field Shift: Adapting
Farms with NASA Data**, do NASA Space Apps 2026. Ajuda a consultar opções oficiais
de plantio e comparar pequenas mudanças em uma sequência de cultivos diante de atrasos.

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
| `/` | Escolha entre **Descobrir o que plantar** e **Adaptar meu planejamento**, com retomada dos rascunhos. |
| `?modo=campo` | Acesso direto à consulta guiada de plantio. |
| `?modo=planejamento` | Painel avançado com propriedade, culturas/ciclos, planejamento, comparação e explicação. |

A consulta guiada reúne localização, data, condições de solo/irrigação, opções
municipais e resumo para download. A adaptação permite montar ou recuperar uma
sequência, informar atraso e alterações aceitas, comparar alternativas e salvar
um novo plano acessível no painel avançado. O original é preservado.

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

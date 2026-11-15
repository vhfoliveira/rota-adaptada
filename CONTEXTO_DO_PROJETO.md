# Contexto atual — Rota Adaptada

Rota Adaptada é uma aplicação de apoio ao planejamento agrícola da equipe
Interplários. O produtor pode explorar opções de plantio para município e época
ou comparar mudanças na sequência de cultivos diante de um atraso. Resultados
históricos e condições publicadas são apresentados com seus limites; não são
previsão de produtividade, rentabilidade ou certificação de enquadramento.

## Entradas e jornadas

[bootstrap.js](rota-adaptada/src/bootstrap.js) é a entrada única do site:

- `/` abre a escolha entre **Descobrir o que plantar** e **Adaptar meu planejamento**.
- `?modo=campo` abre a descoberta guiada, com retomada do rascunho disponível.
- `?modo=planejamento` abre o painel avançado de propriedade, culturas,
  planejamento, comparação e explicação.

Celular e computador usam as mesmas jornadas guiadas. Vilhena é uma demonstração
escolhida explicitamente; não é uma propriedade automaticamente atribuída ao
produtor. O painel avançado continua ativo para cadastros, ajustes por etapa e
análise detalhada. A navegação entre as interfaces preserva seus dados locais.

## Fluxos ativos

**Descoberta:** escolher município e, opcionalmente, confirmar um ponto por GPS,
mapa ou coordenadas; informar a data; revisar respostas; consultar culturas e
condições municipais ZARC; explorar os resultados e baixar o resumo. Clima e solo
complementam a consulta quando há um ponto confirmado, sem impedir a consulta
municipal se estiverem indisponíveis.

**Adaptação:** selecionar ou informar área e planejamento; montar a sequência de
culturas/ciclos; informar atraso e mudanças permitidas; comparar o calendário e
as alternativas avaliáveis; salvar uma alternativa ou baixar o resumo. Planos
salvos podem ser retomados pelo painel avançado.

**Painel avançado:** cadastrar propriedades, culturas e ciclos; montar e reordenar
etapas; definir datas mínimas, intervalos e permissões; comparar o plano atual com
até três alternativas; inspecionar anos e fases efetivamente avaliados e abrir o
relatório imprimível.

## Arquitetura em uso

| Área | Arquivos principais em `rota-adaptada/` |
|---|---|
| Entrada e interfaces | `src/bootstrap.js`, `src/guided.js`, `src/main.js` |
| Localização | `src/guided-location.js`, `src/guided-location-data.js`, `src/location.js` |
| Jornada e consultas | `src/guided-planning.js`, `src/guided-discovery.js`, `src/guided-crops.js` |
| Motor e relatório | `src/vilhena-engine.js`, `src/scenario.js`, `src/vilhena-report.js` |
| ZARC municipal | `src/zarc-risk.js`, `src/zarc-panel.js`, `public/zarc/` |
| Persistência | `src/db.js`, `src/guided-storage.js` |
| Ajuda e instalação | `src/context-help.js`, `src/pwa-client.js`, `pwa-build.js` |

Vite produz uma aplicação estática. O navegador consulta NASA POWER, SoilGrids,
Nominatim e os serviços de mapa; a base ZARC é servida pelo próprio site. O Compose
inclui um atualizador de dados ZARC separado da aplicação. Não há banco de
cadastros de usuários no servidor.

## Regras de dados e cálculo

- O calendário aceita sequência variável, datas, atrasos e intervalos válidos.
  Alternativas mudam uma etapa por vez e respeitam as permissões informadas.
- Histórico climático só é utilizado para a mesma coordenada. O período é
  derivado dos dados retornados, sem fixar todas as consultas em 2013–2024.
- Falhas e lacunas não recebem valores climáticos ou texturas de solo inventados.
  Sem dados suficientes, o resultado permanece não avaliado ou parcial.
- A estimativa de solo do SoilGrids não confirma a classe exigida pelo ZARC.
- A base municipal ZARC, sua safra e suas condições ficam separadas das regras de
  referência de Vilhena usadas pelo motor. Regras locais ausentes não herdam as
  regras do exemplo.
- Culturas personalizadas preservam durações e janelas informadas. Sem parâmetros
  climáticos não recebem classificação de estresse inventada ou percentual ZARC.
- Cobertura significa dias com cultura viva dentro do horizonte comparado; não
  presume persistência de palhada. Histórico não demonstra superioridade futura.

## Persistência e manutenção

IndexedDB mantém rascunhos e o estado compartilhado entre as duas interfaces. O
nome histórico do banco foi preservado para manter acesso aos dados existentes;
isso não torna o laboratório antigo parte do aplicativo atual. O service worker
permite abrir a interface já instalada offline, enquanto novas consultas exigem
conexão. O dispositivo e o navegador continuam responsáveis pela conservação dos
dados locais.

A limpeza do repositório remove os módulos sem entrada ativa do antigo
observatório simulado, gestão territorial, análises espaciais, diário de operações,
calendário do laboratório e interface mobile substituída. Também elimina seus
testes exclusivos, dependências sem consumidor e cópias desatualizadas dos dados.
Backups e materiais de tutorial não são apagados por essa limpeza de código.

## Referências para manutenção

- [Execução e fluxos atuais](rota-adaptada/README.md)
- [Guia autoguiado](rota-adaptada/docs/GUIA_AUTOGUIADO.md)
- [Contrato e limites do motor](rota-adaptada/docs/MOTOR_CENARIOS.md)
- [Conexões e tratamento das fontes](DADOS_CONEXAO_APIS.md)
- [Dados e operação ZARC](rota-adaptada/docs/ZARC.md)
- [Escopo regional](docs/ESCOPO_RONDONIA.md)
- [Implantação](deploy/README.md)

A validação de código usa `npm test` e `npm run build` dentro de `rota-adaptada/`.
Os fluxos interativos também devem ser exercitados em navegador, incluindo
retomada, indisponibilidade das fontes e largura móvel.

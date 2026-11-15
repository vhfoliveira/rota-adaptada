# Contexto atual — Rota Adaptada

Rota Adaptada é uma aplicação de apoio ao planejamento agrícola da equipe
Interplários. O produtor pode criar e salvar seu planejamento, explorar opções
de plantio para município e época ou comparar mudanças diante de um atraso. Resultados
históricos e condições publicadas são apresentados com seus limites; não são
previsão de produtividade, rentabilidade ou certificação de enquadramento.

## Entradas e jornadas

[bootstrap.js](rota-adaptada/src/bootstrap.js) é a entrada única do site:

- `/` destaca **Criar meu planejamento**, com **Ajustar um planejamento existente**
  como segunda entrada e **Ainda não sei o que plantar** para descobrir culturas.
- `?demo=planejamento` oferece o exemplo explícito de criação em Vilhena.
- `?modo=campo` abre a descoberta guiada, com retomada do rascunho disponível.
- `?modo=planejamento` abre o painel avançado de propriedade, culturas,
  planejamento, comparação e explicação.
- `?modo=planejamento&plano=<id>` abre um plano salvo com sua propriedade,
  datas e permissões, sem herdar as escolhas do plano anteriormente ativo.

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

**Criação:** quatro etapas — localização, cultivos e datas, revisão e calendário.
A sequência original é salva com atraso zero; nome é opcional e solo desconhecido
continua pendente. O calendário pode ser salvo enquanto a NASA carrega. Depois
de salvar, o usuário pode simular atraso, abrir detalhes ou baixar o resumo.
Editar um original salvo pelo guia cria uma cópia com outro identificador.

**Adaptação:** quatro etapas de progresso — escolher um plano salvo, informar
atraso e mudanças permitidas, revisar, comparar e salvar uma alternativa. A
revisão oferece edição opcional dos cultivos e datas. O original permanece
guardado; sem plano salvo, a interface encaminha para criar um.

**Painel avançado:** cadastrar propriedades, culturas e ciclos; montar e reordenar
etapas; definir datas mínimas, intervalos e permissões; comparar o plano atual com
até três alternativas; inspecionar anos e fases efetivamente avaliados e abrir o
relatório imprimível.

## Arquitetura em uso

| Área | Arquivos principais em `rota-adaptada/` |
|---|---|
| Entrada e interfaces | `src/bootstrap.js`, `src/guided.js`, `src/main.js` |
| Localização | `src/guided-location.js`, `src/guided-location-data.js`, `src/location.js` |
| Jornada e consultas | `src/guided-planning.js`, `src/guided-discovery.js`, `src/guided-crops.js`, `src/guided-demo.js` |
| Motor e relatório | `src/vilhena-engine.js`, `src/scenario.js`, `src/vilhena-report.js` |
| ZARC municipal | `src/zarc-risk.js`, `src/zarc-panel.js`, `public/zarc/` |
| Persistência e abertura | `src/db.js`, `src/guided-storage.js`, `src/planning-activation.js` |
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
- A demonstração usa explicitamente a série embarcada de Vilhena 2013–2024;
  seu cache fica separado das consultas reais. O solo não é preenchido por inferência.
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

Os três objetivos usam `guided-drafts-v1`; exemplos usam `guided-demo-drafts-v1`.
`readDrafts` migra exemplos antigos numa transação, seleciona a versão mais recente
quando coexistem e preserva a outra em `guided-demo-drafts-legacy-backup-v1`, no
mesmo object store. O estado de planos mantém compatibilidade com a versão 8.
Salvar um original tem identificador estável e não duplica registros; adaptações
geram novos planos. A confirmação de salvamento depende da gravação efetiva.

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
Os testes com pessoas leigas continuam pendentes; conferência técnica não
comprova autonomia de uso nem adequação agronômica.

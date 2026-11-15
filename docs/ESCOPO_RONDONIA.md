# Escopo regional — Rota Adaptada

Vilhena/RO é o exemplo explícito do aplicativo. A propriedade demonstrativa, o
histórico NASA local de 2013–2024 e as regras regionais de referência estão em
`rota-adaptada/src/data/`. Esses dados não são uma configuração universal para
outras propriedades, municípios ou safras.

A interface atual permite escolher municípios presentes no manifesto ZARC e
consultar suas culturas e condições para a safra e data cobertas. Um ponto
confirmado permite consultar NASA POWER e SoilGrids para aquela coordenada.
Escolher somente o município permite a descoberta municipal, sem análise de clima
ou solo pontual. O mapa indica um ponto, não os limites da propriedade.

## O que o aplicativo avalia

- Condições publicadas na base municipal ZARC, com solo, manejo, grupos e portaria
  preservados. Ausência de solo confirmado produz opções condicionais.
- Calendário de uma ou mais etapas com culturas, ciclos, intervalos e atraso.
- Até três alternativas, cada uma alterando uma etapa, respeitando as permissões do
  produtor e as condições de dados do motor.
- Histórico climático efetivamente disponível para o ponto, com ciclos incompletos
  identificados e sem reutilizar o clima de Vilhena em outra coordenada.
- Dias de cultura viva no horizonte comparado e relatório do cenário avaliado.

## Limites de cobertura

Ampliar o calendário ou cadastrar uma cultura não valida novos parâmetros
agronômicos. Sem solo, clima, parâmetros da cultura ou regras regionais suficientes,
o aplicativo mantém o calendário e identifica a parcela não avaliada. Janelas
informadas pelo usuário não recebem percentuais oficiais automaticamente.

A estimativa de textura do SoilGrids não confirma uma classe oficial de solo ZARC.
A tábua municipal atualizável e o pacote de referência do motor são fontes
separadas. A indicação publicada não substitui a verificação completa da portaria,
nem comprova enquadramento em seguro ou crédito. O histórico não prevê
produtividade ou rentabilidade.

O escopo atual não inclui observatório climático simulado, cadastro de polígonos
de talhões, laudos laboratoriais, diário de operações ou otimização financeira.

Consulte [o contrato do motor](../rota-adaptada/docs/MOTOR_CENARIOS.md),
[a base municipal ZARC](../rota-adaptada/docs/ZARC.md),
[as fontes utilizadas](../DADOS_CONEXAO_APIS.md) e
[o guia de interação](../rota-adaptada/docs/GUIA_AUTOGUIADO.md).

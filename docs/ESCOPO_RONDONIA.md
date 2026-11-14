# Rota Adaptada - escopo Rondônia

## Tese do produto

A Rota Adaptada responde a uma decisão específica:

> Quando a primeira cultura atrasa, qual é a menor mudança justificável no restante do planejamento, considerando o município, o solo, o calendário, o histórico climático e as prioridades do produtor?

O produto atende Rondônia, mas não trata o estado como uma única zona agronômica. Cada análise é vinculada a um município, uma localização aproximada, um perfil de solo, uma safra e regras com fonte identificada.

## Pilotos

### Vilhena

- Primeiro piloto operacional.
- As propriedades serão cadastradas pelo usuário e vinculadas a talhões.
- Evidências do solo serão registradas com origem, data, profundidade, resultados, documento e situação de validação.
- A ausência de evidência obrigatória mantém a análise como pendente.

### Ariquemes

- Perfil futuro de validação com o engenheiro agrônomo disponível.
- Será incorporado depois que o fluxo de Vilhena estiver validado.

## Fontes de decisão

| Camada | Origem | Uso |
| --- | --- | --- |
| Chuva | NASA POWER / GPM IMERG | Reaplicar os calendários a sequências históricas de precipitação. |
| Temperatura | NASA POWER / MERRA-2 | Identificar exposição histórica fora das faixas cadastradas. |
| Umidade do solo | NASA POWER / SMAP, se a qualidade for suficiente | Contexto hídrico regional, sem precisão de talhão. |
| Solo | Produtor, agrônomo e fonte pública apropriada | Selecionar o perfil usado pelas regras e pelo ZARC. |
| Calendário e risco | ZARC / MAPA | Validar município, safra, cultura, grupo e classe de solo. |
| Sanidade vegetal | Idaron / MAPA | Bloquear datas incompatíveis com vazio sanitário e calendário de semeadura. |
| Culturas e manejo | Agrônomo e Embrapa | Cadastrar ciclos, intervalos, compatibilidades e compromissos. |

## Regra de segurança

O motor trabalha em três estados:

1. **Válido:** todas as regras obrigatórias possuem fonte e o cenário passa nas restrições.
2. **Pendente:** falta uma informação necessária; o cenário pode ser explorado, mas não recomendado.
3. **Inválido:** uma regra oficial ou agronômica impede o cenário.

O sistema nunca converte ausência de informação em aprovação.

## Entradas mínimas

- Município e coordenada aproximada.
- Safra analisada.
- Classe de solo usada no enquadramento.
- Irrigação disponível ou sistema de sequeiro.
- Sequência planejada, datas e ciclos.
- Atraso ou outro evento a simular.
- Decisões que o produtor deseja preservar.
- Alternativas aceitas pelo produtor e pelo técnico.

## Saídas do motor

Cada rota apresenta separadamente:

- etapas e datas alteradas;
- regras que passaram, falharam ou estão pendentes;
- chuva acumulada nas fases cadastradas;
- número de períodos históricos com alertas;
- dias planejados de cobertura do solo;
- diversidade de espécies e famílias ao longo de dois anos;
- mudança de finalidade comercial para cobertura;
- fonte, data e resolução de cada conjunto de dados;
- limitações e incerteza da análise.

Os indicadores não serão apresentados como previsão de produtividade, probabilidade de perda ou recomendação agronômica automática.

## Demonstração principal

1. Selecionar Ariquemes e o perfil demonstrativo da propriedade.
2. Informar soja seguida de milho.
3. Aplicar um atraso hipotético à soja.
4. Bloquear uma alternativa incompatível com as regras cadastradas.
5. Comparar manter o milho, usar outra cultura comercial ou introduzir cobertura.
6. Explicar por que uma alternativa exige menos mudanças e quais compromissos ela cria.
7. Trocar o município para Vilhena e mostrar que o resultado é recalculado.

## Critério de sucesso do MVP

O MVP está pronto quando o agrônomo consegue verificar três casos e responder:

- o calendário calculado está coerente;
- as alternativas apresentadas fazem sentido para o município;
- as informações faltantes estão visíveis;
- o aplicativo não aprova uma opção sem respaldo;
- a explicação ajuda a conversar com o produtor.

## O que diferencia a solução

A Rota Adaptada não tenta encontrar uma cultura universalmente melhor. Ela procura a menor alteração que continue defensável depois de um imprevisto, mostra alternativas maiores quando necessário e mantém evidência, restrição e preferência do produtor separadas.

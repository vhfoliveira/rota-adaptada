// Explicações locais da interface. Não consultam APIs nem completam dados ausentes.
const help={
 'Propriedade':'Área principal cadastrada pelo produtor. Pode conter vários talhões. O contorno não é um registro fundiário nem uma certificação cadastral.',
 'Talhão':'Unidade usada para organizar análises, histórico, planejamento e acompanhamento. Cada talhão deve permanecer dentro da propriedade e não se sobrepor a outro.',
 'Data inicial':'Primeiro dia da sequência planejada. É uma restrição de calendário escolhida por você; não representa uma janela de plantio validada para o clima local.',
 'Horizonte (meses)':'Período total disponível para a rotação, inicialmente 24 meses. Inclui vários cultivos e intervalos. Não é a duração de uma safra nem o alcance de uma previsão meteorológica.',
 'Critério de qualidade do grão':'Defina o que significa qualidade para esta comparação, por exemplo percentual de grãos avariados. O protótipo registra o critério, mas não estima nem mede a qualidade da colheita.',
 'Meta opcional (sacas/ha)':'Objetivo informado pelo produtor em sacas por hectare. Não é uma estimativa do aplicativo. Informe também o peso da saca, pois ele varia entre produtos e convenções.',
 'Peso da saca (kg)':'Massa de uma saca em quilogramas. A conversão é sacas/ha × kg por saca = kg/ha. O valor deve corresponder à sua referência comercial ou ao seu registro.',
 'Cultura da meta':'Cultura à qual se aplica a meta de rendimento. A demonstração registra essa referência sem verificar se ela será atingida.',
 'Como montar a rotação?':'Sugerir alternativas compara sequências demonstrativas compatíveis com as restrições. Escolher minha sequência usa a ordem preenchida por você. Os resultados precisam de revisão agronômica local.',
 'Rendimento':'Prioridade dada ao rendimento na comparação. Peso de 0 a 5 multiplica um índice didático fixo por cultura; não prevê produção em kg/ha ou sacas/ha.',
 'Qualidade do grão':'Prioridade de qualidade, de 0 a 5. O critério deve ser explicitado. A pontuação demonstrativa não prevê a qualidade real dos grãos.',
 'Saúde do solo':'Prioridade para condições do solo, de 0 a 5. O índice didático representa papéis ilustrativos das culturas; não substitui análise de solo nem mede saúde do solo.',
 'Conservação de umidade':'Prioridade para conservação de água, de 0 a 5. O índice não calcula o balanço hídrico do talhão e não garante disponibilidade de água.',
 'Nutrientes':'Prioridade ligada à ciclagem de nutrientes, de 0 a 5. Não estima estoque de nutrientes, dose de fertilizante ou necessidade de adubação.',
 'Data da coleta':'Data em que a amostra de solo foi coletada, conforme seu registro ou laudo. Não confundir com a emissão do laudo. Deixe em branco se desconhecida.',
 'Profundidade (cm)':'Intervalo vertical amostrado, em centímetros, por exemplo 0–20 cm. Resultados de profundidades diferentes não devem ser tratados automaticamente como equivalentes.',
 'Ponto ou local amostrado':'Identificação do local de coleta, podendo incluir coordenadas. Uma amostra pontual não descreve automaticamente o talhão inteiro ou a propriedade.',
 'pH':'Indicador de acidez ou alcalinidade, sem unidade. Transcreva o valor e o método do laudo. Não converta métodos nem deduza necessidade de correção a partir deste campo.',
 'Método de pH':'Procedimento utilizado pelo laboratório, como água, CaCl₂ ou KCl. Métodos diferentes podem produzir resultados distintos. Use o indicado no laudo.',
 'Matéria orgânica':'Resultado de matéria orgânica informado pelo laboratório. Deve ser acompanhado da unidade; g/dm³, g/kg e porcentagem não são intercambiáveis sem contexto.',
 'Unidade da matéria orgânica':'Unidade exatamente como aparece no laudo. O aplicativo não converte nem interpreta automaticamente os valores.',
 'Textura conforme laudo':'Descrição da textura ou proporções de areia, silte e argila conforme o laudo. Inclua unidades quando registrar frações. Não é inferida de imagens de satélite.',
 'Outros nutrientes e observações':'Espaço para informações adicionais do laudo, incluindo método e unidade. Campos desconhecidos devem permanecer ausentes, não ser preenchidos com zero.',
 'Anexar laudo (até 5 MB)':'Guarda uma cópia local do arquivo e inclui o anexo no backup. Não há leitura automática, extração de valores ou envio do laudo à NASA.',
 'Contexto':'Histórico descreve o passado; recente representa observações próximas da data; previsão representa condições futuras de curto prazo; projeção representa cenários climáticos. Aqui os quatro contextos são fictícios e não têm uso operacional.',
 'Opacidade':'Controla a intensidade visual da camada sobre o mapa-base. Não altera o valor científico, a confiança ou a disponibilidade dos dados.',
 'Movimento do vento':'Ativa partículas que ilustram a direção do fluxo simulado. A velocidade da animação é visual e não representa deslocamento real em escala.',
 'Data':'Data de referência da camada ou série exibida. Neste protótipo os valores são sintéticos; selecionar uma data não consulta dados observados da NASA.',
 'Explorar período':'Percorre os 14 dias da janela demonstrativa. A reprodução anima datas dessa janela; não amplia o horizonte de planejamento nem cria uma previsão real.',
 'Vento':'Velocidade do vento simulada em metros por segundo (m/s). Partículas mostram o sentido ilustrativo do fluxo. “Fluxo para” indica a direção de destino, em graus a partir do norte. Não é observação meteorológica local.',
 'Chuva':'Precipitação diária simulada em milímetros. Um milímetro equivale a um litro de água por metro quadrado. Não representa intensidade instantânea nem chuva medida neste talhão.',
 'Temperatura do ar':'Temperatura do ar simulada em graus Celsius (°C). É diferente da temperatura da superfície e não representa medição de uma estação local.',
 'Umidade do solo':'Conteúdo volumétrico de água simulado em m³/m³. Não é umidade em porcentagem de massa, nem disponibilidade de água para uma cultura específica. Profundidade e resolução do produto real precisarão ser verificadas.',
 'Índice de vegetação':'Índice demonstrativo sem unidade. Representa visualmente variação da vegetação; não mede produtividade, espécie cultivada ou saúde da planta por si só. Valores atuais são sintéticos.',
 'Temperatura da superfície':'Temperatura simulada da superfície em °C, diferente da temperatura do ar. Uma futura observação depende do produto, horário de passagem, nuvens e resolução.',
 'Média diária':'Média aritmética dos valores diários disponíveis na série preservada. Dias ausentes ficam fora do cálculo. Para chuva, isso não é o acumulado do período.',
 'Disponibilidade':'Quantidade de dias com valor em relação ao total da série. Ausências não são zeros nem foram preenchidas. Disponibilidade não equivale a precisão ou qualidade agronômica.',
 'Resultado esperado · ilustrativo':'Descrição qualitativa de uma alternativa didática. Não é promessa de resultado. Produtividade e qualidade reais não são estimadas nesta etapa.',
 'Aderência às prioridades':'Comparação baseada na média de índices fixos das culturas, ponderada pelos pesos escolhidos. Não é uma probabilidade de sucesso nem um desempenho validado para o talhão.',
 'Evidências favoráveis simuladas':'Contexto científico fictício preservado junto ao plano. As séries ainda não alteram automaticamente a pontuação; não constituem evidências observadas da área.',
 'Riscos e limitações':'Fatores que o modelo ainda não avalia ou dados que faltam. Ausência de um risco listado não significa que a atividade seja segura ou agronomicamente adequada.',
 'Foco de investimento':'Categorias de recursos e atividades que merecem análise local. Não há preços, orçamento, retorno financeiro ou recomendação de compra calculados.',
 'Entre cultivos e após a colheita':'Atividades genéricas para discussão e acompanhamento. A reserva de 15 dias entre cultivos é didática, não uma prescrição técnica.',
 'Solo e adaptação climática':'Contribuições qualitativas ilustrativas das culturas. Efeitos dependem do ambiente e do manejo; não há quantificação validada de melhoria do solo ou resiliência.',
 'Conferência das restrições':'Verifica regras explícitas de calendário, culturas obrigatórias e exclusões. Compatibilidade com essas regras não comprova aptidão agrícola nem viabilidade operacional.',
 'Sistema de cultivo':'Sistema informado pelo produtor, como plantio direto ou convencional. Fica registrado no talhão e nos novos planos, mas ainda não atua como filtro automático.',
 'Disponibilidade de irrigação':'Condição declarada pelo produtor. Não é inferida por satélite. Ainda não filtra automaticamente as alternativas nem comprova disponibilidade ou autorização de uso de água.',
 'Equipamentos disponíveis':'Equipamentos informados para contextualizar a execução. O protótipo ainda não verifica capacidade, compatibilidade ou disponibilidade no calendário.',
 'Restrições de água e outras observações':'Limitações locais relatadas pelo produtor. Não são preenchidas por dados NASA nem aplicadas automaticamente como restrições no motor atual.',
 'Vértices: longitude, latitude · um por linha':'Coordenadas WGS84 em graus decimais, primeiro longitude e depois latitude. Cada linha é um vértice. Não repita o primeiro ponto. Alterações devem respeitar contenção e ausência de sobreposição.',
 'Arquivo GeoJSON':'Arquivo geográfico com polígonos em WGS84. Aceita até 50 áreas e 2 MB, sem furos ou multipolígonos. A importação mostra uma revisão e valida os limites antes de adicionar áreas.',
 'Conteúdo GeoJSON':'Alternativa ao arquivo: cole um objeto GeoJSON válido. As coordenadas devem estar na ordem longitude, latitude. Propriedades extras do arquivo não são interpretadas.',
 'Tipo de cadastro':'Escolha se as áreas importadas serão propriedades ou talhões. Talhões serão vinculados à propriedade ativa e precisam ficar dentro dela.',
 'Data prevista':'Dia previsto para a operação. Operações originadas do plano preservam sua data original; a execução efetiva é registrada separadamente.',
 'Situação':'Pendente significa sem confirmação; realizada exige data efetiva; não realizada exige motivo. Uma data passada gera apenas um aviso local, não uma conclusão sobre o campo.',
 'Data realizada':'Dia em que o produtor declara ter executado a operação. Diferenças em relação ao calendário são mostradas em dias. Não é validada automaticamente por satélite.',
 'Produtividade':'Quantidade colhida por hectare informada pelo produtor. É opcional e exige colheita realizada e cultivo associado. Branco significa desconhecido; zero significa produção zero declarada.',
 'Unidade':'Unidade do valor registrado. Em análises de solo, transcreva a do laudo. Em produtividade, kg/ha e sacas/ha só podem ser comparados conhecendo o peso da saca.',
 'Método':'Procedimento analítico usado pelo laboratório. Transcreva do laudo; valores de métodos diferentes não são automaticamente comparáveis.',
 'Observações / motivo':'Registro livre da execução ou motivo de não realização. Alterações preservam versões anteriores no diário; não modificam o plano original.',
 'Cultivo':'Cultivo do calendário ao qual a operação pertence. A associação evita atribuir uma produtividade a toda a rotação.',
 'Tipo':'Classifica a operação como implantação, colheita/encerramento, manejo ou observação. Não implica recomendação automática de uma prática.',
 'Título':'Nome descritivo do registro para identificá-lo no diário do plano.',
 'Cultura':'Nome do cultivo informado no histórico do talhão. Registros históricos são declarações do produtor, não identificação automática por satélite.',
 'Início':'Data de início do cultivo histórico. Deixe em branco quando desconhecida.',
 'Fim':'Data de encerramento do cultivo histórico. Quando ambas as datas existem, o fim não pode anteceder o início.',
 'Observações':'Informações adicionais do produtor sobre manejo, cultivo ou colheita. Não são interpretadas automaticamente pelo motor de planejamento.'
};
help['Precipitação']=help.Chuva;
help['Obrigatória']='Exige esta cultura na sequência. A mesma cultura não pode ser simultaneamente obrigatória e excluída.';
help['Excluída']='Retira esta cultura das alternativas. Se as exclusões impedirem uma sequência compatível, o planejamento mostrará o conflito.';
help['Objetivo']='Dimensão usada na comparação, como rendimento ou saúde do solo. Os pesos são definidos pelo produtor e os índices desta etapa são didáticos.';
help['Índice × peso']='Média dos índices didáticos das culturas para este objetivo, multiplicada pelo peso de 0 a 5 escolhido pelo produtor.';
help['Parcela']='Contribuição deste objetivo para o total da alternativa. A soma das parcelas determina a pontuação demonstrativa; não é um resultado agronômico.';
help['Novo início para toda a sequência']='Desloca todas as datas pelo mesmo número de dias, mantendo durações e intervalos. O horizonte em meses é contado a partir do novo início do primeiro cultivo. Confira antes de salvar.';
help['Motivo da revisão']='Justificativa informada pelo produtor. A revisão cria outro plano e preserva a origem; não transfere registros do diário anterior.';
help['Variação da chuva (%)']='Hipótese manual aplicada multiplicando cada valor diário existente por 1 + percentual/100. Exemplo: −20 reduz os valores em 20%. Não é previsão ou projeção NASA; ausências são preservadas.';
help['Variação da temperatura (°C)']='Diferença somada a cada temperatura diária preservada. +2 acrescenta dois graus Celsius. É um teste hipotético uniforme, não projeção climática validada.';
help['Variação da umidade do solo (%)']='Variação relativa sobre os valores volumétricos preservados, limitada ao intervalo 0–1 m³/m³. Não são pontos percentuais. Não calcula resposta da planta nem balanço hídrico.';
help['Nome do experimento']='Identifica um conjunto preservado de alternativas, pesos, dados-base e hipóteses. Um experimento não substitui o plano escolhido nem altera a configuração original.';
help['Faixa de posição ±1']='Menor e maior posição ao variar um peso por vez em um ponto, dentro de 0–5. Não é intervalo de confiança ou probabilidade de sucesso.';
help['Identificação da amostra']='Código ou nome usado no laudo para identificar esta amostra. Não é inferido pelo aplicativo; ajuda a distinguir coletas do mesmo talhão.';
help['Tipo de amostra']='Pontual identifica uma coleta localizada. Composta reúne subamostras conforme procedimento do responsável. Uma coordenada isolada não delimita a área representada por uma amostra composta.';
help['Data do laudo']='Data de emissão informada no laudo, distinta da coleta. Deve ser igual ou posterior à coleta quando ambas forem conhecidas.';
help['Laboratório informado']='Nome transcrito do laudo. O aplicativo não verifica a identidade do laboratório, o método ou a autenticidade do documento.';
help['Responsável pela coleta']='Pessoa ou equipe informada pelo produtor como responsável pela amostragem. Não é confirmação de autoria pelo aplicativo.';
help['Latitude da amostra']='Coordenada WGS84 em graus decimais entre −90 e 90, informada pelo produtor. Preencha junto com a longitude. Não é obtida de geolocalização automática.';
help['Longitude da amostra']='Coordenada WGS84 em graus decimais entre −180 e 180. A localização não torna a análise representativa do talhão inteiro. Pontos fora do limite atual são sinalizados para conferência.';
const ids={
 coordinates:'Informe latitude e depois longitude, separadas por vírgula, usando ponto decimal. Isso apenas navega o mapa; não altera os limites do talhão nem consulta clima.',
 'obs-field':'Consulta um ponto calculado pela média dos vértices do talhão ativo. Não é uma média espacial da área nem garante que o ponto esteja dentro de polígonos côncavos.',
 'obs-play':'Reproduz ou pausa a sequência de 14 dias simulados. A animação repete a janela selecionada e não representa uma previsão meteorológica real.',
 'obs-source':'Produto ou serviço candidato à integração futura. Nesta etapa nenhuma API NASA é consultada. Cobertura, resolução, qualidade e disponibilidade deverão ser verificadas na integração.',
 'obs-context-note':help.Contexto,
 'export':'Exporta propriedades, talhões, análises, anexos, configurações, planos e diários em JSON. O arquivo contém os dados locais e deve ser guardado por você.',
 'import':'Restaura um backup JSON após confirmação. Substitui os cadastros deste navegador; exporte uma cópia antes de substituir dados que deseja manter.'
};
const textOf=el=>[...el.childNodes].filter(n=>n.nodeType===3||!['INPUT','SELECT','TEXTAREA','OUTPUT','METER'].includes(n.tagName)).map(n=>n.textContent).join(' ').replace(/\s+/g,' ').trim();
function explanation(el){
 if(el.matches('iframe'))return null;
 if(ids[el.id])return ids[el.id];
 if(el.matches('.weather-bars i')&&!el.hasAttribute('title'))return el.dataset.explain;
 if(el.matches('.weather-bars i'))return `${el.getAttribute('title')||''} — Valor diário simulado no ponto consultado. A altura da barra usa a escala da variável; ausência não é zero.`;
 if(el.matches('[data-tab]'))return `Abrir a aba ${el.getAttribute('title')||el.textContent.trim()}. A propriedade e o talhão ativos permanecem identificados; mudar de aba não gera novas evidências climáticas.`;
 if(el.matches('[data-weather]'))return help[el.textContent.replace(/^[^\p{L}]+/u,'').trim()];
 if(el.matches('#active strong'))return el.closest('.field-context')?help.Talhão:help.Propriedade;
 if(el.matches('.crop-card .tag'))return 'Ciclo aproximado e simulado em dias, usado para demonstrar a compatibilidade com a janela disponível. Não foi validado por cultivar, região, época ou manejo.';
 if(el.matches('.crop-card .eyebrow'))return 'Família e papel ilustrativo da cultura na rotação: produção de grãos, cobertura ou diversificação. O catálogo demonstrativo não comprova aptidão agrícola regional.';
 if(el.matches('.area'))return 'Área aproximada em hectares (ha); 1 ha equivale a 10.000 m². Calculada a partir do polígono em modelo esférico, sem valor cadastral. Não é área medida em levantamento topográfico.';
 if(el.matches('.weather-legend'))return 'A escala associa cores aos valores e unidades da variável selecionada. Cinza indica ausência demonstrativa. As cores são suavizadas visualmente; não expressam resolução científica nem confiança.';
 if(el.matches('.weather-reading-value'))return 'Valor sintético da variável no ponto e na data consultados, com a unidade exibida. “Sem dados” é uma ausência explícita, não zero. O mesmo campo simulado gera os valores e as cores do mapa.';
 if(el.matches('.weather-reading-source'))return ids['obs-source'];
 if(el.matches('.weather-demo,.badge'))return 'Demonstração independente para o NASA Space Apps. Clima, características das culturas e resultados são simulados. Cadastro e registros do produtor são dados locais; nenhuma garantia agronômica é fornecida.';
 if(el.matches('meter'))return help['Aderência às prioridades'];
 if(el.matches('.crop-soil'))return help['Solo e adaptação climática'];
 const text=textOf(el);if(help[text])return help[text];
 if(/^(Início|Fim) do cultivo \d/.test(text))return 'Data proposta para este cultivo na revisão. Deve respeitar o ciclo mínimo demonstrativo, a janela máxima, o intervalo entre cultivos e o horizonte. Não é uma época de plantio validada.';
 if(/^Posição \d/.test(text))return 'Ordem do cultivo na sequência manual. As posições são usadas apenas no modo “Escolher minha sequência”. Posições vazias são ignoradas.';
 if(el.querySelector('[name^="window-"]'))return 'Número de dias reservado a este cultivo, distinto do horizonte total da rotação. Deve comportar o ciclo demonstrativo. Não é uma duração validada para sua região ou cultivar.';
 if(el.matches('input[name="required"]'))return 'Exige a presença desta cultura na sequência. Marcá-la também como excluída cria um conflito e impede o planejamento.';
 if(el.matches('input[name="excluded"]'))return 'Impede a presença desta cultura na sequência. Se também for obrigatória, será necessário resolver o conflito.';
 if(['P','K','Ca','Mg','S','N'].includes(text))return `${({P:'Fósforo',K:'Potássio',Ca:'Cálcio',Mg:'Magnésio',S:'Enxofre',N:'Nitrogênio'})[text]} conforme análise do laboratório. Transcreva valor, unidade e método do laudo. Ausente não é zero; o aplicativo não calcula dose ou disponibilidade para a cultura.`;
 return el.getAttribute('title')||null;
}
export function mountHelp(){
 const box=document.createElement('div');box.id='context-help';box.className='context-help';box.setAttribute('role','tooltip');box.setAttribute('popover','manual');document.body.append(box);
 let timer=null,active=null,pointer=null;
 function close(){clearTimeout(timer);timer=null;if(active){active.removeAttribute('aria-describedby');active=null;}if(box.matches(':popover-open'))box.hidePopover();}
 function show(el){if(!el.isConnected||!el.matches(':hover'))return;active=el;const dialog=el.closest('dialog');(dialog||document.body).append(box);box.textContent=el.dataset.explain;el.setAttribute('aria-describedby',box.id);box.showPopover();const rect=el.getBoundingClientRect(),b=box.getBoundingClientRect();box.style.left=`${Math.max(12,Math.min(rect.left,innerWidth-b.width-12))}px`;box.style.top=`${Math.max(12,rect.bottom+b.height+12<innerHeight?rect.bottom+8:rect.top-b.height-8)}px`;}
 function schedule(el){clearTimeout(timer);timer=setTimeout(()=>show(el),2000);}
 document.addEventListener('pointerover',e=>{if(e.pointerType==='touch')return;const el=e.target.closest('[data-explain]');if(!el||el===pointer)return;close();pointer=el;schedule(el);});
 document.addEventListener('pointermove',e=>{if(!pointer||active)return;if(pointer.contains(e.target))schedule(pointer);});
 document.addEventListener('pointerout',e=>{if(!pointer||pointer.contains(e.relatedTarget))return;if(e.relatedTarget===box)return;pointer=null;close();});
 box.addEventListener('pointerleave',()=>{pointer=null;close();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){pointer=null;close();}});
 document.addEventListener('pointerdown',()=>{pointer=null;close();});
 document.addEventListener('scroll',()=>{pointer=null;close();},true);window.addEventListener('resize',close);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)close();});
 function annotate(){document.querySelectorAll('[title],.weather-bars i,label,h4,th,#active strong,.crop-card .tag,.crop-card .eyebrow,.area,.weather-legend,.weather-reading-value,.weather-reading-source,.weather-demo,.badge,.crop-soil,meter,[data-weather],input[name="required"],input[name="excluded"],'+Object.keys(ids).map(id=>'#'+id).join(',')).forEach(el=>{const explanationText=explanation(el);if(explanationText){const nativeTitle=el.getAttribute('title');if(nativeTitle&&el.matches('button,input')&&(!el.hasAttribute('aria-label')||el.dataset.helpLabel==='true')){el.setAttribute('aria-label',nativeTitle);el.dataset.helpLabel='true';}el.dataset.explain=explanationText;el.classList.add('has-explanation');el.removeAttribute('title');}});if(active&&!active.isConnected)close();}
 annotate();new MutationObserver(records=>{if(records.some(r=>r.target!==box&&!box.contains(r.target)))annotate();}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['title']});
}

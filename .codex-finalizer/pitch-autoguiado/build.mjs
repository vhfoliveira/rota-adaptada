import fs from 'node:fs/promises';
import {Presentation,PresentationFile} from '@oai/artifact-tool';
const root='/home/voliveira/Documents/ChatGPT/Nasa';
const build=`${root}/.codex-finalizer/pitch-autoguiado`;
const out=`${root}/output/pitch-autoguiado`;
const screenshot=process.argv[2]||'';
const BG='#09121E',INK='#EEF4F8',MUTED='#A9B8C8',LIME='#B5ED64',FONT='Liberation Sans';
const p=Presentation.create({slideSize:{width:1280,height:720}});
function text(slide,value,x,y,w,h,size=28,color=INK,bold=false){
 const t=slide.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 t.text=value;t.text.style={fontSize:size,typeface:FONT,color,bold,verticalAlignment:'top',wrap:'square',insets:0};return t;
}
function slide(title,notes){const s=p.slides.add();s.background.fill=BG;text(s,title,72,56,1136,116,46,INK,true);s.speakerNotes.text=notes;return s;}
function table(slide,values,x,y,w,h,widths){
 const t=slide.tables.add({rows:values.length,columns:values[0].length,left:x,top:y,width:w,height:h,values,columnWidths:widths});
 t.borders.assign({fill:'#2B3D50',width:1,style:'solid'});
 for(let r=0;r<values.length;r++)for(let c=0;c<values[0].length;c++){
  const cell=t.getCell(r,c);cell.fill=r===0?'#142538':BG;cell.text.style={typeface:FONT,fontSize:r===0?24:28,color:r===0?LIME:INK,bold:r===0,verticalAlignment:'middle'};
 }
 return t;
}
const notes=[
 '15 segundos. Somos a equipe Interplários. Criamos a Rota Adaptada para ajudar o produtor a montar sua sequência de cultivos e comparar ajustes quando as condições mudam. Nosso desafio é Field Shift: Adapting Farms with NASA Data. Fonte: https://www.spaceappschallenge.org/2026/challenges/field-shift-adapting-farms-with-nasa-data/',
 '25 segundos. Imagine um produtor que planejou milho com braquiária e, depois, feijão. Quando o primeiro plantio atrasa doze dias, o calendário do cultivo seguinte também muda. Ele precisa entender o que ainda pode ajustar, respeitando seus ciclos e o intervalo entre operações. Este exemplo de Vilhena torna essa decisão visível. Dados: cenário demonstrativo calculado pelo motor em rota-adaptada/tests/guided-demo.test.js. Intervalo de sete dias é premissa do exemplo, não confirmação operacional.',
 '20 segundos. O produtor informa sua área, a data e as culturas que pretende plantar. A interface explica os campos e monta o calendário. Quem precisa aprofundar encontra os detalhes no painel avançado. Depois de salvar, pode simular um atraso e escolher quais mudanças aceita testar. Fonte: implementação da branch codex/planejamento-autoguiado.',
 '55 segundos, incluindo interação. Aqui temos milho com braquiária seguido de feijão. Primeiro, salvamos o plano. Agora simulamos doze dias de atraso e permitimos um ciclo mais curto. Mantendo o ciclo original, o plantio do feijão passa para vinte de março. Com o milho de cem dias, aparece vinte e oito de fevereiro: vinte dias de diferença no calendário simulado. O aplicativo mantém o plano original e permite salvar a alternativa. Solo desconhecido mantém a comparação parcial. Isso não demonstra ganho de produtividade nem confirma a data real de liberação da área. Cenário: Vilhena/RO, início 01/11/2026, milho120dias e feijão80dias, intervalo7dias, sequeiro. Motor e dataset reais do repositório.',
 '30 segundos. A NASA entra no cálculo do contexto climático de cada calendário. Para o ciclo de oitenta dias do feijão, consultamos os mesmos doze anos do histórico POWER, agora em períodos diferentes. A média de chuva acumulada muda de duzentos e trinta e seis vírgula seis para trezentos e oitenta e três vírgula seis milímetros. Mais chuva não indica, sozinha, uma opção melhor. É histórico, não previsão. Fontes: https://power.larc.nasa.gov/ e rota-adaptada/src/data/nasa-vilhena-2013-2024.json. Resultados reproduzidos em tests/guided-demo.test.js. Datas20/03/2027 e28/02/2027. ZARC/MAPA fornece condições oficiais complementares, sem certificar enquadramento da propriedade.',
 '20 segundos. O impacto que buscamos é autonomia para operar a ferramenta e clareza para comparar escolhas. Ainda precisamos medir isso com produtores e validar a interpretação agronômica. Não afirmamos redução de perdas ou aumento de produtividade. O próximo passo é observar pessoas usando o fluxo sem instrução e corrigir as dificuldades.',
 '15 segundos. Somos a equipe Interplários, de Vilhena. A próxima etapa é validar com produtores e agrônomos e ampliar os modelos regionais com fontes verificáveis. O projeto reúne planejamento, comparação e explicação em uma experiência que o produtor pode explorar. Link: https://deltashift.udisoft.app.br. Confirmar a publicação da versão demonstrada antes da apresentação.'
];
{
 const s=p.slides.add();s.background.fill=BG;
 text(s,'Rota Adaptada',72,145,805,100,72,LIME,true);
 text(s,'Planeje sua próxima safra.\nAdapte quando as condições mudarem.',76,270,790,150,35);
 text(s,'Equipe Interplários',76,500,780,44,26);
 text(s,'Field Shift: Adapting Farms with NASA Data',76,565,1120,48,24,MUTED);
 s.images.add({blob:new Uint8Array(await fs.readFile(`${root}/rota-adaptada/public/branding/interplarios.png`)),contentType:'image/png',alt:'Identidade da equipe Interplários',fit:'contain',position:{left:930,top:170,width:278,height:278}});
 s.speakerNotes.text=notes[0]+' Arte: identidade da equipe presente no repositório, public/branding/interplarios.png.';
}
{
 const s=slide('Um atraso muda os próximos cultivos',notes[1]);
 text(s,'Exemplo de Vilhena: milho com braquiária seguido de feijão',72,184,1136,48,28,MUTED);
 table(s,[['Situação','Plantio do milho','Plantio do feijão'],['Plano original','01/11/2026','08/03/2027'],['Atraso de 12 dias','13/11/2026','20/03/2027']],72,270,1136,246,[470,333,333]);
 text(s,'O produtor precisa rever o calendário e as mudanças que aceita fazer.',72,568,1136,80,31,LIME);
}
{
 const s=slide('O produtor constrói o plano',notes[2]);
 text(s,'Escolhas do produtor',72,210,520,56,34,LIME,true);
 text(s,'Área e data de início\nCulturas e ciclos\nIntervalos entre operações',72,300,520,235,32);
 text(s,'Apoio do aplicativo',680,210,528,56,34,LIME,true);
 text(s,'Calendário calculado\nContexto climático e condições\nComparação dos ajustes permitidos',680,300,528,235,32);
 text(s,'Orientação por etapas, com detalhes disponíveis no painel avançado.',72,606,1136,45,25,MUTED);
}
{
 const s=slide('20 dias de diferença\nno calendário simulado',notes[3]);
 if(screenshot){
  text(s,'Plantio do feijão',72,220,430,45,29,MUTED);
  text(s,'20/03/2027',72,290,440,66,49,INK,true);
  text(s,'Mantendo o ciclo de milho de 120 dias',72,364,420,76,25,MUTED);
  text(s,'28/02/2027',72,466,440,66,49,LIME,true);
  text(s,'Testando o ciclo de milho de 100 dias',72,540,420,76,25,MUTED);
  s.images.add({blob:new Uint8Array(await fs.readFile(screenshot)),contentType:'image/png',alt:'Captura real da comparação na Rota Adaptada',fit:'contain',crop:{left:0.0890625,right:0.0890625,top:0.20,bottom:0.12},position:{left:550,top:205,width:658,height:400}});
 }else{
  text(s,'Após um atraso de 12 dias no primeiro plantio',72,190,1136,56,30,MUTED);
  table(s,[['Escolha simulada','Plantio do feijão'],['Manter milho com ciclo de 120 dias','20/03/2027'],['Testar milho com ciclo de 100 dias','28/02/2027']],72,290,1136,245,[790,346]);
 }
 text(s,'Comparação parcial. Solo não confirmado. Datas de referência para planejamento.',72,650,1136,40,22,MUTED);
}
{
 const s=slide('O calendário muda o contexto climático',notes[4]);
 text(s,'Chuva acumulada média no ciclo de 80 dias do feijão',72,190,1136,45,29,MUTED);
 const chart=s.charts.add('bar',{position:{left:72,top:265,width:740,height:330},categories:['Plantio 20/03','Plantio 28/02'],series:[{name:'Chuva média (mm)',values:[236.6,383.6],fill:LIME,points:[{idx:0,fill:'#6E8FAE'},{idx:1,fill:LIME}]}],hasLegend:false,barOptions:{direction:'bar',grouping:'clustered',gapWidth:95},chartFill:BG,chartLine:{fill:'none',width:0},plotAreaFill:BG,plotAreaLine:{fill:'none',width:0},dataLabels:{showValue:true,position:'outEnd',numberFormatCode:'0.0" mm"',textStyle:{typeface:FONT,fontSize:25,fill:INK}},xAxis:{textStyle:{typeface:FONT,fontSize:25,fill:INK},majorGridlines:{fill:'none',width:0}},yAxis:{minimumScale:0,maximumScale:450,textStyle:{typeface:FONT,fontSize:20,fill:MUTED},majorGridlines:{fill:'#2B3D50',width:1}}});
 text(s,'NASA POWER',860,285,348,52,33,LIME,true);
 text(s,'2013–2024\n12 anos completos',860,370,348,110,31);
 text(s,'Histórico climático.\nMais chuva, isoladamente,\nnão define a melhor opção.',860,510,348,112,24,MUTED);
 text(s,'A mudança das datas muda o período histórico consultado. Não é previsão de safra.',72,652,1136,36,22,MUTED);
}
{
 const s=slide('Autonomia que podemos testar',notes[5]);
 text(s,'O produtor deve conseguir montar e entender seu planejamento sem instrução operacional.',72,205,1136,170,43,LIME,true);
 text(s,'A hipótese de impacto é reduzir a dependência de suporte para usar a ferramenta.',72,415,1136,100,31);
 text(s,'Próximo passo: testes com produtores e validação agronômica.\nAinda não medimos redução de perdas ou ganho de produtividade.',72,570,1136,90,25,MUTED);
}
{
 const s=slide('Equipe Interplários',notes[6]);
 text(s,'Vilhena, Rondônia',72,190,1136,50,30,MUTED);
 text(s,'Próximos passos',72,290,1136,60,38,LIME,true);
 text(s,'Validar o uso com produtores e agrônomos\nAmpliar modelos regionais com fontes verificáveis',72,380,1136,120,33);
 text(s,'deltashift.udisoft.app.br',72,590,1136,52,36,LIME,true);
}
await fs.mkdir(build,{recursive:true});await fs.mkdir(out,{recursive:true});
await (await PresentationFile.exportPptx(p)).save(`${build}/candidate.pptx`);
for(let i=0;i<p.slides.items.length;i++){
 const blob=await p.export({slide:p.slides.items[i],format:'png',scale:1});
 await fs.writeFile(`${build}/slide-${i+1}.png`,new Uint8Array(await blob.arrayBuffer()));
 const layout=await p.slides.items[i].export({format:'layout'});await fs.writeFile(`${build}/slide-${i+1}.layout.json`,await layout.text());
}
await fs.writeFile(`${build}/notes.json`,JSON.stringify(notes,null,2));
console.log(JSON.stringify({candidate:`${build}/candidate.pptx`,slides:p.slides.items.length,build,screenshot}));

from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_LEFT
pdfmetrics.registerFont(TTFont('Noto','/usr/share/fonts/noto/NotoSans-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoBold','/usr/share/fonts/noto/NotoSans-Bold.ttf'))
pdfmetrics.registerFontFamily('Noto',normal='Noto',bold='NotoBold',italic='Noto',boldItalic='NotoBold')
out='output/pdf/guia-conteudo-slides-rota-adaptada.pdf'
s=getSampleStyleSheet()
s.add(ParagraphStyle(name='TitleX',fontName='NotoBold',fontSize=26,leading=32,textColor=colors.HexColor('#123344'),spaceAfter=18))
s.add(ParagraphStyle(name='SubX',fontName='NotoBold',fontSize=12,leading=17,textColor=colors.HexColor('#007F7A'),spaceBefore=15,spaceAfter=7))
s.add(ParagraphStyle(name='BodyX',fontName='Noto',fontSize=10.5,leading=16,spaceAfter=8,textColor=colors.HexColor('#263C48')))
s.add(ParagraphStyle(name='QuoteX',fontName='NotoBold',fontSize=13,leading=20,spaceBefore=10,spaceAfter=12,textColor=colors.HexColor('#123344'),borderPadding=12,backColor=colors.HexColor('#EDF6F4')))
s.add(ParagraphStyle(name='SmallX',fontName='Noto',fontSize=8.5,leading=13,spaceAfter=6,textColor=colors.HexColor('#536570')))
story=[]
def p(t,style='BodyX'): story.append(Paragraph(t,s[style]))
def section(t,txt): p(t,'SubX');p(txt)
def bullets(items):
 for t in items:p('• '+t)
def new():story.append(PageBreak())
def footer(c,d):
 c.setStrokeColor(colors.HexColor('#D2E1E3'));c.line(45,43,550,43)
 c.setFont('Noto',8);c.setFillColor(colors.HexColor('#536570'));c.drawString(45,29,'ROTA ADAPTADA  /  Guia de conteúdo do pitch  /  15.11.2026');c.drawRightString(550,29,str(d.page))
p('GUIA DE CONTEÚDO  /  NASA SPACE APPS VILHENA','SubX')
p('O que colocar em<br/>cada slide','TitleX')
p('Rota Adaptada • Equipe Interplários','QuoteX')
p('Roteiro de montagem baseado no material do evento e na documentação atual do projeto. Este documento orienta a criação dos slides; não é o deck final.')
section('Formato solicitado pelo evento','7 slides, com apresentação total de 3 minutos. O vídeo de 30 segundos é uma entrega separada. Os tempos abaixo são uma sugestão de ensaio, não uma regra adicional.')
rows=[['SLIDE','CONTEÚDO','TEMPO'],['01','Apresentação','15 s'],['02','Problema e contexto','25 s'],['03','Solução e diferencial','25 s'],['04','Protótipo em funcionamento','40 s'],['05','Dados NASA e processamento','30 s'],['06','Impacto potencial','25 s'],['07','Equipe e próximos passos','20 s']]
t=Table(rows,colWidths=[65,340,80]);t.setStyle(TableStyle([('FONTNAME',(0,0),(-1,-1),'Noto'),('FONTNAME',(0,0),(-1,0),'NotoBold'),('FONTSIZE',(0,0),(-1,-1),10),('BACKGROUND',(0,0),(-1,0),colors.HexColor('#123344')),('TEXTCOLOR',(0,0),(-1,0),colors.white),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#EDF6F4'),colors.white]),('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),9)]));story.append(t)
section('A história que conecta os sete slides','Um atraso muda o calendário agrícola. O Rota Adaptada organiza o planejamento e permite comparar mudanças com histórico climático da NASA e condições publicadas de plantio, deixando visíveis os limites dos dados.')
section('Como usar este guia','Em cada página, use o texto sugerido como ponto de partida, prepare o visual indicado e resolva as pendências. Os detalhes técnicos apoiam a fala; não precisam ocupar o slide inteiro.')
slides=[
('Apresentação','15 segundos • Clareza e identidade',
['Nome do projeto: <b>Rota Adaptada</b>.','Nome da equipe: <b>Interplários</b>.','Título exato do desafio escolhido. A proposta local registra <b>Field Shift: Adapting Farms with NASA Data</b>; conferir com a inscrição.','Uma frase curta que explique a finalidade do produto.'],
'Planeje o plantio. Compare mudanças quando o calendário atrasa.',
'Nome em destaque, frase abaixo e equipe no rodapé. Use uma imagem discreta de campo ou uma tela atual do produto; o título do desafio deve permanecer legível.',
'Apresente o produto como apoio ao planejamento agrícola. Evite iniciar com a lista de tecnologias.',
'Confirmar a grafia oficial do desafio na inscrição e os nomes dos integrantes. O título foi localizado na proposta do projeto, não verificado na plataforma do evento.'),
('Problema e contexto','25 segundos • Relevância',
['Quem enfrenta a situação: produtores e técnicos que organizam uma sequência de cultivos.','O que acontece: um atraso desloca as datas e exige revisar as etapas seguintes.','Por que importa: comparar possibilidades exige reunir calendário, clima histórico e condições de plantio.','Relação com o desafio: adaptar o planejamento agrícola usando dados NASA.'],
'Quando o plantio atrasa, como reorganizar a sequência de cultivos?',
'Duas linhas de calendário: plano original e plano deslocado. Use o mesmo caso da demonstração do slide 4, com um atraso explicitamente identificado como simulado.',
'Conte uma situação concreta, sem atribuir perdas financeiras ou de produtividade que o projeto ainda não mediu. O calendário comprova o deslocamento; entrevistas ou fontes externas seriam necessárias para quantificar a dor.',
'Preparar uma evidência do problema: captura do calendário antes/depois ou relato autorizado de produtor. Se incluir estatística regional, registrar fonte, data e recorte. Não há medida de perdas validada nos documentos consultados.'),
('Solução e diferencial','25 segundos • Criatividade',
['O que faz: cria e salva planejamentos, consulta opções de plantio e compara ajustes após um atraso.','Como resolve: combina localização, cultivos, ciclos, datas e mudanças aceitas pelo produtor.','O que entrega: calendário, alternativas e explicação dos dados e condições avaliados.','Diferencial proposto: comparação explicável, respeitando permissões e mostrando lacunas.'],
'Um planejamento que pode ser revisto com dados e critérios claros.',
'Três blocos: Planejar → Simular atraso → Comparar e salvar. Abaixo, uma frase: “O plano original permanece preservado”.',
'O motor apresenta até três alternativas e altera uma etapa por vez. A consulta municipal ZARC é outra jornada disponível. Apresente essas capacidades como funcionamento do produto, sem afirmar exclusividade no mercado.',
'Selecionar apenas o fluxo principal para o pitch. Não apresentar otimização de lucro, recomendação por talhão ou previsão de produtividade como funcionalidades atuais.'),
('Protótipo em ação','40 segundos • Viabilidade e apresentação',
['Entrada: local, culturas, ciclos, data inicial e intervalo.','Ação: salvar o original, simular atraso e informar quais mudanças são permitidas.','Resultado: comparar calendários e condições disponíveis; mostrar uma lacuna quando existir.','Evidência: capturas atuais ou gravação curta do sistema funcionando.'],
'Do plano original à comparação de uma adaptação.',
'Use três capturas legíveis: entrada → calendário → comparação. Exemplo documentado: Vilhena/RO, milho com braquiária (120 dias), depois feijão (80 dias), início em 01/11/2026 e intervalo de 7 dias. Identifique como demonstração.',
'Demonstre um atraso escolhido para o ensaio e informe seu valor. Os ciclos são referências do exemplo. O solo começa desconhecido; resultados dependentes dele podem ficar não avaliados. Isso deve aparecer de forma coerente, sem criar uma classificação favorável.',
'Executar o caso na versão atual e capturar o resultado real. Não preencher números de risco ou ganho antes de obtê-los. Preparar capturas como apoio caso a conexão falhe; novas consultas precisam de internet.'),
('Dados NASA e processamento','30 segundos • Relevância e viabilidade',
['Fonte central: <b>NASA POWER</b>, séries diárias para a coordenada confirmada.','Variáveis: chuva, temperaturas máxima/mínima e índices de umidade superficial e radicular.','Processamento: cruzar o calendário com os dados históricos; quando houver parâmetros suficientes, avaliar condições nas fases do cultivo.','Saída: comparação histórica explicável, período e anos efetivamente avaliados, com lacunas visíveis.','Complementos separados: ZARC/MAPA para condições municipais e SoilGrids/ISRIC para estimativas de textura.'],
'Dados NASA → análise do calendário → comparação histórica.',
'Um fluxo de três colunas, com NASA POWER em destaque. Na lateral, ZARC/MAPA e SoilGrids como fontes complementares. No rodapé: “Histórico não é previsão”.',
'No exemplo de Vilhena, a série embarcada cobre 2013–2024. Nas consultas reais, o período depende do retorno disponível. Parâmetros da API: PRECTOTCORR, T2M_MAX, T2M_MIN, GWETTOP e GWETROOT. A integração documentada é POWER; não anunciar IMERG como integração independente.',
'Capturar uma tela que mostre fonte, período e resultado. SoilGrids não confirma classe oficial ZARC. Não chamar 12 anos de “12 safras validadas”: ciclos incompletos podem ficar sem avaliação.'),
('Impacto potencial','25 segundos • Impacto',
['Usuário: produtor e técnico com informações organizadas para revisar datas e possibilidades.','Comunidade: potencial de apoiar assistência técnica e discussão de alternativas entre produtores.','Escala: expansão depende de cobertura de dados e validação por cultura, região e safra.','Medição futura: tempo para revisar um plano, compreensão do resultado e utilidade na decisão.'],
'Mais clareza para revisar o planejamento agrícola.',
'Três níveis: produtor → assistência técnica → novas regiões. Separe visualmente “entregue no protótipo” de “a validar em campo”.',
'Hoje há organização do calendário e consulta a fontes de dados. Redução de perdas e aumento de produtividade são hipóteses a testar. Para quantificar impacto, um piloto deve registrar número de participantes, método e resultados antes/depois.',
'Não foram localizados indicadores de adoção ou ganhos comprovados. Inserir números somente com evidência. Propor um piloto com produtores e agrônomos, com métricas acordadas antes do início.'),
('Equipe e próximos passos','20 segundos • Apresentação e continuidade',
['Integrantes e funções reais: desenvolvimento, dados/agronomia, experiência do usuário e apresentação, conforme a equipe.','O que foi construído: aplicação de planejamento, consulta de opções e comparação de cenários.','Próximo passo: validar uso e critérios com agrônomos e produtores.','Continuidade: incorporar dados reais da propriedade e acompanhar um piloto.','Link ou QR code público do protótipo e do código-fonte.'],
'Próximo passo: validar no campo, com produtores e agrônomos.',
'Nomes e papéis em uma área; três próximos passos em outra. Reserve espaço para QR code e URL curta legível.',
'Feche com um convite concreto a parceiros técnicos e propriedades piloto. A documentação registra https://deltashift.udisoft.app.br como endereço de implantação; conferir disponibilidade antes de gerar o QR code.',
'Completar nomes e funções; confirmar acesso público do protótipo e do repositório. Não foram localizados os integrantes nem um endereço público confirmado do código nas fontes usadas para este guia.')]
for i,(title,time,items,copy,visual,speech,pending) in enumerate(slides,1):
 new();p(f'SLIDE {i:02d} / 07  •  {time}','SubX');p(title,'TitleX');section('Informações necessárias','');bullets(items);p(copy,'QuoteX');section('Visual a preparar',visual);section('O que explicar na fala',speech);section('Antes de finalizar',pending)
new();p('REVISÃO FINAL','SubX');p('O que falta para fechar o pitch','TitleX')
bullets(['Confirmar título oficial do desafio e integrantes/funções.','Executar a demonstração e selecionar três capturas atuais, com entradas e resultados consistentes.','Documentar qualquer número usado no problema ou no impacto.','Conferir links públicos e testar o QR code em outro dispositivo.','Ensaiar os sete slides em 180 segundos. Preparar separadamente o vídeo de 30 segundos.'])
section('Critérios cobertos','Impacto: slide 6. Criatividade: slide 3. Viabilidade: slides 4 e 5. Relevância ao desafio e uso central da NASA: slides 2 e 5. Clareza de apresentação: toda a narrativa, com identidade e fechamento nos slides 1 e 7.')
section('Afirmações que precisam manter seu limite','Histórico climático não prevê produtividade ou rentabilidade. Estimativa de solo não é análise laboratorial nem comprova enquadramento ZARC. Dias com cultura viva não equivalem automaticamente à persistência de palhada. Funcionalidade técnica não comprova benefício em campo ou autonomia de uso.')
section('Fontes utilizadas e prioridade','O guia usa a documentação atual para descrever funcionalidades e limites. A proposta antiga foi usada apenas para localizar o nome do desafio, pois contém descrições que diferem do estado atual.')
for txt in [
'1. Apresentação NASA SPACE APPS Vilhena.pdf (arquivo fornecido): seções “Critérios de avaliação”, “Pitch”, slides 01–07, “Framework de Pitch” e “Entregas”. Base da sequência, dos critérios e dos tempos exigidos.',
'2. CONTEXTO_DO_PROJETO.md e rota-adaptada/README.md: identidade, jornadas atuais, exemplo de Vilhena, persistência e limites.',
'3. DADOS_CONEXAO_APIS.md: NASA POWER, variáveis, SoilGrids e consulta municipal ZARC.',
'4. rota-adaptada/docs/MOTOR_CENARIOS.md: alternativas, condições de avaliação e tratamento das ausências.',
'5. docs/ESCOPO_RONDONIA.md: escopo, lacunas agronômicas e etapas propostas de validação.',
'6. rota_adaptada_proposta_de_software.md: título do desafio registrado localmente. deploy/README.md: endereço documentado de implantação.'
]:p(txt,'SmallX')
p('Documentos locais consultados em 15/11/2026. Este guia não atesta disponibilidade pública do site, validação agronômica nem resultados de campo.','SmallX')
SimpleDocTemplate(out,pagesize=(595.28,841.89),rightMargin=48,leftMargin=48,topMargin=42,bottomMargin=58).build(story,onFirstPage=footer,onLaterPages=footer)
print(out)

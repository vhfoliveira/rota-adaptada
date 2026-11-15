#!/usr/bin/env python3
"""Produce a 30-second, silent, captioned video from the captured working app.

Requirements: Python 3, ffmpeg/ffprobe, and Noto Sans fonts.
Run: python3 output/pitch-autoguiado/produzir-video-30s.py
No application source or screenshots are modified.
"""
from pathlib import Path
import json
import subprocess
import tempfile

OUT = Path(__file__).resolve().parent
FPS = 30
WIDTH, HEIGHT = 1920, 1080
FONT = Path('/usr/share/fonts/noto/NotoSans-Regular.ttf')
BOLD = Path('/usr/share/fonts/noto/NotoSans-Bold.ttf')
VIDEO = OUT / 'rota-adaptada-video-30s.mp4'
SCENES = [
    dict(image='inicio-desktop-vista.png', seconds=5,
         crop="900:520:190:110", stage='01  /  O PROBLEMA',
         title='Um atraso muda toda a sequência.',
         subtitle='Como rever o planejamento?'),
    dict(image='cultivos-desktop.png', seconds=4,
         crop="800:445:240:'780+320*min(t/4,1)'", stage='02  /  CRIAR MEU PLANEJAMENTO',
         title='Escolha as culturas e os ciclos.',
         subtitle='Preenchimento guiado, com explicações no contexto.'),
    dict(image='planejamento-desktop.png', seconds=3,
         crop="1056:500:112:322", stage='02  /  CRIAR MEU PLANEJAMENTO',
         title='Guarde o original, sem atraso.',
         subtitle='Milho com braquiária, depois feijão.'),
    dict(image='comparacao-desktop-sintese.png', seconds=8,
         crop="1056:474:112:196", stage='03  /  COMPARAR AJUSTES',
         title='20/03/2027 para 28/02/2027',
         subtitle='20 dias antes no calendário simulado, após 12 dias de atraso.'),
    dict(image='comparacao-desktop-sintese.png', seconds=7,
         crop="1070:584:105:190", stage='04  /  ENTENDER O CONTEXTO',
         title='NASA POWER 2013–2024: histórico, não previsão.',
         subtitle='Solo desconhecido. Avaliação parcial. Mais chuva não prova vantagem.'),
    dict(image='inicio-desktop-vista.png', seconds=3,
         crop="900:520:190:110", stage='05  /  ROTA ADAPTADA',
         title='Planeje. Compare. Entenda as condições.',
         subtitle='Equipe Interplários · Field Shift'),
]


def run(args):
    subprocess.run(args, check=True)


def draw_text(path, *, y, size, color='0xeaf1f5', bold=False, x=80):
    font = BOLD if bold else FONT
    return f"drawtext=fontfile='{font}':textfile='{path}':fontcolor={color}:fontsize={size}:x={x}:y={y}:fix_bounds=1"


def main():
    assert sum(scene['seconds'] for scene in SCENES) == 30
    for font in (FONT, BOLD):
        if not font.exists():
            raise SystemExit(f'Missing font: {font}')
    for scene in SCENES:
        if not (OUT / scene['image']).exists():
            raise SystemExit(f'Missing screenshot: {scene["image"]}')

    with tempfile.TemporaryDirectory(prefix='.video30s-', dir=OUT) as tmp:
        work = Path(tmp)
        clips = []
        for index, scene in enumerate(SCENES):
            text = {
                'brand': 'ROTA ADAPTADA',
                'demo': 'DEMONSTRAÇÃO · VILHENA / RO',
                'stage': scene['stage'],
                'title': scene['title'],
                'subtitle': scene['subtitle'],
            }
            files = {}
            for name, value in text.items():
                files[name] = work / f'{index}-{name}.txt'
                files[name].write_text(value, encoding='utf-8')
            duration = scene['seconds']
            filters = [
                f"crop={scene['crop']}",
                'scale=1728:720:force_original_aspect_ratio=decrease:flags=lanczos',
                'pad=1920:1080:(ow-iw)/2:140:color=0x08131d',
                'drawbox=x=80:y=120:w=1760:h=2:color=0x304655:t=fill',
                'drawbox=x=80:y=880:w=1760:h=2:color=0x304655:t=fill',
                draw_text(files['brand'], y=20, size=36, bold=True),
                draw_text(files['demo'], y=31, size=27, color='0xffd37d', x=1370),
                draw_text(files['stage'], y=76, size=23, color='0xb5ed64', bold=True),
                draw_text(files['title'], y=904, size=42, bold=True),
                draw_text(files['subtitle'], y=977, size=31, color='0xb8c9d5'),
                'setsar=1',
                'format=yuv420p',
                'fade=t=in:st=0:d=0.15',
                f'fade=t=out:st={duration - 0.15:.2f}:d=0.15',
            ]
            clip = work / f'scene-{index}.mp4'
            print(f'Producing scene {index + 1}/{len(SCENES)}: {duration}s', flush=True)
            run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                 '-loop', '1', '-framerate', str(FPS), '-i', str(OUT / scene['image']),
                 '-vf', ','.join(filters), '-frames:v', str(duration * FPS),
                 '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19',
                 '-pix_fmt', 'yuv420p', '-r', str(FPS), '-threads', '4', str(clip)])
            clips.append(clip)
        concat = work / 'clips.txt'
        concat.write_text(''.join(f"file '{clip}'\n" for clip in clips), encoding='utf-8')
        run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
             '-f', 'concat', '-safe', '0', '-i', str(concat), '-map', '0:v:0',
             '-c', 'copy', '-movflags', '+faststart', str(VIDEO)])

    metadata = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-count_frames', '-show_entries',
        'format=duration,size:stream=codec_name,width,height,r_frame_rate,nb_frames,nb_read_frames,duration',
        '-of', 'json', str(VIDEO)
    ]))
    stream = metadata['streams'][0]
    assert stream['width'] == WIDTH and stream['height'] == HEIGHT
    assert stream['r_frame_rate'] == '30/1'
    assert int(stream['nb_read_frames']) == 900
    assert abs(float(metadata['format']['duration']) - 30) < .000001
    metadata['production'] = {
        'source': 'Actual application screenshots listed in produzir-video-30s.py',
        'audio': 'None: silent video with burned-in Portuguese captions',
        'duration_seconds': 30,
        'frames': 900,
        'limitations': 'Edited screenshot presentation, not a continuous interaction recording. Demonstration only; unknown soil and partial assessment remain explicit.',
    }
    (OUT / 'video-30s-validacao.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    qa = OUT / 'video-30s-qa'
    qa.mkdir(exist_ok=True)
    for timestamp in (2, 7, 10, 16, 23, 28):
        run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', str(timestamp),
             '-i', str(VIDEO), '-frames:v', '1', str(qa / f'frame-{timestamp:02d}s.png')])
    print(json.dumps(metadata, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()

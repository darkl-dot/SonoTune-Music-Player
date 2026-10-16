"""Synthetic CC0 codec fixtures. Requires ffmpeg (or imageio-ffmpeg).
No ffmpeg executable is shipped with SonoTune.
"""
import math
import struct
import subprocess
import wave
from pathlib import Path
import argparse

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--ffmpeg', help='Path to an installed FFmpeg executable')
args = parser.parse_args()
if args.ffmpeg:
    ffmpeg = args.ffmpeg
else:
    from imageio_ffmpeg import get_ffmpeg_exe
    ffmpeg = get_ffmpeg_exe()
target = root / 'tests' / 'fixtures'
with wave.open(str(target / 'boundary.wav'), 'wb') as f:
    f.setparams((2, 2, 44100, 0, 'NONE', 'not compressed'))
    f.writeframes(b''.join(struct.pack('<hh', int(7000*math.cos(i*2*math.pi*441/44100)), int(5000*math.cos(i*2*math.pi*882/44100))) for i in range(44100)))
for name, encode_options in [
    ('tone.m4a', ['-c:a','aac','-b:a','128k']),
    ('tone.aac', ['-c:a','aac','-b:a','128k','-f','adts']),
    ('alac.m4a', ['-c:a','alac']),
    ('boundary.mp3', ['-c:a','libmp3lame','-q:a','2']),
    ('boundary-cbr.mp3', ['-c:a','libmp3lame','-b:a','128k']),
    ('no-gapless.mp3', ['-c:a','libmp3lame','-b:a','128k','-write_xing','0']),
]:
    subprocess.run([ffmpeg,'-v','error','-y','-i',str(target/'boundary.wav'),*encode_options,str(target/name)],check=True)
subprocess.run([ffmpeg,'-v','error','-y','-stream_loop','-1','-i',str(target/'boundary.wav'),'-t','4.125','-ar','48000','-ac','1','-c:a','aac',str(target/'long.m4a')],check=True)

# Exercise iTunes encoder metadata independently of the edit-list path.
def atom(kind, body):
    return struct.pack('>I4s', len(body)+8, kind)+body
def rewrite(data):
    out = b''
    while len(data) >= 8:
        size, kind = struct.unpack('>I4s', data[:8])
        body, data = data[8:size], data[size:]
        if kind == b'edts':
            continue
        if kind in [b'moov', b'trak', b'udta']:
            body = rewrite(body)
        elif kind == b'meta':
            body = body[:4]+rewrite(body[4:])
        elif kind == b'ilst':
            body += atom(b'----', atom(b'mean',b'\0'*4+b'com.apple.iTunes')+atom(b'name',b'\0'*4+b'iTunSMPB')+atom(b'data',b'\0\0\0\1\0\0\0\0'+b' 00000000 00000400 000003BC 000000000000AC44'))
        out += atom(kind,body)
    return out
(target/'smpb.m4a').write_bytes(rewrite((target/'tone.m4a').read_bytes()))

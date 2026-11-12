"""Render the store's code-native monogram into browser and installable app icons."""
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
svg = ET.parse(root / 'public/store-mark.svg').getroot()
ns = '{http://www.w3.org/2000/svg}'
rect, path, dot = (svg.find(ns + tag) for tag in ('rect', 'path', 'circle'))
assert path.attrib['d'] == 'M12 33V15l12 12 12-12v18', 'Update the monogram geometry when the SVG changes'
size = 2048
scale = size / 48

def render(maskable=False):
    background = rect.attrib['fill'] if maskable else (0, 0, 0, 0)
    im = Image.new('RGBA', (size, size), background)
    draw = ImageDraw.Draw(im)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=float(rect.attrib['rx']) * scale, fill=rect.attrib['fill'])
    points = [(x * scale, y * scale) for x, y in [(12,33),(12,15),(24,27),(36,15),(36,33)]]
    width = float(path.attrib['stroke-width']) * scale
    draw.line(points, fill=path.attrib['stroke'], width=round(width), joint='curve')
    for x, y in points:
        r = width / 2
        draw.ellipse((x-r,y-r,x+r,y+r), fill=path.attrib['stroke'])
    x,y,r = [float(dot.attrib[k])*scale for k in ('cx','cy','r')]
    draw.ellipse((x-r,y-r,x+r,y+r), fill=dot.attrib['fill'])
    return im

master = render()
for name, pixels in [('mohra-icon-512.png',512),('mohra-icon-192.png',192),('favicon.png',32)]:
    master.resize((pixels,pixels),Image.Resampling.LANCZOS).save(root/'public'/name)
render(True).resize((512,512),Image.Resampling.LANCZOS).save(root/'public/mohra-maskable-512.png')
render(True).resize((180,180),Image.Resampling.LANCZOS).convert('RGB').save(root/'public/apple-touch-icon.png')
master.resize((512,512),Image.Resampling.LANCZOS).save(root/'public/favicon.ico',format='ICO',sizes=[(n,n) for n in [16,32,48,64,128,256]])

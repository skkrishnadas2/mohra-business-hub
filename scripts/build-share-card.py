"""Generate the public, code-native MOHRA link preview without private shop data."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).resolve().parents[1]
im=Image.new('RGB',(1200,630),'#123c32');d=ImageDraw.Draw(im)
d.ellipse((845,245,1370,770),outline='#214c40',width=2)
d.ellipse((925,325,1290,690),outline='#214c40',width=2)
logo=Image.open(root/'public/mohra-icon-512.png').resize((150,150),Image.Resampling.LANCZOS)
im.paste(logo,(72,74),logo)
font=lambda size,bold=False:ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans'+('-Bold' if bold else '')+'.ttf',size)
d.text((260,76),'MOHRA',font=font(82,True),fill='#f8f9f7')
d.text((266,180),'IT CARE & TELECOM CENTER',font=font(27),fill='#a8d6bd')
d.text((72,316),'Your store. One workspace.',font=font(42,True),fill='#f8f9f7')
d.text((74,386),'POS  ·  Telecom  ·  MFS  ·  Khata',font=font(26),fill='#a8d6bd')
d.line((72,520,1128,520),fill='#315f51',width=2)
d.text((74,557),'PROPRIETOR',font=font(19),fill='#a8d6bd')
d.text((242,547),'Sankar Das',font=font(28,True),fill='#f8f9f7')
im.save(root/'public/mohra-share-v3.png')

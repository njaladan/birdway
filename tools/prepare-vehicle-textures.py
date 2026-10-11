"""Generate Birdway's original vehicle surface atlas (Pillow required).
Original paint grain, panel seams, tire tread, glass, liveries and decals.
No third-party marks, photographs or model licenses are required.
"""
from PIL import Image, ImageDraw, ImageFont
import random, pathlib, math
root=pathlib.Path(__file__).resolve().parent.parent
random.seed(41)
size=256
atlas=Image.new('RGB',(1024,1024));rough=Image.new('L',atlas.size,190)
try:
 font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',17)
 small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',11)
except OSError:font=small=ImageFont.load_default()
base=[(218,220,220),(36,38,39),(145,152,158),(238,241,235),(226,229,226),(236,175,38),(239,234,221),(41,65,77),(228,233,229),(228,230,224),(244,189,37),(245,243,224),(124,135,138),(238,238,235),(218,48,42),(234,225,213)]
for i,color in enumerate(base):
 tile=Image.new('RGB',(size,size));pix=tile.load()
 for y in range(size):
  for x in range(size):
   grain=random.gauss(0,2.3);dirt=7*max(0,(y-175)/81)*(1+math.sin(x*.09)*.25)
   pix[x,y]=tuple(max(0,min(255,round(v+grain-dirt))) for v in color)
 d=ImageDraw.Draw(tile)
 if i==0:
  d.line([(8,0),(8,256)],fill=(161,166,166),width=1);d.line([(246,0),(246,256)],fill=(240,241,239));d.line([(0,242),(256,242)],fill=(151,159,156))
 if i==1:
  for x in range(0,256,17):d.line([(x,0),(x+22,256)],fill=(17,19,20),width=5)
  for y in range(0,256,37):d.line([(0,y),(256,y+18)],fill=(57,58,58),width=2)
 if i in (2,12):
  for y in range(12,256,9):d.line([(0,y),(256,y)],fill=(105,115,121),width=1)
  for x in [12,244]:
   for y in [12,244]:d.ellipse((x-3,y-3,x+3,y+3),fill=(66,74,78))
 if i in (3,8):
  d.rectangle((0,108,256,199),fill=(25,77,132));d.rectangle((0,189,256,211),fill=(35,113,175));d.rectangle((0,217,256,256),fill=(190,196,191))
  d.text((19,128),'NYC TRANSIT',font=font,fill=(234,238,232));d.text((20,153),'LOCAL  /  SELECT',font=small,fill=(207,220,223))
 if i in (4,9):
  for x in range(12,256,38):d.line([(x,8),(x,244)],fill=(180,184,181),width=1)
  d.rectangle((22,109,230,164),fill=(31,75,92));d.text((35,124),'CITY DELIVERY',font=font,fill=(229,232,220))
 if i==5:
  for y in [70,88,179,197]:d.rectangle((0,y,256,y+5),fill=(34,37,34))
  d.text((23,117),'SCHOOL BUS',font=font,fill=(32,34,30))
 if i in (6,11):
  d.rectangle((0,118,256,161),fill=(169,39,35));d.text((27,131),'AMBULANCE' if i==6 else 'ACCESS-A-RIDE',font=small,fill=(254,246,231))
 if i==7:
  for y in range(256):
   v=round(27+(1-y/256)*44);d.line([(0,y),(256,y)],fill=(v,round(v*1.27),round(v*1.48)))
  d.polygon([(20,0),(57,0),(220,256),(191,256)],fill=(86,119,132));d.line([(0,247),(256,247)],fill=(22,34,41),width=6)
 if i==10:
  d.rectangle((0,160,256,188),fill=(31,33,29))
  for y in range(160,188,7):
   for x in range(0,256,14):d.rectangle((x+(7 if y%14 else 0),y,x+7+(7 if y%14 else 0),y+7),fill=(237,232,211))
  d.text((45,111),'NYC TAXI',font=font,fill=(45,44,29))
 if i==13:
  d.rectangle((0,126,256,193),fill=(36,91,65));d.text((24,145),'SANITATION',font=font,fill=(240,242,227))
 if i==14:
  d.rectangle((0,166,256,184),fill=(238,231,202));d.text((50,117),'FIRE / NYC',font=font,fill=(252,236,198))
 if i==15:
  d.rectangle((0,151,256,178),fill=(37,61,89));d.text((80,122),'POLICE',font=font,fill=(29,52,83))
 atlas.paste(tile,((i%4)*256,(i//4)*256));ImageDraw.Draw(rough).rectangle(((i%4)*256,(i//4)*256,(i%4+1)*256-1,(i//4+1)*256-1),fill=65 if i==7 else 235 if i==1 else 130 if i in (2,12) else 170)
path=root/'assets/vehicles';path.mkdir(exist_ok=True)
atlas.save(path/'surfaces.jpg',quality=91);rough.save(path/'roughness.png')
print('Original vehicle atlas generated')

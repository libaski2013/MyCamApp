from PIL import Image, ImageDraw, ImageFont
import math, subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
large=ImageFont.truetype(font,23);small=ImageFont.truetype(font,13)
output=root/'public/media/mycam-intro.mp4';output.parent.mkdir(exist_ok=True)
proc=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s','960x540','-r','20','-i','-','-an','-c:v','libx264','-preset','medium','-crf','27','-pix_fmt','yuv420p','-movflags','+faststart',str(output)],stdin=subprocess.PIPE)
for n in range(240):
 t=n/20;im=Image.new('RGB',(960,540),(16,21,35));d=ImageDraw.Draw(im)
 for x in range(380,980,35):d.line((x,0,x,540),fill=(28,34,53))
 for y in range(0,550,35):d.line((380,y,960,y),fill=(28,34,53))
 phase=int(t/3)%4
 labels=['CHOOSE YOUR PHOTO','MOVE NATURALLY','SELECT YOUR VOICE','RECORD OR CONNECT']
 d.rounded_rectangle((515,66,904,468),radius=22,fill=(26,31,49),outline=(65,76,102),width=2)
 d.text((535,84),'MYCAM  /  LIVE AVATAR STUDIO',fill=(197,173,147),font=small)
 x=713+int(12*math.sin(t*1.1));y=223+int(7*math.sin(t*1.8))
 d.ellipse((x-82,y-89,x+82,y+86),outline=(118,61,78),width=1)
 d.ellipse((x-95,y-102,x+95,y+100),outline=(79,64,88),width=1)
 d.rounded_rectangle((x-85,y+65,x+85,y+158),radius=50,fill=(137,29,41))
 d.ellipse((x-50,y-60,x+50,y+60),fill=(238,199,150))
 d.pieslice((x-54,y-66,x+54,y+19),180,360,fill=(54,38,44))
 blink=n%70<3
 for ex in [x-19,x+19]:
  if blink:d.line((ex-5,y-6,ex+5,y-6),fill=(59,41,46),width=3)
  else:d.ellipse((ex-3,y-10,ex+3,y-3),fill=(59,41,46))
 mouth=3+int(7*abs(math.sin(t*6))) if phase>=2 else 3
 d.ellipse((x-10,y+23-mouth,x+10,y+23+mouth),fill=(138,52,56))
 d.line((x,y+2,x-4,y+13,x+3,y+13),fill=(180,141,110),width=2)
 for i in range(26):
  h=4+int((12+15*math.sin(t*3+i*.7))*abs(math.sin(t*4-i)))
  d.rounded_rectangle((561+i*12,420-h,567+i*12,420+h),radius=2,fill=(240,196,107) if phase>=2 else (88,104,138))
 d.rounded_rectangle((552,117,641,139),radius=9,fill=(49,73,64));d.text((563,121),'AI AVATAR',font=small,fill=(159,218,190))
 d.text((534,479),labels[phase],font=large,fill=(240,196,107))
 for i in range(4):d.ellipse((535+i*17,516,542+i*17,523),fill=(240,196,107) if i==phase else (71,77,97))
 proc.stdin.write(im.tobytes())
proc.stdin.close();assert proc.wait()==0
print(output,output.stat().st_size)

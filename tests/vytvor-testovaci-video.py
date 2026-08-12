"""Vyrobí Y4M video s čárovým kódem EAN-13 pro test falešnou kamerou."""
L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011']
G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111']
R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100']
PARITA = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL']

def ean13_moduly(kod):
    d = [int(c) for c in kod]
    bits = '101'
    for i, p in enumerate(PARITA[d[0]]):
        bits += (L if p == 'L' else G)[d[i+1]]
    bits += '01010'
    for i in range(7, 13):
        bits += R[d[i]]
    return bits + '101'

W, H, MOD, FRAMES = 640, 480, 4, 30
ISBN = '9780306406157'
bits = ean13_moduly(ISBN)
sirka = len(bits) * MOD
x0 = (W - sirka) // 2
y0, y1 = 120, 360

radek = bytearray([255] * W)
for i, b in enumerate(bits):
    if b == '1':
        for x in range(x0 + i * MOD, x0 + (i + 1) * MOD):
            radek[x] = 0

bily = bytes([255] * W)
y_plane = b''.join(bytes(radek) if y0 <= y < y1 else bily for y in range(H))
uv = bytes([128] * ((W // 2) * (H // 2)))
frame = b'FRAME\n' + y_plane + uv + uv

import sys
cesta = sys.argv[1] if len(sys.argv) > 1 else 'carovy-kod.y4m'
with open(cesta, 'wb') as f:
    f.write(b'YUV4MPEG2 W%d H%d F30:1 Ip A1:1 C420mpeg2\n' % (W, H))
    for _ in range(FRAMES):
        f.write(frame)
print('Hotovo:', cesta, '| ISBN ve videu:', ISBN)

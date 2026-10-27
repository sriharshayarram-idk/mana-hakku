#!/bin/bash
# Builds the promo video: screenshots of the app, QR code, music, frames -> out/mana-hakku-promo.mp4
set -e
D=tools/promo; mkdir -p out $D/fonts
sudo apt-get -qq update >/dev/null && sudo apt-get -qq install -y fonts-noto-core ffmpeg >/dev/null
curl -sL -o $D/fonts/AnekTelugu.ttf "https://github.com/google/fonts/raw/main/ofl/anektelugu/AnekTelugu%5Bwdth%2Cwght%5D.ttf"
ls -la $D/fonts
pip install -q qrcode pillow numpy
python3 -c "import qrcode;q=qrcode.QRCode(border=1,box_size=12);q.add_data('https://sriharshayarram-idk.github.io/mana-hakku/');q.make();q.make_image(fill_color='#1A2463',back_color='white').save('$D/qr.png')"
npm i -s playwright@1.47.2 >/dev/null && npx playwright install --with-deps chromium >/dev/null
node $D/shots.js $D/shots
python3 $D/music.py out/music.wav 54
node $D/render.js $D out/still 30 1,3,8,14,21,28,35,41,47,52
node $D/render.js $D out/silent.mp4 30
ffmpeg -y -loglevel error -i out/silent.mp4 -i out/music.wav -c:v copy -c:a aac -b:a 160k -shortest -movflags +faststart out/mana-hakku-promo.mp4
cp $D/shots/*.png out/ ; rm -f out/silent.mp4
ls -la out

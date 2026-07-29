import sharp from 'sharp';
import fs from 'fs';

const svgBuffer = fs.readFileSync('./public/icon.svg');

sharp(svgBuffer)
  .resize(192, 192)
  .png()
  .toFile('./public/icon-192.png')
  .then(() => console.log('Generated icon-192.png'))
  .catch(err => console.error(err));

sharp(svgBuffer)
  .resize(512, 512)
  .png()
  .toFile('./public/icon-512.png')
  .then(() => console.log('Generated icon-512.png'))
  .catch(err => console.error(err));

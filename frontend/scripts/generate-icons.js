// Script para gerar ícones PWA
// Execute: node scripts/generate-icons.js
// Requer: npm install canvas

const fs = require('fs');
const path = require('path');

// Se canvas não estiver disponível, cria arquivos placeholder
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, '../public/icons');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

try {
  const { createCanvas } = require('canvas');

  sizes.forEach(size => {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, size * 0.125);
    ctx.fill();

    // Text
    ctx.fillStyle = 'white';
    ctx.font = `bold ${size * 0.45}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DB', size / 2, size / 2 + size * 0.05);

    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(path.join(iconsDir, `icon-${size}x${size}.png`), buffer);
    console.log(`Created icon-${size}x${size}.png`);
  });

  console.log('All icons generated successfully!');
} catch (e) {
  console.log('Canvas not available. Creating placeholder message...');
  console.log('To generate proper icons, run:');
  console.log('  npm install canvas');
  console.log('  node scripts/generate-icons.js');
  console.log('');
  console.log('Or use an online tool like https://realfavicongenerator.net/');
}

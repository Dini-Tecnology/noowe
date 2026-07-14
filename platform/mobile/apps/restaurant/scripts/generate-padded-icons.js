/**
 * Reduz o logo dentro do canvas do ícone (padding) para adaptive icons Android.
 * Uso: node scripts/generate-padded-icons.js
 */
const path = require('path');
const sharp = require('sharp');
const { setIconAsync } = require('@expo/prebuild-config/build/plugins/icons/withAndroidIcons');

const projectRoot = path.resolve(__dirname, '..');
const CANVAS = 1024;
// Zona segura Android ~66%; 56% deixa margem confortável na máscara circular.
const LOGO_SCALE = 0.56;

async function createPaddedIcon(sourceFile, outputFile) {
  const sourcePath = path.join(projectRoot, sourceFile);
  const outputPath = path.join(projectRoot, outputFile);
  const logoSize = Math.round(CANVAS * LOGO_SCALE);
  const offset = Math.round((CANVAS - logoSize) / 2);

  const logo = await sharp(sourcePath)
    .resize(logoSize, logoSize, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: logo, top: offset, left: offset }])
    .png()
    .toFile(outputPath);

  console.log(`Gerado ${outputFile} (logo ${Math.round(LOGO_SCALE * 100)}% do canvas)`);
}

async function main() {
  await createPaddedIcon('assets/adaptive-icon.png', 'assets/adaptive-icon.png');
  await createPaddedIcon('assets/icon.png', 'assets/icon.png');

  await setIconAsync(projectRoot, {
    icon: './assets/adaptive-icon.png',
    backgroundColor: '#FFFFFF',
    backgroundImage: null,
    monochromeImage: null,
    isAdaptive: true,
  });

  console.log('Ícones Android regenerados em android/app/src/main/res/mipmap-*');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

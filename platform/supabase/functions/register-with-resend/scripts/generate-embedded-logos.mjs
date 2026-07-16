import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../..');

const restaurantLogo = fs.readFileSync(
  path.join(root, 'mobile/apps/restaurant/assets/logo-completa-restaurant.png'),
);
const clientLogo = fs.readFileSync(
  path.join(root, 'mobile/apps/client/assets/icon.png'),
);

const out = `export const RESTAURANT_EMBEDDED_LOGO_DATA_URI = "data:image/png;base64,${restaurantLogo.toString('base64')}";

export const CLIENT_EMBEDDED_LOGO_DATA_URI = "data:image/png;base64,${clientLogo.toString('base64')}";

/** @deprecated use RESTAURANT_EMBEDDED_LOGO_DATA_URI */
export const EMBEDDED_LOGO_DATA_URI = RESTAURANT_EMBEDDED_LOGO_DATA_URI;
`;

const target = path.join(__dirname, '../embedded-logos.ts');
fs.writeFileSync(target, out);
console.log(`Wrote ${target} (restaurant ${restaurantLogo.length} B, client ${clientLogo.length} B)`);

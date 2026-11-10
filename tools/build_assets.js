const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const outHeader1 = path.join(__dirname, '..', 'firmware', 'WAVESCAN', 'web_assets.h');
const outHeader2 = path.join(__dirname, '..', 'firmware', 'web_assets.h');

const indexHtml = fs.readFileSync(path.join(dataDir, 'index.html'), 'utf8');
const styleCss = fs.readFileSync(path.join(dataDir, 'style.css'), 'utf8');
const appJs = fs.readFileSync(path.join(dataDir, 'app.js'), 'utf8');
const manifestJson = fs.readFileSync(path.join(dataDir, 'manifest.json'), 'utf8');
const swJs = fs.readFileSync(path.join(dataDir, 'sw.js'), 'utf8');
const iconSvg = fs.readFileSync(path.join(dataDir, 'icons', 'icon.svg'), 'utf8');

const icon192 = fs.readFileSync(path.join(dataDir, 'icons', 'icon-192.png'));
const icon512 = fs.readFileSync(path.join(dataDir, 'icons', 'icon-512.png'));

function toHexArray(buf) {
  const parts = [];
  for (let i = 0; i < buf.length; i++) {
    parts.push('0x' + buf[i].toString(16).padStart(2, '0'));
  }
  return parts.join(', ');
}

const headerContent = `#ifndef WEB_ASSETS_H
#define WEB_ASSETS_H

#include <Arduino.h>

const char INDEX_HTML[] PROGMEM = R"rawliteral(${indexHtml})rawliteral";

const char STYLE_CSS[] PROGMEM = R"rawliteral(${styleCss})rawliteral";

const char APP_JS[] PROGMEM = R"rawliteral(${appJs})rawliteral";

const char MANIFEST_JSON[] PROGMEM = R"rawliteral(${manifestJson})rawliteral";

const char SW_JS[] PROGMEM = R"rawliteral(${swJs})rawliteral";

const char ICON_SVG[] PROGMEM = R"rawliteral(${iconSvg})rawliteral";

const size_t ICON_192_PNG_LEN = ${icon192.length};
const uint8_t ICON_192_PNG[] PROGMEM = {
  ${toHexArray(icon192)}
};

const size_t ICON_512_PNG_LEN = ${icon512.length};
const uint8_t ICON_512_PNG[] PROGMEM = {
  ${toHexArray(icon512)}
};

#endif // WEB_ASSETS_H
`;

fs.writeFileSync(outHeader1, headerContent, 'utf8');
fs.writeFileSync(outHeader2, headerContent, 'utf8');
console.log('Successfully generated web_assets.h at:', outHeader1);

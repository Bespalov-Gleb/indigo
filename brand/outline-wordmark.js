const opentype = require("opentype.js");
const path = require("path");

const fontPath = path.join(
  __dirname,
  "node_modules",
  "@fontsource",
  "ibm-plex-sans",
  "files",
  "ibm-plex-sans-latin-600-normal.woff"
);
const font = opentype.loadSync(fontPath);

const text = "INDIGO";
const fontSize = 34;
const letterSpacingExtra = 0.32 * fontSize;
const startX = 44;
const baselineY = 40;

const combined = new opentype.Path();
let penX = startX;

for (let i = 0; i < text.length; i++) {
  const glyph = font.charToGlyph(text[i]);
  const glyphPath = glyph.getPath(penX, baselineY, fontSize);
  combined.extend(glyphPath);
  const advance = (glyph.advanceWidth * fontSize) / font.unitsPerEm;
  penX += advance;
  if (i < text.length - 1) penX += letterSpacingExtra;
}

process.stdout.write(combined.toPathData(2));

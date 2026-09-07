const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.resolve(__dirname, '..');
const androidDrawable = path.join(root, 'android', 'app', 'src', 'main', 'res', 'drawable');
const desktopIcons = path.join(root, 'src', 'renderer', 'assets', 'subject-icons');
const subjectVisualsPath = path.join(
  root,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'example',
  'eclassrecordmobile',
  'ui',
  'main',
  'SubjectVisuals.kt'
);
const academicWorkspacePath = path.join(
  root,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'example',
  'eclassrecordmobile',
  'ui',
  'AcademicWorkspace.kt'
);

const androidName = name => name.replace(/-/g, '_');
const iconNames = fs.readdirSync(desktopIcons)
  .filter(name => name.endsWith('.png'))
  .sort();

assert.strictEqual(iconNames.length, 21, 'Expected all 21 desktop subject icons.');

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  return upDistance <= upperLeftDistance ? up : upperLeft;
}

function readPngDimensions(filePath) {
  const input = fs.readFileSync(filePath);
  assert.strictEqual(input.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Invalid PNG signature.');
  return { width: input.readUInt32BE(16), height: input.readUInt32BE(20) };
}

function decodeRgbaPng(filePath) {
  const input = fs.readFileSync(filePath);
  assert.strictEqual(input.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Invalid PNG signature.');
  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlace;
  const compressed = [];

  while (offset < input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.subarray(offset + 4, offset + 8).toString('ascii');
    const data = input.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      compressed.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }

  assert.strictEqual(bitDepth, 8, 'Subject icons must use 8-bit PNG channels.');
  assert.strictEqual(colorType, 6, 'Subject icons must be RGBA PNG files.');
  assert.strictEqual(interlace, 0, 'Subject icons must be non-interlaced for deterministic validation.');

  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const raw = zlib.inflateSync(Buffer.concat(compressed));
  const pixels = Buffer.alloc(width * height * bytesPerPixel);
  let inputOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[inputOffset];
    inputOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[inputOffset + x];
      const left = x >= bytesPerPixel ? pixels[y * stride + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? pixels[(y - 1) * stride + x - bytesPerPixel] : 0;
      let decoded;
      if (filter === 0) decoded = value;
      else if (filter === 1) decoded = value + left;
      else if (filter === 2) decoded = value + up;
      else if (filter === 3) decoded = value + Math.floor((left + up) / 2);
      else if (filter === 4) decoded = value + paeth(left, up, upperLeft);
      else throw new Error('Unsupported PNG filter ' + filter);
      pixels[y * stride + x] = decoded & 0xff;
    }
    inputOffset += stride;
  }

  return { width, height, pixels };
}

for (const desktopName of iconNames) {
  const mobilePath = path.join(androidDrawable, androidName(desktopName));
  assert(fs.existsSync(mobilePath), 'Missing Android icon: ' + androidName(desktopName));
  const desktop = readPngDimensions(path.join(desktopIcons, desktopName));
  const mobile = decodeRgbaPng(mobilePath);

  assert(
    mobile.width * mobile.height < desktop.width * desktop.height * 0.90,
    desktopName + ' was not tightly cropped.'
  );
  const cornerIndexes = [
    3,
    (mobile.width - 1) * 4 + 3,
    (mobile.height - 1) * mobile.width * 4 + 3,
    ((mobile.height * mobile.width) - 1) * 4 + 3,
  ];
  cornerIndexes.forEach(index => assert.strictEqual(mobile.pixels[index], 0, desktopName + ' has an opaque corner.'));

  let transparent = 0;
  let visible = 0;
  for (let index = 3; index < mobile.pixels.length; index += 4) {
    if (mobile.pixels[index] === 0) transparent += 1;
    else visible += 1;
  }
  assert(transparent > mobile.width * mobile.height * 0.05, desktopName + ' lacks meaningful transparency.');
  assert(visible > mobile.width * mobile.height * 0.10, desktopName + ' lost too much subject artwork.');
}

const subjectVisuals = fs.readFileSync(subjectVisualsPath, 'utf8');
[
  '0xFF0EA5E9',
  '0xFF1E40AF',
  '0xFF16A34A',
  '0xFFEA580C',
  '0xFFDC2626',
  '0xFF7C3AED',
  '0xFFCA8A04',
  '0xFF92400E',
  '0xFF64748B',
].forEach(color => assert(subjectVisuals.includes(color), 'Missing desktop subject color ' + color));
assert(subjectVisuals.includes('painterResource(iconRes)'), 'Android should render preprocessed transparent assets.');
assert(!subjectVisuals.includes('BitmapFactory'), 'Runtime background removal should not be required.');

const academicWorkspace = fs.readFileSync(academicWorkspacePath, 'utf8');
assert(academicWorkspace.includes('SubjectVisuals.forAssignment(assignment).color'));
assert(academicWorkspace.includes('SubjectIconTile(assignment'));
assert(!academicWorkspace.includes('academicAccent('), 'Hash-based colors must not replace desktop subject colors.');

console.log('Mobile subject visuals validated: 21 transparent icons and the desktop subject palette.');

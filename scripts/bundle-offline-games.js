const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content, 'utf8');
}

function inlineBlock(source, startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start < 0 || end < start) throw new Error(`Missing bundle marker: ${startMarker}`);
  return source.slice(0, start) + startMarker + '\n' + replacement + '\n  '
    + source.slice(end);
}

const game2048Path = 'src/renderer/games/2048/index.html';
let game2048 = read(game2048Path);
const game2048Css = read('src/renderer/games/2048/vendor/style/main.css')
  .replace(/@import\s+url\([^)]*clear-sans\.css\);?/gi, '')
  .replace(/<\/style/gi, '<\\/style');
const game2048Scripts = [
  'bind_polyfill.js',
  'classlist_polyfill.js',
  'animframe_polyfill.js',
  'keyboard_input_manager.js',
  'html_actuator.js',
  'grid.js',
  'tile.js',
  'local_storage_manager.js',
  'game_manager.js',
  'application.js'
].map(file => `/* 2048-html/${file} */\n${read(`src/renderer/games/2048/vendor/js/${file}`)}`)
  .join('\n\n')
  .replace(/<\/script/gi, '<\\/script');

game2048 = inlineBlock(
  game2048,
  '<!-- BUNDLED_2048_CSS_START -->',
  '<!-- BUNDLED_2048_CSS_END -->',
  `<style data-bundled-from="2048-html@1.0.0">${game2048Css}</style>`
);
game2048 = inlineBlock(
  game2048,
  '<!-- BUNDLED_2048_JS_START -->',
  '<!-- BUNDLED_2048_JS_END -->',
  `<script data-bundled-from="2048-html@1.0.0">${game2048Scripts}</script>`
);
write(game2048Path, game2048);

const minesPath = 'src/renderer/games/minesweeper/index.html';
let mines = read(minesPath);
const minesCss = read('src/renderer/games/minesweeper/vendor/minesweeperjs.css')
  .replace(/<\/style/gi, '<\\/style');
const minesScript = read('src/renderer/games/minesweeper/vendor/minesweeper.js')
  .replace(/<\/script/gi, '<\\/script');

mines = inlineBlock(
  mines,
  '<!-- BUNDLED_MINES_CSS_START -->',
  '<!-- BUNDLED_MINES_CSS_END -->',
  `<style data-bundled-from="minesjs@1.0.2">${minesCss}</style>`
);
mines = inlineBlock(
  mines,
  '<!-- BUNDLED_MINES_JS_START -->',
  '<!-- BUNDLED_MINES_JS_END -->',
  `<script data-bundled-from="minesjs@1.0.2">${minesScript}</script>`
);
write(minesPath, mines);

console.log('Offline game assets bundled into sandbox-local HTML.');

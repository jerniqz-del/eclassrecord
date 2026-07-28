/**
 * Obfuscates JavaScript files in a chosen directory.
 *
 * This helper is intentionally directory-scoped. The release build wrapper
 * decides whether the target is the real src folder or a temporary copy.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const JavaScriptObfuscator = require('javascript-obfuscator');

const DEFAULT_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  numbersToExpressions: true,
  simplify: true,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  splitStrings: true,
  splitStringsChunkLength: 10
};

function getAllJsFiles(dir, filesList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getAllJsFiles(filePath, filesList);
    } else if (stat.isFile() && file.endsWith('.js') && file !== 'preload.js') {
      filesList.push(filePath);
    }
  }
  return filesList;
}

function getIdentifiersPrefix(targetDir, filePath) {
  const relativePath = path.relative(path.resolve(targetDir), path.resolve(filePath))
    .replace(/\\/g, '/');
  const digest = crypto.createHash('sha256').update(relativePath).digest('hex').slice(0, 12);
  return `_ecr_${digest}_`;
}

function obfuscateDirectory(targetDir, options = DEFAULT_OPTIONS) {
  const resolvedTarget = path.resolve(targetDir);
  if (!fs.existsSync(resolvedTarget)) {
    throw new Error(`Obfuscation target does not exist: ${resolvedTarget}`);
  }

  console.log(`Locating JavaScript files for obfuscation in ${resolvedTarget}...`);
  const jsFiles = getAllJsFiles(resolvedTarget);
  console.log(`Found ${jsFiles.length} files to obfuscate (excluding preload.js).`);

  jsFiles.forEach((filePath) => {
    console.log(`Obfuscating: ${path.relative(resolvedTarget, filePath)}`);
    const rawCode = fs.readFileSync(filePath, 'utf8');
    const fileOptions = {
      ...options,
      identifiersPrefix: getIdentifiersPrefix(resolvedTarget, filePath)
    };
    const obfuscatedResult = JavaScriptObfuscator.obfuscate(rawCode, fileOptions);
    fs.writeFileSync(filePath, obfuscatedResult.getObfuscatedCode(), 'utf8');
  });

  console.log('Obfuscation completed successfully.');
}

if (require.main === module) {
  const targetDir = process.argv[2] || path.join(__dirname, '../src');
  try {
    obfuscateDirectory(targetDir);
  } catch (error) {
    console.error('Obfuscation failed:', error);
    process.exit(1);
  }
}

module.exports = {
  obfuscateDirectory,
  getIdentifiersPrefix
};

/**
 * Source Code Obfuscation Script
 * Obfuscates in-place all JavaScript source files in src/ before packaging.
 */
const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const srcDir = path.join(__dirname, '../src');

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

console.log('Locating JavaScript files for obfuscation...');
const jsFiles = getAllJsFiles(srcDir);
console.log(`Found ${jsFiles.length} files to obfuscate (excluding preload.js).`);

jsFiles.forEach((filePath) => {
  console.log(`Obfuscating: ${path.relative(srcDir, filePath)}`);
  const rawCode = fs.readFileSync(filePath, 'utf8');
  
  try {
    const obfuscatedResult = JavaScriptObfuscator.obfuscate(rawCode, {
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
    });
    
    fs.writeFileSync(filePath, obfuscatedResult.getObfuscatedCode(), 'utf8');
  } catch (error) {
    console.error(`Failed to obfuscate ${filePath}:`, error);
    process.exit(1);
  }
});

console.log('Obfuscation completed successfully.');

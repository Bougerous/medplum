#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Function to recursively find all TypeScript files
function findTsFiles(dir, files = []) {
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
      findTsFiles(fullPath, files);
    } else if (item.endsWith('.ts') || item.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }

  return files;
}

// Function to fix unused variables by removing underscore prefix
function fixUnusedVariables(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Pattern to match unused variables with underscore prefix
  const patterns = [
    // Function parameters
    { regex: /function\s*\([^)]*_([a-zA-Z][a-zA-Z0-9]*)[^)]*\)/g, replacement: (match, varName) => match.replace(`_${varName}`, varName) },
    // Arrow function parameters
    { regex: /\([^)]*_([a-zA-Z][a-zA-Z0-9]*)[^)]*\)\s*=>/g, replacement: (match, varName) => match.replace(`_${varName}`, varName) },
    // Variable declarations
    { regex: /(const|let|var)\s+_([a-zA-Z][a-zA-Z0-9]*)\s*=/g, replacement: (match, declaration, varName) => match.replace(`_${varName}`, varName) },
    // Destructuring
    { regex: /{\s*_([a-zA-Z][a-zA-Z0-9]*)\s*}/g, replacement: (match, varName) => match.replace(`_${varName}`, varName) },
    // Array destructuring
    { regex: /\[\s*_([a-zA-Z][a-zA-Z0-9]*)\s*\]/g, replacement: (match, varName) => match.replace(`_${varName}`, varName) }
  ];

  patterns.forEach(pattern => {
    const newContent = content.replace(pattern.regex, pattern.replacement);
    if (newContent !== content) {
      content = newContent;
      modified = true;
    }
  });

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed unused variables in: ${filePath}`);
  }
}

// Main execution
console.log('🔧 Starting automatic lint fix...');

try {
  // Find all TypeScript files
  const tsFiles = findTsFiles('./src');
  console.log(`Found ${tsFiles.length} TypeScript files`);

  // Fix unused variables
  tsFiles.forEach(fixUnusedVariables);

  // Run ESLint auto-fix
  console.log('Running ESLint auto-fix...');
  execSync('npx eslint src/**/*.ts --fix', { stdio: 'inherit' });

  console.log('✅ Automatic lint fix completed!');

} catch (error) {
  console.error('❌ Error during automatic lint fix:', error.message);
  process.exit(1);
}

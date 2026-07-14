#!/usr/bin/env node
// magrathea_hack.cjs - A script to process files with a hacky workaround
// This script reads a file and outputs its content in uppercase.

const fs = require('fs');
const path = require('path');

// Improved: Added guard for missing argument and clarified naming
if (process.argv.length < 3) {
  console.error('Usage: node magrathea_hack.cjs <filename>');
  process.exit(1);
}

const filename = process.argv[2]; // Renamed from 'input' to 'filename' for clarity

try {
  const filePath = path.resolve(filename);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  console.log(content.toUpperCase());
} catch (error) {
  console.error('Error reading file:', error.message);
  process.exit(1);
}

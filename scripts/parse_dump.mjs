import { execSync } from 'child_process';
import fs from 'fs';

// Parse the MySQL dump and convert to D1-compatible SQL
const dump = fs.readFileSync('/tmp/anecdote_dump.sql', 'utf8');

// Extract INSERT statements and convert MySQL syntax to SQLite/D1
const lines = dump.split('\n');
const inserts: string[] = [];
const creates: string[] = [];
let currentTable = '';
let currentCreate = '';

for (const line of lines) {
  if (line.startsWith('CREATE TABLE')) {
    currentTable = line.match(/CREATE TABLE `?(\w+)`?/)?.[1] || '';
    currentCreate = '';
  }
  if (currentTable && line.trim() !== '') {
    currentCreate += line + '\n';
  }
  if (line.includes('ENGINE=InnoDB')) {
    creates.push(currentCreate);
    currentTable = '';
    currentCreate = '';
  }
  if (line.startsWith('INSERT INTO')) {
    // Convert MySQL INSERT to SQLite compatible
    let converted = line
      .replace(/\\'/g, "''")  // escape single quotes
      .replace(/\\n/g, '\n')   // newlines
      .replace(/\\\\/g, '\\'); // backslashes
    inserts.push(converted);
  }
}

// Write converted inserts
fs.writeFileSync('/tmp/d1_data.sql', inserts.join('\n') + '\n');
console.log(`Extracted ${inserts.length} INSERT statements`);
console.log(`Extracted ${creates.length} CREATE statements`);

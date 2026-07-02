import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const keywords = [
  'offline',
  'pending',
  'flagged',
  'recovery',
  'scanreview',
  'scan_review',
  'scan-review',
  'manualverify',
  'manual_verify',
  'manual-verify'
];

function search(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (file === 'node_modules' || file === '.git' || file === 'dist' || file === '.gemini' || file === '.gsd' || file === '.agent' || file === '.agents') continue;
    
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      search(fullPath);
    } else if (stat.isFile() && (file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.json'))) {
      if (fullPath.includes('search_all.js') || fullPath.includes('db.json') || fullPath.includes('sms_log.json')) continue;
      const content = fs.readFileSync(fullPath, 'utf8');
      const lowerContent = content.toLowerCase();
      
      const foundKeywords = keywords.filter(k => lowerContent.includes(k));
      if (foundKeywords.length > 0) {
        console.log(`Found in: ${fullPath} (keywords: ${foundKeywords.join(', ')})`);
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          const lowerLine = line.toLowerCase();
          if (keywords.some(k => lowerLine.includes(k))) {
            console.log(`  L${idx + 1}: ${line.trim()}`);
          }
        });
      }
    }
  }
}

search(rootDir);

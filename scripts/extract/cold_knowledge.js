const fs = require('fs');
const path = require('path');
const { buildColdKnowledgeResponse } = require('./lib/cold-knowledge');

const repoRoot = path.resolve(__dirname, '..', '..');
const outputFile = path.join(repoRoot, 'output', 'cold_knowledge.json');

function extractColdKnowledge() {
  const data = buildColdKnowledgeResponse({ root: repoRoot });
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`Generated ${path.relative(repoRoot, outputFile)} with ${data.data.length} articles.`);
}

if (require.main === module) {
  extractColdKnowledge();
}

module.exports = extractColdKnowledge;

import fs from 'fs';

async function main() {
  const res = await fetch('https://datazmws.pages.dev/api/qa/logs?limit=100');
  const data = await res.json();
  console.log('Total in DB:', data.total);
  for (const log of data.logs) {
    const beijingTime = new Date(new Date(log.createdAt).getTime() + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    console.log('ID: ' + log.id + ' | Time: ' + beijingTime + ' | Latency: ' + log.latencyMs + 'ms | Citations: ' + (log.citations ? log.citations.length : 0));
    console.log('Q: ' + log.question);
    console.log('A: ' + log.answer.replace(/\s+/g, ' ').slice(0, 150));
    console.log('---');
  }
}

main().catch(console.error);

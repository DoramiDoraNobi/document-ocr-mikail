const { execSync } = require('child_process');
try {
  const result = execSync('npx wrangler d1 execute document-reader-db --local --command="SELECT raw_ai_json FROM documents ORDER BY created_at DESC LIMIT 1" --json').toString();
  console.log(result);
} catch (e) {
  console.error(e.stdout ? e.stdout.toString() : e.message);
}

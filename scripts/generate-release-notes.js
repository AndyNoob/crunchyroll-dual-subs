import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import pkg from "../package.json" with { type: "json" };

async function generateReleaseNotes() {
  const changelog = await readFile("./CHANGELOG.md", "utf-8") || "";
  const commit = changelog.match(/> Last commit: (.+)/)[ 1 ] || "HEAD";
  const notes = execSync(`
        git log ${ commit }..HEAD --pretty=format:'- %s (%an)' |
              grep -v 'github-actions\\[bot\\]' |
              grep -v 'Bump ' || true
  `, { encoding: "utf-8" });
  const latestCommit = execSync(`
        git rev-parse --short HEAD
  `, {encoding: "utf-8"}).trim();
  return `> Latest commit: ${latestCommit}\n\n# ${ pkg.version }\n\n${ notes }\n\n`;
}

generateReleaseNotes().then(r => {
  process.stdout.write(r);
});
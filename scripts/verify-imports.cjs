const fs = require("fs");
const path = require("path");

function walk(dir) {
  return fs.readdirSync(dir).flatMap((f) => {
    const full = path.join(dir, f);
    return fs.statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const root = path.join(__dirname, "..");
const files = walk(path.join(root, "js")).filter((f) => f.endsWith(".js"));
let problems = 0;

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const importRe = /import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g;
  let m;
  while ((m = importRe.exec(src))) {
    const names = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    const rel = m[2];
    if (!rel.startsWith(".")) continue;
    const resolved = path.normalize(path.join(path.dirname(file), rel));
    if (!fs.existsSync(resolved)) {
      console.log(`MISSING FILE: ${path.relative(root, file)} imports "${rel}" -> not found`);
      problems++;
      continue;
    }
    const targetSrc = fs.readFileSync(resolved, "utf8");
    for (const name of names) {
      const bare = name.split(" as ")[0].trim();
      const pattern = "export\\s+(async\\s+function|class|function|const|let|var)\\s+" + bare + "\\b";
      const re = new RegExp(pattern);
      if (!re.test(targetSrc)) {
        console.log(`MISSING EXPORT: ${path.relative(root, file)} imports "${bare}" from ${rel}, not found in ${path.relative(root, resolved)}`);
        problems++;
      }
    }
  }
}
console.log(problems === 0 ? "All imports resolve correctly." : `${problems} problem(s) found.`);

const fs = require('fs');
const path = require('path');

function addJsExtensions(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      addJsExtensions(fullPath);
    } else if (file.name.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      // Replace relative imports without extension
      content = content.replace(/import\s+([^'"]*)\s+from\s+['"](\.\.?\/[^'"]*?)['"]/g, (match, imports, path) => {
        if (!path.includes('.') && !path.endsWith('/')) {
          return `import ${imports} from '${path}.js'`;
        }
        return match;
      });
      // Also for dynamic imports if any
      content = content.replace(/import\s*\(\s*['"](\.\.?\/[^'"]*?)['"]/g, (match, path) => {
        if (!path.includes('.') && !path.endsWith('/')) {
          return `import('${path}.js'`;
        }
        return match;
      });
      fs.writeFileSync(fullPath, content);
    }
  }
}

addJsExtensions('./dist');
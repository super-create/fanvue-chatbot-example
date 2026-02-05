const fs = require('fs');
let content = fs.readFileSync('./public/app-client.js', 'utf8');

// Remove the problematic DOMContentLoaded handler at the end
content = content.replace(/\n\/\/ Initialize when DOM is ready\n\n    \}\);\n\ndocument\.addEventListener\('DOMContentLoaded', async function\(\) \{[\s\S]*?\}\);$/, '\n    });\n');

// Find the end of window.addEventListener('load'... closing and add startAutoRefresh before it
const windowLoadMatch = content.match(/window\.addEventListener\('load', async function\(\) \{([\s\S]*?)\n    \}\);/);
if (windowLoadMatch) {
    const loadContent = windowLoadMatch[1];
    if (!loadContent.includes('startAutoRefresh()')) {
        content = content.replace(
            /window\.addEventListener\('load', async function\(\) \{([\s\S]*?)\n    \}\);/,
            `window.addEventListener('load', async function() {$1

        // Start auto-refresh for new messages
        console.log('[Init] Starting auto-refresh...');
        startAutoRefresh();
    });`
        );
    }
}

fs.writeFileSync('./public/app-client.js', content);
console.log('Fixed initialization - startAutoRefresh added to window load handler');

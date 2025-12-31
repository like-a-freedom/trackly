const fs = require('fs');
const path = require('path');

function fail(msg) {
    console.error('SEO CHECK FAILED:', msg);
    process.exit(2);
}

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const robotsPath = path.join(root, 'public', 'robots.txt');
const sitemapPath = path.join(root, 'public', 'sitemap.xml');

if (!fs.existsSync(indexPath)) fail('index.html not found');
const index = fs.readFileSync(indexPath, 'utf8');
if (!/og:title/i.test(index)) fail('og:title meta tag not found in index.html');
if (!/name=\"description\"/i.test(index)) fail('description meta tag not found in index.html');
if (!fs.existsSync(robotsPath)) fail('public/robots.txt not found');
if (!fs.existsSync(sitemapPath)) fail('public/sitemap.xml not found');

console.log('SEO quick check: OK');
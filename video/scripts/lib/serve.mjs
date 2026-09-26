import http from 'node:http';
import {createReadStream, existsSync, statSync} from 'node:fs';
import {join, extname} from 'node:path';

const TYPES = {'.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.xml': 'text/xml'};

// Serves a built site directory on a free port. Returns {url, close}.
export function serve(dir) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(dir, p);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {'content-type': TYPES[extname(file)] || 'application/octet-stream'});
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({url: `http://127.0.0.1:${server.address().port}`, close: () => server.close()});
    });
  });
}

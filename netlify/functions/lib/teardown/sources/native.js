'use strict';

/**
 * The built-in fetcher: a plain HTTP GET, no JavaScript executed.
 *
 * This is the default and the fallback. It is fast, needs nothing installed,
 * and is exactly right for a server-rendered site. On a Wix, Squarespace,
 * React or Next.js site it reads whatever the server sent, which may be an
 * empty shell, so prefer a rendering source there.
 */

const { fetchPage } = require('../fetcher');

module.exports = {
  name: 'native',
  rendersJavaScript: false,
  returnsMarkdown: false,
  describe: () => 'built-in HTTP fetcher (no JavaScript execution)',
  fetchPage,
};

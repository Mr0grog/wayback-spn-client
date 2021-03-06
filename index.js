const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const PARALLELISM = 8;
const ARCHIVE_BASE = 'https://web.archive.org/';
const PAGE_TIMEOUT = 120 * 1000;
// Args to make running in Docker simpler
const BROWSER_ARGS = [
  '--disable-dev-shm-usage',
  '--no-sandbox',
  '--disable-setuid-sandbox'
];

// Add Promise.finally
if (!Promise.prototype.finally) {
  Promise.prototype.finally = function (action) {
    return this.then(
      value => (action(), value),
      error => (action(), Promise.reject(error))
    );
  };
}

function delay (milliseconds) {
  let timer = 0;
  let complete = null;
  const result = new Promise(resolve => {
    complete = aborted => {
      complete = () => null;
      clearTimeout(timer);
      resolve({timer: milliseconds, aborted});
    };
    timer = setTimeout(() => complete(false), milliseconds);
  });
  result.abort = () => complete(true);
  return result;
}


/**
 * Read URLs from the queue and save them using the Wayback Machine's "Save
 * Page Now" via a Headless Chrome browser instance.
 * @param {Array<string>} queue Array of URLs to save
 * @param {Promise<puppeteer.Browser>} browser Promise for a puppeteer browser
 */
async function work (queue, browser) {
  let page = null;

  let url;
  while (url = queue.shift()) {
    try {
      new URL(url);
    }
    catch (error) {
      console.error(`Invalid URL: ${url}`);
      continue;
    }

    if (!page) {
      page = await browser.newPage();
    }

    const timeout = PAGE_TIMEOUT;
    const start = Date.now();
    await page.goto(`${ARCHIVE_BASE}save/${url}`, {
      timeout,
      waitUntil: 'domcontentloaded'
    }).catch(error => null);

    // When saving is done, it should navigate to:
    // `web.archive.org/web/{timestamp}/{url}`
    while (!page.url().startsWith(`${ARCHIVE_BASE}web/`)) {
      const remaining = timeout - (Date.now() - start);
      if (remaining <= 0) break;

      let timer = delay(remaining);
      await Promise.race([
        page.waitForNavigation({
          timeout: remaining,
          waitUntil: 'domcontentloaded'
        }).catch(error => null),
        // waitForNavigation's timeout doesn't always seem to work, so use our
        // own timer to bail out early here.
        timer
      ]);
      timer.abort();
    }

    const time = ((Date.now() - start) / 1000).toFixed(1);
    if (!page.url().startsWith(`${ARCHIVE_BASE}web/`)) {
      console.error(`Took too long to save ${url} (${time} s)`);
      // Clear out the current page instance and force creating a fresh one
      page.close();
      page = null;
      // Wait a moment before continuing in case we've overheated Wayback or
      // the captured site
      await delay(500);

    }
    else {
      console.log(`Saved ${page.url()} (${time} s)`);
    }
  }

  if (page) {
    await page.close();
  }
}

async function workOnFile (filePath) {
  let text;
  try {
    text = await fs.promises.readFile(filePath, 'utf8');
  }
  catch (error) {
    throw new Error(`Can't load file at path: ${filePath}`);
  }

  // One URL per line, skipping blank lines and comment lines (`# Comment`)
  const queue = text.split('\n')
    .map(line => line.trim())
    .filter(line => !!line && !line.startsWith('#'));
  const browser = await puppeteer.launch({args: BROWSER_ARGS});
  console.log(`Saving ${queue.length} URLs...`);

  const workers = [];
  for (let i = 0; i < PARALLELISM; i++) {
    workers.push(work(queue, browser));
  }

  try {
    await Promise.all(workers);
  }
  finally {
    browser.close();
  }
}

if (require.main === module) {
  let inputPath = process.argv[2];
  if (!inputPath) {
    console.error('You must specify a path to a file listing URLs to save.');
  }
  else {
    const processStart = Date.now();
    inputPath = path.resolve(inputPath);
    workOnFile(inputPath)
      .finally(() => {
        const time = ((Date.now() - processStart) / 1000).toFixed(1);
        console.log(`Finished all URLs after ${time} seconds`);
      })
      .catch(error => {
        console.error(error.message);
        process.exitCode = 1;
      });
  }
}

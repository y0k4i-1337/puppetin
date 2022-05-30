// puppeteer-extra is a drop-in replacement for puppeteer,
// it augments the installed puppeteer with plugin functionality
const puppeteer = require('puppeteer-extra')

// add stealth plugin and use defaults (all evasion techniques)
const StealthPlugin = require('puppeteer-extra-plugin-stealth')

puppeteer.use(StealthPlugin())
puppeteer.use(require('puppeteer-extra-plugin-repl')())

const { Command } = require('commander');
const program = new Command();

program
  .name('puppetin')
  .description('Scrap LinkedIn profiles')
  .version('0.1.0');

program
  .option('-u, --username <string>', 'username used to authenticate')
  .option('-p, --password <string>', 'password used to authenticate')
  .option('-c, --cookie <string>', 'provide li_at cookie instead of credentials')
  .option('-u, --url <string>', 'URL from where to start scraping')
  .requiredOption('-s, --search <string>', 'search string');

program.parse();

async function startBrowser(options = { headless: true }) {
  const browser = await puppeteer.launch(options);
  const page = await browser.newPage();
  return {browser, page};
}

async function closeBrowser(browser) {
  return browser.close();
}

/*
Provide either username and password pair or cookie
*/
async function auth({page, username, password, cookie}) {
  if (cookie) {
    await page.setCookie({name: 'li_at', value: cookie});
    await page.reload();
  }
  // TODO: authenticate using username and password
}

async function waitForSelectors(selectors, frame, options) {
  for (const selector of selectors) {
    try {
      return await waitForSelector(selector, frame, options);
    } catch (err) {
      console.error(err);
    }
  }
  throw new Error('Could not find element for selectors: ' + JSON.stringify(selectors));
}

async function scrollIntoViewIfNeeded(element, timeout) {
  await waitForConnected(element, timeout);
  const isInViewport = await element.isIntersectingViewport({ threshold: 0 });
  if (isInViewport) {
    return;
  }
  await element.evaluate(element => {
    element.scrollIntoView({
      block: 'center',
      inline: 'center',
      behavior: 'auto',
    });
  });
  await waitForInViewport(element, timeout);
}

async function waitForConnected(element, timeout) {
  await waitForFunction(async () => {
    return await element.getProperty('isConnected');
  }, timeout);
}

async function waitForInViewport(element, timeout) {
  await waitForFunction(async () => {
    return await element.isIntersectingViewport({ threshold: 0 });
  }, timeout);
}

async function waitForSelector(selector, frame, options) {
  if (!Array.isArray(selector)) {
    selector = [selector];
  }
  if (!selector.length) {
    throw new Error('Empty selector provided to waitForSelector');
  }
  let element = null;
  for (let i = 0; i < selector.length; i++) {
    const part = selector[i];
    if (element) {
      element = await element.waitForSelector(part, options);
    } else {
      element = await frame.waitForSelector(part, options);
    }
    if (!element) {
      throw new Error('Could not find element: ' + selector.join('>>'));
    }
    if (i < selector.length - 1) {
      element = (await element.evaluateHandle(el => el.shadowRoot ? el.shadowRoot : el)).asElement();
    }
  }
  if (!element) {
    throw new Error('Could not find element: ' + selector.join('|'));
  }
  return element;
}

async function waitForElement(step, frame, timeout) {
  const count = step.count || 1;
  const operator = step.operator || '>=';
  const comp = {
    '==': (a, b) => a === b,
    '>=': (a, b) => a >= b,
    '<=': (a, b) => a <= b,
  };
  const compFn = comp[operator];
  await waitForFunction(async () => {
    const elements = await querySelectorsAll(step.selectors, frame);
    return compFn(elements.length, count);
  }, timeout);
}

async function querySelectorsAll(selectors, frame) {
  for (const selector of selectors) {
    const result = await querySelectorAll(selector, frame);
    if (result.length) {
      return result;
    }
  }
  return [];
}

async function querySelectorAll(selector, frame) {
  if (!Array.isArray(selector)) {
    selector = [selector];
  }
  if (!selector.length) {
    throw new Error('Empty selector provided to querySelectorAll');
  }
  let elements = [];
  for (let i = 0; i < selector.length; i++) {
    const part = selector[i];
    if (i === 0) {
      elements = await frame.$$(part);
    } else {
      const tmpElements = elements;
      elements = [];
      for (const el of tmpElements) {
        elements.push(...(await el.$$(part)));
      }
    }
    if (elements.length === 0) {
      return [];
    }
    if (i < selector.length - 1) {
      const tmpElements = [];
      for (const el of elements) {
        const newEl = (await el.evaluateHandle(el => el.shadowRoot ? el.shadowRoot : el)).asElement();
        if (newEl) {
          tmpElements.push(newEl);
        }
      }
      elements = tmpElements;
    }
  }
  return elements;
}

async function waitForFunction(fn, timeout) {
  let isActive = true;
  setTimeout(() => {
    isActive = false;
  }, timeout);
  while (isActive) {
    const result = await fn();
    if (result) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Timed out');
}

async function searchEmployeesFromCompany({page, company, timeout, url}) {
  const SEARCHBAR_SELECTOR = '.search-global-typeahead__input';
  const PEOPLE_SELECTOR = 'aria/People[role="pushbutton"]';
  const CURRENTCOMPANY_SELECTOR = 'li.search-reusables__primary-filter:nth-child(5) > div:nth-child(1) > span:nth-child(2) > button:nth-child(1)';
  const FIRSTCURRENTCOMPANY_SELECTOR = '';
  const targetPage = page;
  let element;
  if (url) {
    await page.goto(url, { waitUntil: "load"});
    try {
      //element = await page.$$eval('aria/Next', (els) => els.map(el =>
      //el.textContent));
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
      element = await waitForSelector(['aria/Next'], page, { timeout, visible: true });
      await scrollIntoViewIfNeeded(element, timeout);
      console.log("found page 2");
      await element.click();
    } catch (err){
      console.log(err);
    }
    if (element) {

    } else {
      console.log("not found page 2 wtf!!!!");
    }
  } else {
    await page.click(SEARCHBAR_SELECTOR);
    await page.keyboard.type(company);
    await page.keyboard.press('Enter');
    {
      element = await waitForSelectors([["aria/People[role=\"button\"]"], ["#search-reusables__filters-bar > ul > li:nth-child(1) > button"]], targetPage, { timeout, visible: true });
      await scrollIntoViewIfNeeded(element, timeout);
      await element.click({ offset: { x: 34.79999542236328, y: 18 } });
    }
  }


  await page.waitForTimeout(timeout);
  //page.click('aria/Next[role="button"]');
 /*  {
    const NEXT_SELECTOR = "aria/Next[role=\"button\"]";
    const targetPage = page;
    while (true) {
      try {
        //await page.repl();
        for (const frame of page.frames()) {
          try {
            const element = await frame.waitForSelector(NEXT_SELECTOR);
            if (element) {
              console.log('found!');
              element.click();
              break;
            } else {
              console.log(frame + "not found");
            }
          } catch {
          }
        }
      } catch (err) {
        console.log(err);
        break;
      }
      console.log('clicked');
      await element.click();
    }
  } */

}

async function scrap(opts) {
  const url = 'https://linkedin.com';
  const timeout = 10000;
  const { browser, page } = await startBrowser({ headless: false });
  page.setDefaultTimeout(timeout);
  await page.goto(url);
  await auth({page: page, username: opts.username, password: opts.password, cookie: opts.cookie});
  await searchEmployeesFromCompany({page: page, company: opts.search, timeout: timeout, url: opts.url});
  await page.waitForTimeout(5000);
  await closeBrowser(browser);
}

(async () => {
  await scrap(program.opts());
})();


// // puppeteer usage as normal
// puppeteer.launch({ headless: true }).then(async browser => {
//   console.log('Running tests..')
//   const page = await browser.newPage()
//   await page.goto('https://bot.sannysoft.com')
//   await page.waitForTimeout(5000)
//   await page.screenshot({ path: 'testresult.png', fullPage: true })
//   await browser.close()
//   console.log(`All done, check the screenshot. ✨`)
// })

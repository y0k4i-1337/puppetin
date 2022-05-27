// puppeteer-extra is a drop-in replacement for puppeteer,
// it augments the installed puppeteer with plugin functionality
const puppeteer = require('puppeteer-extra')

// add stealth plugin and use defaults (all evasion techniques)
const StealthPlugin = require('puppeteer-extra-plugin-stealth')

puppeteer.use(StealthPlugin())

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

async function searchEmployeesFromCompany({page, company}) {
  const SEARCHBAR_SELECTOR = '.search-global-typeahead__input';
  const PEOPLE_SELECTOR = 'li.search-reusables__primary-filter:nth-child(1) > button:nth-child(1)';
  const CURRENTCOMPANY_SELECTOR = 'li.search-reusables__primary-filter:nth-child(5) > div:nth-child(1) > span:nth-child(2) > button:nth-child(1)';
  const FIRSTCURRENTCOMPANY_SELECTOR = 'html.theme.theme--mercado.artdeco body.render-mode-BIGPIPE.nav-v2.ember-application.boot-complete.icons-loaded div.application-outlet div.authentication-outlet div.scaffold-layout.scaffold-layout--breakpoint-xl.scaffold-layout--main-aside.scaffold-layout--reflow.search__srp--has-right-rail-top-offset section.scaffold-layout-toolbar div.scaffold-layout-toolbar__content.scaffold-layout-container.scaffold-layout-container--reflow nav div#search-reusables__filters-bar.search-reusables__filters-bar-grouping ul.search-reusables__filter-list li.search-reusables__primary-filter div#ember74.search-reusables__filter-trigger-and-dropdown div#hoverable-outlet-current-company-filter-value div.artdeco-hoverable-content.artdeco-hoverable-content--visible.reusable-search-filters-trigger-dropdown__content.artdeco-hoverable-content--inverse-theme.artdeco-hoverable-content--default-spacing.artdeco-hoverable-content--bottom-placement div.artdeco-hoverable-content__shell div.artdeco-hoverable-content__content form fieldset.reusable-search-filters-trigger-dropdown__container div.pl4.pr6 ul.list-style-none.relative.search-reusables__collection-values-container.search-reusables__collection-values-container--50vh li.search-reusables__collection-values-item input.search-reusables__select-input';

  await page.click(SEARCHBAR_SELECTOR);
  await page.keyboard.type(company);
  await page.keyboard.press('Enter');
  // await page.click(PEOPLE_SELECTOR);
  // await page.click(CURRENTCOMPANY_SELECTOR);
  // await page.click(FIRSTCURRENTCOMPANY_SELECTOR);

}

async function scrap(opts) {
  const url = 'https://linkedin.com';
  const {browser, page} = await startBrowser({headless: false});
  await page.goto(url);
  await auth({page: page, username: opts.username, password: opts.password, cookie: opts.cookie});
  await searchEmployeesFromCompany({page: page, company: opts.search});
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

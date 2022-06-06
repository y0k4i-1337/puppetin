// puppeteer-extra is a drop-in replacement for puppeteer,
// it augments the installed puppeteer with plugin functionality
const puppeteer = require('puppeteer-extra')

// add stealth plugin and use defaults (all evasion techniques)
const StealthPlugin = require('puppeteer-extra-plugin-stealth')

puppeteer.use(StealthPlugin())
// puppeteer.use(require('puppeteer-extra-plugin-repl')())

const { Command } = require('commander');
const program = new Command();

const { parse } = require('json2csv');
const fs = require('fs');

String.prototype.removeDiacritics = function () {
    var diacritics = [
        [/[\300-\306]/g, 'A'],
        [/[\340-\346]/g, 'a'],
        [/[\310-\313]/g, 'E'],
        [/[\350-\353]/g, 'e'],
        [/[\314-\317]/g, 'I'],
        [/[\354-\357]/g, 'i'],
        [/[\322-\330]/g, 'O'],
        [/[\362-\370]/g, 'o'],
        [/[\331-\334]/g, 'U'],
        [/[\371-\374]/g, 'u'],
        [/[\321]/g, 'N'],
        [/[\361]/g, 'n'],
        [/[\307]/g, 'C'],
        [/[\347]/g, 'c'],
    ];
    var s = this;
    for (var i = 0; i < diacritics.length; i++) {
        s = s.replace(diacritics[i][0], diacritics[i][1]);
    }
    return s;
}

function normalize(s) {
    return s.removeDiacritics();
}

program
.name('puppetin')
.description('Scrap LinkedIn profiles')
.version('0.1.1');

program
//.option('-l, --login <string>', 'username used to authenticate')
//.option('-p, --password <string>', 'password used to authenticate')
.option('-c, --cookie <string>', 'provide li_at cookie instead of credentials')
.option('-u, --url <string>', 'Custom URL from where to start scraping')
.option('-m, --maxpages <int>', 'Maximum number of pages to scrap. If 0, scrap all available pages', 0)
.option('-x, --proxy <host:port>', 'Send requests through proxy')
.option('-t, --timeout <milliseconds>', 'Set global timeout', 30000)
.option('-v, --verbose', 'Show detailed information', false)
.option('-f, --format <string>', 'Output format (json, csv)', 'json')
.option('-o, --output <string>', 'Output file')
.option('-E, --exclude <identifier...>', 'Exclude entries based on identifier')
.option('--headful', 'Launch browser in headful mode', false)
.option('--slowMo <milliseconds>', 'Slows down Puppeteer operations by the specified amount of time')
.option('--debug', 'Show debug information')
.option('-s, --search <string>', 'Search string')
.requiredOption('-d, --domain <string>', 'Company domain')
.requiredOption('-P, --patterns <strings...>', 'Patterns to generate emails with');

program.parse();

// global variable to store results
const PARSED_PROFILES = new Map();
const verbose = program.opts().verbose;
const debug = program.opts().debug ? true : false;

async function startBrowser(options = { headless: true, slowMo: 0 }, proxy) {
    const args = [];
    if (proxy) {
        args.push(`--proxy-server=${proxy}`);
    }
    options.args = args;
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    return { browser, page };
}

async function closeBrowser(browser) {
    return browser.close();
}

// Output results
function output(profiles, format, file) {
    if (format === 'csv') {
        try {
            const csv = parse(profiles);
            if (file) {
                fs.writeFileSync(`${file}`, csv, 'utf-8');
            } else {
                console.log(csv);
            }
        } catch(err) {
            console.error(err);
        }
    } else {
        if (file) {
            fs.writeFileSync(`${file}`, JSON.stringify(profiles, null, 2), 'utf-8');
        } else {
            console.log(JSON.stringify(profiles, null, 2));
        }
    }
}

/*
Provide either username and password pair or cookie
*/
async function auth({ page, username, password, cookie }) {
    if (cookie) {
        await page.setCookie({ name: 'li_at', value: cookie });
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

// Infer a person's email based on name, surname/middlenames and pattern
async function inferEmails(name, otherNames, domain, patterns) {
    if (!name) {
        throw new Error(`Value error: name`);
    }
    if (!otherNames) {
        throw new Error(`Value error: otherNames`);
    }
    // TODO: make this work
    // assert(domain != undefined);
    // assert(patterns != undefined);
    // assert(Array.isArray(otherNames));
    // assert(Array.isArray(patterns));
    const sup_patterns = ['first', 'last', 'first.last', 'flast'];

    let usernames = [];
    otherNames = otherNames.map((s) => s.replace(/\.+$/, '')).filter((s) => s.length > 0);
    for (pattern of patterns) {
        switch (pattern) {
            case 'first':
            usernames.push(name);
            break;
            case 'last':
            usernames.push(...otherNames);
            break;
            case 'first.last':
            usernames.push(...otherNames.map((other) => `${name}.${other}`));
            break;
            case 'flast':
            usernames.push(...otherNames.map((other) => `${name[0]}${other}`));
            break;
            default:
            console.warn(`Skipping unsupported pattern ${pattern}`);
        }
    }
    usernames = usernames.map((s) => normalize(s));
    return usernames.map((s) => `${s}@${domain}`).join("|");
}

function capitalizeFirstLetter(string) {
    if (!string || string.length === 0) {
        return string;
    }
    return string[0].toUpperCase() + string.slice(1).toLowerCase();
}

function titleCase(string) {
    if (!string || string.length === 0) {
        return string;
    }
    return string.split(" ").map(x => capitalizeFirstLetter(x)).join(" ");
}

function getProfileTypes() {
    const profile_types = new Map([
        ["voyager_miniprofile", "com.linkedin.voyager.identity.shared.MiniProfile"],
        ["voyager_profile", "com.linkedin.voyager.dash.identity.profile.Profile"],
        ["voyager_entityresult", "com.linkedin.voyager.dash.search.EntityResultViewModel"]
    ]);
    return profile_types;
}

// The following types have no interesting information
function getExcludedProfileTypes() {
    const excluded_ptypes = [
        "com.linkedin.voyager.dash.search.LazyLoadedActions",
        "com.linkedin.voyager.dash.search.FeedbackCard",
    ];
    return excluded_ptypes;
}

// Parse LinkedIn profile as found in JSON responses into an containing only properties of interest
async function parseProfile(entry, ptype, domain, patterns, exclude) {
    if (!entry) {
        throw new Error('invalid entry');
    }
    const profile_types = getProfileTypes();
    const excluded_types = getExcludedProfileTypes();

    if (excluded_types.includes(ptype)) {
        return null;
    }
    if (!Array.from(profile_types.values()).includes(ptype)) {
        throw new Error(`Unsupported profile type ${ptype}`);
    }
    let fullName;
    // com.linkedin.voyager.dash.search.EntityResultViewModel
    if (ptype === profile_types.get('voyager_entityresult')) {
        fullName = entry.title.text;
        if (!fullName) {
            throw new Error(`Full name not found for ${ptype}`);
        }
    } else {
        // if names not found, this is probably an invalid entry
        if (!entry.firstName && !entry.lastName) {
            throw new Error(`Full name not found for ${ptype}`);
        }
        fullName = entry.firstName + ' ' + entry.lastName;  
    }
    // use regex to avoid garbage like (...) or [..] at the end of name
    // it won't work if name starts with something else
    const regex = /^[^\[\]{}()\\'",\-|]+/;
    const test = fullName;
    fullName = test.match(regex);
    if (fullName === undefined || fullName === null) {
        if (debug) console.warn(`Could not parse full name from ${entry.firstName} ${entry.lastName}`);
        throw new Error("Unable to parse full name");
    }
    fullName = fullName[0].toLowerCase();

    // ignore anonymous linkedin member
    if (fullName === 'linkedin member') {
        throw new Error('Anonymous Linkedin Member');
    }
    // remove unwanted characters
    fullName = fullName.replace(/\._!,;/g, '');
    fullName = fullName.replace(/ +/g, ' ');
    name_fields = fullName.split(' ');
    name_fields = name_fields.filter((s) => (s !== '' && s !== ' '));
    if (name_fields.length < 1) {
        throw new Error('Parsed full name is too short');
    }

    person = {};
    person.fullName = titleCase(fullName);
    person.firstName = titleCase(name_fields[0]);
    person.lastName = titleCase(name_fields.at(name_fields.length - 1));

    otherNames = name_fields.slice(1);
    // remove some elements
    filter_words = ['da', 'de', 'di', 'do', 'das', 'dos'];
    otherNames = otherNames.filter((s) => !filter_words.includes(s));
    // also, remove single letter names
    otherNames = otherNames.filter((s) => s.length > 1);

    person.publicIdentifier = entry.publicIdentifier ? entry.publicIdentifier : `autogen:${fullName.toLowerCase()}`;
    if (entry.publicIdentifier) {
        person.publicIdentifier = entry.publicIdentifier;
    } else if (entry.navigationUrl) {
        m = entry.navigationUrl.match(/www.linkedin.com\/in\/(?<identifier>.+)\?/);
        if (m) {
            person.publicIdentifier = m.groups.identifier;
        }
    }
    if (!person.publicIdentifier || person.publicIdentifier === '') {
        person.publicIdentifier = `autogen:${fullName.toLowerCase().replace(/ /g, '-')}`;
    }

    // skip manually excluded profiles
    if (exclude && exclude.includes(person.publicIdentifier)) {
        return null;
    }

    if (ptype === profile_types.get('voyager_miniprofile')) {
        person.occupation = entry.occupation ? entry.occupation.replace("\n", ". ") : '';
    } else if (ptype === profile_types.get('voyager_profile')) {
        person.occupation = entry.headline ? entry.headline.replace("\n", ". ") : '';
    } else if (ptype === profile_types.get('voyager_entityresult')) {
        if (entry.summary && entry.summary.text) {
            person.occupation = entry.summary.text;
        } else if (entry.primarySubtitle && entry.primarySubtitle.text) {
            person.occupation = entry.primarySubtitle.text;
        } else {
            person.occupation = '';
        }
        // Example: "Current: system analyst at Company"
        if (person.occupation.startsWith("Current: ")) {
            person.occupation = person.occupation.split(' ').slice(1).join(' ');
        }
    }
    if (verbose) console.log(JSON.stringify(person));

    try {
        person.email = await inferEmails(name_fields[0], otherNames, domain, patterns);
    } catch (err) {
        if (verbose) console.warn(`Unable to infer email from ${name_fields.join(' ')}`);
        person.email = '';
    }
    return person;
}

async function parseResponse(response, opts) {
    const domain = opts.domain;
    const patterns = opts.patterns;
    const exclude = opts.exclude;
    const profile_types = getProfileTypes();
    const excluded_types = getExcludedProfileTypes();
    let person;
    const result = new Map();
    if (!response.included) {
        if (verbose) console.log('Object "included" not found in response');
        return null;
    }
    for (const entry of response.included) {
        if (!entry.$type) {
            if (verbose) console.log('Object "$type" not found in response');
            continue;
        }
        if (excluded_types.includes(entry.$type)) {
            continue;
        }
        if (!Array.from(profile_types.values()).includes(entry.$type)) {
            if (verbose) console.log(`$type ${entry.$type} not supported`);
            if (debug) console.log(JSON.stringify(entry));
            continue;
        } else {
            if (verbose) console.log(`Found supported $type ${entry.$type}`);
            if (debug) console.log(JSON.stringify(entry));
        }
        // get profile information
        try {
            person = await parseProfile(entry, entry.$type, domain, patterns, exclude);
            if (person && person != null) {
                result.set(person.publicIdentifier, person);
            }
        } catch (err) {
            if (verbose) console.warn(err);
            continue;
        }
    }
    return result;
}

async function setupInterceptions({ page, fn, fn_opts } = {}) {
    if (page === undefined) {
        throw new Error('page undefined');
    }
    page.on('response', async (response) => {
        const request = response.request();
        //if (request.url().includes('/voyager/api/search') ||
        //request.url().includes('/voyager/api/voyagerSearchDashLazyLoadedActions'))
        //{
        if (request.url().includes('/voyager/api/search')) {
            try {
                const data = await response.json();
                if (fn) {
                    if (debug) console.log(request.url());
                    const res = await fn(data, fn_opts);
                    res.forEach((value, key) => PARSED_PROFILES.set(key, value));
                    console.info(`Parsed ${PARSED_PROFILES.size} profiles`);
                    // the following snippet is only for debugging
                } else {
                    console.log(request.url());
                    console.log(JSON.stringify(data, null, 2));
                }
            } catch (err) {
                console.error(err);
            }
        }
    })
}

async function searchEmployeesFromCompany({ page, company, timeout, url, maxpages, opts }) {
    const SEARCHBAR_SELECTOR = '.search-global-typeahead__input';
    const PEOPLE_SELECTOR = 'aria/People[role="pushbutton"]';
    const CURRENTCOMPANY_SELECTOR = 'li.search-reusables__primary-filter:nth-child(5) > div:nth-child(1) > span:nth-child(2) > button:nth-child(1)';
    const FIRSTCURRENTCOMPANY_SELECTOR = '';
    const NEXT_SELECTOR = 'aria/Next[role="button"]';
    const PREVIOUS_SELECTOR = 'aria/Previous[role="button"]';
    let element;
    if (url) {
        await page.goto(url, { waitUntil: "load" });
        // have to do this to trigger api endpoint requests
        await page.evaluate(() => new Promise((resolve) => {
            let scrollTop = -1;
            const interval = setInterval(() => {
                window.scrollBy(0, 100);
                if (document.documentElement.scrollTop !== scrollTop) {
                    scrollTop = document.documentElement.scrollTop;
                    return;
                }
                clearInterval(interval);
                resolve();
            }, 10);
        }));
        element = await waitForSelector([NEXT_SELECTOR], page, { timeout , visible: true});
        //await scrollIntoViewIfNeeded(element, timeout);
        await element.click();
        try {
            await page.waitForNavigation({ timeout: timeout, waitUntil: "domcontentloaded" });
        } catch (err) {

        }
        // now we can intercept
        await setupInterceptions({ page: page, fn: parseResponse, fn_opts: { domain: opts.domain, patterns: opts.patterns, exclude: opts.exclude } });

        // go back to previous page
        await page.evaluate(() => new Promise((resolve) => {
            let scrollTop = -1;
            const interval = setInterval(() => {
                window.scrollBy(0, 100);
                if (document.documentElement.scrollTop !== scrollTop) {
                    scrollTop = document.documentElement.scrollTop;
                    return;
                }
                clearInterval(interval);
                resolve();
            }, 10);
        }));
        element = await waitForSelector([PREVIOUS_SELECTOR], page, { timeout, visible: true });
        //await scrollIntoViewIfNeeded(element, timeout);
        await element.click();
    } else {
        await page.click(SEARCHBAR_SELECTOR);
        await page.keyboard.type(company);
        await page.keyboard.press('Enter');
        {
            element = await waitForSelectors([["aria/People[role=\"button\"]"], ["#search-reusables__filters-bar > ul > li:nth-child(1) > button"]], page, { timeout, visible: true });
            await scrollIntoViewIfNeeded(element, timeout);
            await element.click({ offset: { x: 34.79999542236328, y: 18 } });
        }
    }

    // scrap all available pages
    let parsed = 1;
    let nerror = 0;
    const always = (maxpages < 1) ? true : false;
    while (always || parsed < maxpages) {
        try {
            await page.evaluate(() => new Promise((resolve) => {
                let scrollTop = -1;
                const interval = setInterval(() => {
                    window.scrollBy(0, 100);
                    if (document.documentElement.scrollTop !== scrollTop) {
                        scrollTop = document.documentElement.scrollTop;
                        return;
                    }
                    clearInterval(interval);
                    resolve();
                }, 10);
            }));
            element = await waitForSelector([NEXT_SELECTOR], page, { timeout, visible: true });
            await scrollIntoViewIfNeeded(element, timeout);
            await element.click();
            try {
                await page.waitForNavigation({ timeout: timeout, waitUntil: "load" });
            } catch (err) {
                nerror++;
                if (nerror == 3) {
                    throw err;
                }
            }
        } catch (err) {
            break;
        }
        parsed++;
    }
}

async function scrap(opts) {
    const url = 'https://linkedin.com';
    const timeout = opts.timeout;
    const { browser, page } = await startBrowser({ headless: !opts.headful, slowMo: opts.slowMo }, opts.proxy);
    page.setDefaultTimeout(timeout);
    await page.goto(url);
    await auth({ page: page, username: opts.username, password: opts.password, cookie: opts.cookie });
    await searchEmployeesFromCompany({ page: page, company: opts.search, timeout: timeout, url: opts.url, maxpages: opts.maxpages, opts: { domain: opts.domain, patterns: opts.patterns, exclude: opts.exclude } });
    await page.waitForTimeout(1500);
    await closeBrowser(browser);
}

////////////////////////////////
// MAIN PROGRAM
////////////////////////////////
if (debug) { console.log(program.opts()); }
if (!program.opts().url && !program.opts().search) {
    console.error('Error: Either URL or search term should be provided');
    process.exit(1);
}
(async () => {
    await scrap(program.opts());
    output(Array.from(PARSED_PROFILES.values()), program.opts().format, program.opts().output);
})();

# PuppetIn
Scrap LinkedIn profiles for fun and profit.

## Introduction
This is a simple LinkedIn scrapper based on [puppeteer](https://pptr.dev/).
The main objective is that, given a company, it will search for its employees
and grab information like name and occupation. Based on the user choice, it
will then infer their e-mails using simplistic heuristics.

## Getting Started

Clone the repository
```
git clone https://github.com/yok4i/puppetin.git
```

Enter directory
```
cd puppetin
```

Install dependencies with [yarn](https://yarnpkg.com/)
```
yarn install
```

## Help

```
node puppetin.js -h
Usage: puppetin [options]

Scrap LinkedIn profiles

Options:
  -V, --version                  output the version number
  -c, --cookie <string>          provide li_at cookie instead of credentials
  -u, --url <string>             Custom URL from where to start scraping
  -m, --maxpages <int>           Maximum number of pages to scrap. If 0, scrap all available pages (default:
                                 0)
  -x, --proxy <host:port>        Send requests through proxy
  -t, --timeout <milliseconds>   Set global timeout (default: 30000)
  -v, --verbose                  Show detailed information (default: false)
  -f, --format <string>          Output format (json, csv) (default: "json")
  -o, --output <string>          Output file
  -E, --exclude <identifier...>  Exclude entries based on identifier
  --headful                      Launch browser in headful mode (default: false)
  --slowMo <milliseconds>        Slows down Puppeteer operations by the specified amount of time
  --debug                        Show debug information
  -s, --search <string>          Search string
  -d, --domain <string>          Company domain
  -P, --patterns <strings...>    Patterns to generate emails with
  -h, --help                     display help for command
```

### Supported profile types
These are the currently supported profile types for parsing:

  - com.linkedin.voyager.identity.shared.MiniProfile
  - com.linkedin.voyager.dash.identity.profile.Profile
  - com.linkedin.voyager.dash.search.EntityResultViewModel

### Patterns
You can choose one or more from the following list of patterns to infer
e-mails:

  - first (use only name)
  - last (use only surname)
  - first.last (name.surname)
  - flast (name first char followed by surname)


## Examples

Scrap current employees from Contoso in headful mode, use `first.last` as e-mail pattern, show
as many information as possible, slow down operations by 250ms, exclude my
public identifier (myuser) from results and save output as JSON.
```
node puppetin.js -d contoso.com -P first.last -u 'https://www.linkedin.com/search/results/people/?currentCompany=%5B%2211452158%22%5D&keywords=contoso&origin=FACETED_SEARCH&sid=5q5' -c AQ... --slowMo 250 -v -E myuser -debug --headful -o results.json
```

## License

This project is licensed under MIT license. See [LICENSE](LICENSE) for more
information.

## Disclaimer

For educational purposes only. Please note that running bots on LinkedIn may be
against its terms of service. Use it at your own discretion.

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

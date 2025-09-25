# Git Server

A lightweight Git server implementation using [isomorphic-git](https://github.com/isomorphic-git/isomorphic-git) designed for Acode app

## Features

- 🚀 Full Git operations support (clone, push, pull, fetch, commit, etc.)
- 📱 Optimized for mobile environments (Termux, Acode)

## Installation

#### npm

```bash
npm install -g @dikidjatar/git-server
```

#### Or Github

```bash
# Clone the repository
git clone https://github.com/dikidjatar/git-server.git

# Install dependencies
yarn install

# Start server
yarn start
```

### Command Line Usage

```bash
# Start server on default port (3080)
git-server

# Start on custom port and host
git-server --port 8080 --host 0.0.0.0

# Using short flags
git-server -p 8080 -h localhost
```

## API Documentation & Usage
See [https://isomorphic-git.org/](https://isomorphic-git.org/)

#### Check if directory is a Git repository

```bash
GET /git/status?dir=/path/to/repo
```

## Support

- 📋 [Issues](https://github.com/dikidjatar/git-server/issues)
- 📧 Email: dikidjatar@gamil.com

## Acknowledgments

- [isomorphic-git](https://github.com/isomorphic-git/isomorphic-git) - Git implementation in JavaScript
- [Express.js](https://expressjs.com/) - Web framework
- [Winston](https://github.com/winstonjs/winston) - Logging library
# Getting Started

Start here if you want to turn one deployment or infrastructure script into a
GitHub Action without putting shell in YAML.

| Page                            | What it covers                                               |
| ------------------------------- | ------------------------------------------------------------ |
| [Quick Start](quickstart.md)    | Write one script, run it locally, and generate action files. |
| [Installation](installation.md) | Current workspace setup and package install shape.           |

The important idea is small: a Hollywood script is just a typed value. Local
tests call that value through `runAction`. GitHub calls the same value through a
generated entrypoint that uses `runGitHubAction`.

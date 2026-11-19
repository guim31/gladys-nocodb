# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-11-19

### Added

- NocoDB tables in Gladys (self-hosted NocoDB or NocoDB Cloud, API token): one
  device per table followed, with its number of rows, or the rows of one of its
  views, and optionally a field of the first row of the view.
- "Test the connection", "Follow a table" and "Stop following a table" in the
  configuration.
- Scene triggers "New NocoDB row" and "NocoDB rows above a threshold".
- Scene actions "Add a NocoDB row" and "Update a NocoDB row", with the values
  in JSON or as `Field=value` pairs, and scene variables.
- Dashboard widget "NocoDB tables", with a Refresh button that can be hidden.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-nocodb/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-nocodb/releases/tag/v1.0.0

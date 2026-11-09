# Changelog

All notable changes to Wegolite are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A system information card when hovering a marker on the F6 galactic chart,
  including the planet description and distance from the current system.
- Mouse-wheel zoom and drag-to-pan on the F6 chart.
- A clickable, F-key-ordered station tab strip with an Interfaces screen.

### Changed

- The F6 chart and F2 Save/Load headers show the live credit balance instead of
  a static key label.

### Removed

- The redundant F7 system-data screen. The F6 hover card now carries the same
  fields and planet description.

### Fixed

- The F6 hover card now places its description and distance beside the pointer
  without clipping at the overlay edges.

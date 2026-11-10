# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned

- Real `VisaScpiAdapter` / `ModbusTcpAdapter` / `HttpAdapter` implementations
- LLM-backed planner over OpenTAP MCP, with the same workflow JSON contract
- User permissions, audit log, results database and immutable published revisions
- Command timeouts, busy-instrument handling, retries and reconnect recovery
- Native PDF / Excel report generation and multi-run trend charts

## [0.1.0] - 2026-11-10

Initial open-source release. This is a reference prototype, not a production test executive.

### Added

- **Zero-dependency browser workbench** — open `index.html` directly, no build step or CDN.
- **Pluggable driver layer** (`src/drivers.js`) with a command allowlist: 4 simulated SCPI
  instruments (power supply, oscilloscope, electronic load, DMM) and 2 placeholder drivers
  (Modbus TCP, HTTP). The model may only reference capability names, never command strings.
- **Natural-language planner** (`src/planner.js`) parsing Chinese and English test intents into a
  structured workflow JSON, including voltage ranges, step sizes, overshoot limits, load currents
  and channels; device/capability/limit-provenance validation before execution.
- **Execution engine** (`src/engine.js`) with loops and sweeps, a live event stream, locked-limit
  PASS/FAIL checks, deterministic simulated measurements and a run record that is the sole source
  of every reported number.
- **Reporting** (`src/report.js`): CSV, Markdown and measured-waveform SVG, rendered exclusively
  from run results.
- **Editable workflow canvas**: parameter editing, reorder, delete, add step by device/capability,
  `Rev A/B/C` revisions.
- **Run history** with reload and one-click rerun, persisted in localStorage.
- **Chinese / English UI** (`src/i18n.js`): interface, instrument names, canvas, logs, exported
  reports, help pages and browser title all follow the language switch. Workflow JSON field names
  stay Chinese as a stable data contract.
- **Dark / light themes**: 47 light-theme overrides, theme-aware waveform colors, persisted
  preference and a `<head>` bootstrap script that prevents a flash on reload.
- **Open-source scaffolding**: Apache-2.0 license and NOTICE, bilingual READMEs, architecture /
  user / development / roadmap docs, contributing guide, code of conduct, security policy,
  issue and PR templates, GitHub Actions CI on Node 18/20/22, a zero-dependency static verifier,
  a local dev server and 13 end-to-end smoke checks.

### Known limitations

- Simulated instruments only; no real VISA / Modbus / HTTP communication.
- No user permissions, audit log, results database or multi-station sync.
- No DAQ cards, hard real-time HIL, timeouts, retries or reconnect recovery.
- The planner is deterministic rule parsing, not a large language model.

[Unreleased]: https://github.com/lizhuanshu/testflow-studio/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/lizhuanshu/testflow-studio/releases/tag/v0.1.0

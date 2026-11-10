# NOTICE

TestFlow Studio is an independent, from-scratch implementation written by the contributors of this repository.
It is licensed under the Apache License, Version 2.0 (see [LICENSE](LICENSE)).

## Relationship to TestFlow (testflowinc.com)

The **product shape** of this project was inspired by the publicly described product at
<https://testflowinc.com/>: a bench-oriented AI agent that turns a test description into a
workflow, runs it on real instruments, and writes a report from measured results.

For the avoidance of doubt:

- This repository contains **no source code, assets, documentation text, data, or credentials**
  from TestFlow Inc. Every file here was written independently for this project.
- This project is **not affiliated with, endorsed by, sponsored by, or connected to** TestFlow Inc.
- "TestFlow" and any related names, logos, and marks are the property of their respective owners.
  The name "TestFlow Studio" is used descriptively for this prototype and will be changed if a
  rights holder requests it.
- Instrument vendor names (Keysight, Tektronix, Chroma, Keithley, etc.) and model numbers appear
  only as illustrative labels for simulated drivers. They are trademarks of their respective
  owners; no endorsement is implied.

## Third-party components

- **No third-party runtime libraries are bundled.** The browser prototype has zero dependencies.
- **OpenTAP** (<https://opentap.io>, MPL-2.0) is discussed in the documentation as a recommended
  production integration. No OpenTAP source code, binaries, or packages are included here.
- **SCPI command examples** (`VOLT`, `OUTP ON`, `SYST:ERR?`, etc.) are standard programming-manual
  conventions used for illustration inside simulated drivers only.
- **shields.io badges** and **GitHub Actions** referenced in the README are external services used
  for display and CI; they are not redistributed with this project.

If you believe any content here infringes your rights, please open an issue or contact the
maintainer privately; we will review and remove it promptly.

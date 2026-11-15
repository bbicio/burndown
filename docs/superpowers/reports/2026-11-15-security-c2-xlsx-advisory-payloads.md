# Advisory payloads — measurement on xlsx 0.18.5 (security cycle 2, S-02)

Criterion 4 of the spec could not be met as written: no payload was shown to hurt `0.18.5`.

- **Source.** GHSA-4r6h-8v6p-xvw6 and GHSA-5pgg-2g8v-p4x9 (and the vendor pages `cdn.sheetjs.com/advisories/CVE-2023-30533`, `CVE-2024-22363`) state the affected versions and nothing about the trigger: no field, parser, regex or proof of concept.
- **Method.** The `0.18.5` and `0.20.3` sources were diffed and payloads built from the changed code paths: a workbook whose only sheet is named `__proto__`; a shared string of `x`, 20,000 and 100,000 spaces and `y` (the pattern of the fixed trailing-whitespace `replace`); MIME header lines of the MHT reader (the changed `^(.*?):\s*([^\s].*)$`), with long runs of spaces and colons.
- **Result on 0.18.5.** The `__proto__` sheet left `Object.prototype` without enumerable keys; the whitespace shared string read in about 40 ms (0.20.3: about 50 ms); the MIME shapes read in under 10 ms.
- **Consequence.** `api/src/lib/xlsx-advisories.test.js` keeps the four checks of the plan on `0.20.3` as regression tests with the best-effort payloads; it does not prove the original exploits. The real protection for the MHT reader is the signature gate (`xlsx-file.js`): a non-ZIP never reaches `XLSX.read`.

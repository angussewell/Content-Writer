Run `npm run test:retention` with Node 24 or later (native TypeScript stripping).
No database connection is required.

The tests cover passage endpoints, one-second interpolation, invalid and missing
samples, relative rather than absolute loss, deterministic cohort eligibility,
ending alignment, sparse coverage, rounding sensitivity, early-data verdicts and
worst-passage selection.

`fixtures/tiktok-4087.json` contains source observations captured on 2026-09-14:
the target's own 33 segments and curve, and its 20 eligible preceding videos.
It fixes the expected 1–2s example at 13 observed points versus 13.6547619 usual
points. Live fetches can change those values; the test intentionally uses the
captured observations, never a changing production median. This fixture is a
regression example, not validation that the provisional cohort settings are optimal.

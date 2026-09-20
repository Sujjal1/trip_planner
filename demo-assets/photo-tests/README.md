# Synthetic photo-reading demo

These are AI-generated test images, not real driving or purchase records. Generated with the built-in image generation tool.

Expected readings:
- `odometer-154025.png`: odometer 154025 miles; fuel gauge approximately 50%.
- `receipt-36-50.png`: 10 US gallons; total USD 36.50; USD 3.650 per gallon.

Prompts:

Odometer: A realistic close-up photo of a generic parked car instrument cluster for an OCR software demo. Digital odometer reads exactly "154025 mi" with label "ODO". Speedometer needle at zero mph, fuel gauge exactly half full labeled E and F. Sharp legible odometer, natural slight reflections, no car brand. Add a clearly visible separate label at top "DEMO IMAGE — NOT A REAL VEHICLE". Landscape composition. Only one odometer reading; do not add trip mileage or other digital numbers.

Receipt: A realistic photo of a fictional fuel receipt on a dark table, for OCR software testing. Receipt straight and legible, light paper texture and minor natural folds. Exact printed text: "DEMO RECEIPT — NOT VALID FOR PAYMENT", "CODRIVE TEST FUEL", "UNLEADED", "10.000 US GAL", "PRICE/GAL USD 3.650", "TOTAL USD 36.50", "PAID USD 36.50", "TEST DATA ONLY". No other prices, no credit card or personal details, no actual merchant logo. Entire receipt visible, high contrast text.

## Live test result — 2026-09-16 UTC

Both PNGs were uploaded through the website's Scan a photo dialog with consent to Gemini. Both displayed a provider error rather than a reading. No trips or expenses were saved.

A direct request using the same configured `gemini-2.5-flash` and the odometer image timed out after 60.2 seconds. A second diagnostic with thinking disabled and a 512-token output cap also timed out after 60.3 seconds; this setting was not adopted in the app. A read-only model-list request succeeded (HTTP 200, 0.3 seconds), and the configured model appeared in that list. This confirms model-list access, not successful image generation or available inference quota. The underlying reason for slow generation remains unresolved.

The backend now distinguishes provider timeouts, quota/rate limits, access rejection, unavailable model, connection errors, and invalid output. All 16 backend tests pass; mocked error-handling tests do not constitute successful live OCR.

## Follow-up

The user subsequently reported successful odometer reading. A direct retry of the demo receipt returned HTTP 200 in 4.3 seconds with `receipt_total=36.50`, `gallons=10.000`, and null odometer/fuel percentage. This shows the receipt is readable; earlier failures were intermittent. Website confirmation is checked separately from direct API success.

The subsequent live website receipt retry succeeded: the scanner opened the expense form with Description `Fuel receipt`, Amount paid `36.5`, and Category `Fuel purchase`. The dialog was closed without saving, and the existing balance remained unchanged. Both reported odometer success and observed receipt success coexist with the earlier intermittent provider failures; reliability is not guaranteed by one successful retry.

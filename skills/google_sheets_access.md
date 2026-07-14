# Google Sheets/Spreadsheets Access

Google Sheets renders data on a canvas, making DOM parsing impossible. Here's how to work with it:

## DO NOT
- ❌ DO NOT use `evaluate_js` with `SpreadsheetApp` - it's not defined in the browser
- ❌ DO NOT try to read cell values via DOM - they're rendered as canvas
- ❌ DO NOT use CSS selectors on canvas elements - they don't exist
- ❌ DO NOT try `getDOMSnapshot()` - returns empty for canvas

## HOW TO ACCESS DATA

### Method 1: Export as CSV (RECOMMENDED)
Instead of trying to read the DOM, export the sheet as CSV:
```
URL: {spreadsheet_url}/export?format=csv&gid={sheet_id}
```

Example:
```
https://docs.google.com/spreadsheets/d/1sHCSCb1iuHyjuqU25Mer3bvjN8znL4tzUtoQ_psY-mo/export?format=csv&gid=553288136
```

Then use `navigate()` to go to that URL - it will download the CSV as text content.

### Method 2: Use the gviz/tq Endpoint for CSV
For Google Sheets, add the `/gviz/tq` endpoint:
```
https://docs.google.com/spreadsheets/d/{spreadsheet_id}/gviz/tq?tqx=out:csv&sheet={sheet_name}
```

## NAVIGATION TIPS
- Use `scroll(direction: "down")` and `scroll(direction: "right")` to navigate the spreadsheet
- Use `zoom_region()` to inspect specific areas
- For opening files: double-click on the file name in the file list
- Use `press_key("ArrowRight")` / `press_key("ArrowDown")` for cell navigation

## FINDING SHEET ID
- Look at the URL: `.../spreadsheets/d/{spreadsheet_id}/edit#gid={sheet_id}`
- The number after `gid=` is the sheet ID
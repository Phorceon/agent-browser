# Ashby File Upload via Click Method

When `upload_file` with a CSS selector fails on Ashby forms (e.g. the `[name='_systemfield_resume']` selector does not resolve properly), use the click-based approach instead.

## Steps

1. **Locate the upload button** using a `find_mark` for the resume upload section (e.g. the visible "Upload File" text/button mark).
2. **Click the mark** via `interact_mark` to trigger the native file picker dialog.
3. **Handle the file input** by sending the file path to the OS file dialog that opens, or by using `upload_file` on the now-exposed hidden `<input type="file">` element.

## Why the CSS selector approach fails

Ashby renders the file input inside a shadow-like wrapper. The `[name='_systemfield_resume']` selector may not resolve to the correct element in all form states. Clicking the visible upload button mark bypasses this by triggering the browser's native file chooser.

## Tips

- If the form has multiple upload sections (resume, cover letter), disambiguate by matching the surrounding label text.
- After the upload, verify the file name appears in the UI before proceeding.

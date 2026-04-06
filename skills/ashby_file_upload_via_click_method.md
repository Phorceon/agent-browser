# Ashby File Upload via Click Method

When upload_file with CSS selector fails on Ashby forms, try clicking the "Upload File" button mark first to trigger the file picker dialog, or try using interact_mark to click the upload button and then handle the file input separately. The [name='_systemfield_resume'] selector may not resolve properly. Instead, click the Upload File button (mark) for the resume section, which opens a native file picker.

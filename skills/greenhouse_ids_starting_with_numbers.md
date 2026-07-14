# Greenhouse IDs starting with numbers

When Greenhouse form fields have IDs that start with numbers (like `id='4012804008'`), CSS selector `#4012804008'` is INVALID because CSS identifiers cannot start with a digit. Instead, use an attribute selector.

## Example

**Invalid:**
```css
#4012804008 { color: red; }
```

**Valid:**
```css
[id='4012804008'] { color: red; }
```

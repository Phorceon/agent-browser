# Greenhouse IDs starting with numbers

When Greenhouse form fields have IDs that start with numbers (like `id='4012804008'`), both CSS selectors and JavaScript `document.querySelector` calls with a simple `#4012804008` are INVALID because CSS identifiers cannot start with a digit. Instead, use an attribute selector.

## CSS Example

**Invalid:**
```css
#4012804008 { color: red; }
```

**Valid:**
```css
[id='4012804008'] { color: red; }
```

## JavaScript Example

**Invalid:**
```javascript
document.querySelector('#4012804008'); // throws SyntaxError
```

**Valid:**
```javascript
document.querySelector("[id='4012804008']"); // works
```

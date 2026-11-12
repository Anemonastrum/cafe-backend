export function csvCell(value){let text=value==null?'':String(value);if(/^[\s]*[=+@-]|^[\s]*[\t\r]/u.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}

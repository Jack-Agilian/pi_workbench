/** Local desktop plain-text write bound, unrelated to model/token/usage limits. */
export const CLIPBOARD_TEXT_BYTES = 8 * 1024 * 1024;
export function clipboardText(value:unknown):string {
  if(typeof value!=='string'||value.length>CLIPBOARD_TEXT_BYTES||new TextEncoder().encode(value).byteLength>CLIPBOARD_TEXT_BYTES)throw Error('clipboard_text_invalid');
  return value;
}

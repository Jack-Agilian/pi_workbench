# Third-party notices

## pi-gui

Source: https://github.com/minghinmatthewlam/pi-gui/tree/0b4cd334942ac01bfc6b3cba736a79984925d8cf

`apps/desktop/composer-key.ts` adapts the Enter / Shift+Enter / IME submit guard from `apps/desktop/src/features/conversation/hooks/use-session-composer.tsx`. Added keyCode 229 and repeat guards; removed steer/followUp and upstream application dependencies. Other desktop UI code is original. The full upstream Composer/timeline/driver were reviewed but not copied.

MIT License

Copyright (c) 2026 Matthew Lam

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

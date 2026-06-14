# TemplateX

TemplateX is an MVP browser extension for manager message templates. It opens a searchable template overlay in any editable field, replaces variables, and inserts plain text into `input`, `textarea`, and `contenteditable` editors.

## What Works

- Manifest V3 extension with content script on `<all_urls>`.
- Trigger text `//` and hotkey `Ctrl+Shift+Space`.
- Searchable in-page overlay with keyboard navigation.
- Plain-text insertion into active fields with input/change events for reactive apps.
- Variable replacement for custom variables and system variables: `{{today}}`, `{{tomorrow}}`, `{{time}}`, `{{manager_name}}`.
- Options page for profile, general settings, folders, templates, binds, import/export, and payment-link settings.
- Popup with template count, quick search, open-overlay action, and settings shortcut.
- Mock local auth and payment-link architecture for a future backend.

## Install

```powershell
npm install
```

The project has no runtime npm dependencies. The command is still useful because it creates a lockfile and validates the workspace.

## Build

```powershell
npm run build
```

The build copies the extension source into:

```text
extension/dist
```

## Load In The Browser

1. Run `npm run build`.
2. Open `chrome://extensions`, `browser://extensions`, or the equivalent page in Chrome, Edge, or Yandex Browser.
3. Enable developer mode.
4. Choose "Load unpacked".
5. Select `extension/dist`.

For development you can also load the `extension` folder directly.

## Usage

Put the cursor in a text field and type `//`, or press `Ctrl+Shift+Space`. Choose a template from the overlay with mouse, arrows, and Enter. If the template has variables, TemplateX asks for values before insertion.

The extension stores all data in `chrome.storage.local`. Templates are inserted as plain text; HTML from templates is not executed.

## Templates

Each template has:

- `title`
- `shortcut`
- `folderId`
- `body`
- `tags`

Variables use double braces:

```text
Здравствуйте, {{client_name}}!
К оплате: {{amount}} руб.
Ссылка: {{payment_link}}
```

Empty custom variables are replaced with an empty string.

## Import And Export

The options page exports JSON with:

- `version`
- `exportedAt`
- `settings`
- `folders`
- `templates`

Import supports replacing all data or merging folders/templates by id.

## Payments Backend

The MVP supports `manual`, `tbank`, `yookassa`, and `cloudpayments` providers at the settings level.

For real providers, TemplateX calls:

```text
POST {backendApiUrl}/api/payments/create-link
```

Production payment links must be created by a backend. Bank acquiring secrets must never be stored inside the extension.

## Current Limits

- Auth is local mock auth.
- Real payment providers require a backend.
- Complex editors vary by site; the adapter uses selection/range insertion, native value setters, input/change events, and clipboard fallback where direct insertion is blocked.

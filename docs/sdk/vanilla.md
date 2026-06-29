# Vanilla JS / CDN

Use VelumX MPC without any build tools — just a `<script>` tag.

## CDN Installation

```html
<script src="https://cdn.velumx.xyz/sdk/latest/velumx.iife.js"></script>
```

Or a versioned URL (recommended for production):

```html
<script
  src="https://cdn.velumx.xyz/sdk/0.1.0/velumx.iife.js"
  integrity="sha384-..."
  crossorigin="anonymous"
></script>
```

## Usage

The IIFE bundle exposes `window.VelumX` with all SDK classes and types.

```html
<!DOCTYPE html>
<html>
<head>
  <title>VelumX Vanilla Demo</title>
</head>
<body>
  <h1>VelumX Wallet</h1>
  <button id="login-btn">Login</button>
  <pre id="output"></pre>

  <script src="https://cdn.velumx.xyz/sdk/latest/velumx.iife.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js"></script>
  <script>
    const output = document.getElementById('output');
    const loginBtn = document.getElementById('login-btn');

    // Initialize Clerk for auth
    const clerk = new Clerk('your_clerk_publishable_key');
    await clerk.load();

    // Initialize VelumX
    const velumx = new VelumX.VelumxMPC({
      apiKey: 'vx_sk_your_api_key',
      auth: {
        async getSession() {
          return clerk.user ? {
            userId: clerk.user.id,
            sessionToken: await clerk.session.getToken(),
          } : null;
        },
        async login() {
          if (!clerk.user) await clerk.openSignIn();
          return {
            userId: clerk.user.id,
            sessionToken: await clerk.session.getToken(),
          };
        },
        async logout() {
          await clerk.signOut();
        },
      },
      network: 'testnet',
    });

    loginBtn.addEventListener('click', async () => {
      try {
        const wallet = await velumx.login();
        output.textContent = JSON.stringify(wallet, null, 2);

        const balance = await velumx.getBalance();
        output.textContent += '\n\nBalance:\n' + JSON.stringify(balance, null, 2);
      } catch (err) {
        output.textContent = 'Error: ' + err.message;
      }
    });
  </script>
</body>
</html>
```

## Browser Compatibility

| Browser | Minimum Version |
|---------|-----------------|
| Chrome  | 90+             |
| Firefox | 90+             |
| Safari  | 15+             |
| Edge    | 90+             |

Requires `crypto.subtle` (Web Crypto API) for session key generation. A polyfill is provided for older browsers.

## SRI Hash

For production use, include the SRI hash to ensure the script hasn't been tampered with:

```html
<script
  src="https://cdn.velumx.xyz/sdk/0.1.0/velumx.iife.js"
  integrity="sha384-<hash>"
  crossorigin="anonymous"
></script>
```

Find the latest SRI hash in the [release notes](https://github.com/anomalyco/velumx-mpc/releases) or in `dist/cdn/velumx.iife.js.sri`.

## Without CDN

If you prefer to bundle with your own build:

```bash
npm install @velumx/mpc
```

```html
<script type="module">
  import { VelumxMPC } from './node_modules/@velumx/mpc/dist/index.mjs';

  const velumx = new VelumxMPC({ /* config */ });
</script>
```

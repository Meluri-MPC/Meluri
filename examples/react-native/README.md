# VelumX MPC + React Native (Expo)

React Native example using Expo and the VelumX Native SDK.

## Quick Start

```bash
cd examples/react-native
pnpm install
pnpm start
```

Scan the QR code with Expo Go (iOS) or Expo Go (Android).

## Setup

This example uses:
- `@velumx/mpc/native` — Native SDK entry point (no DOM APIs)
- `expo-web-browser` — OAuth browser flow
- `expo-crypto` — Random bytes and hashing
- `@react-native-async-storage/async-storage` — Session persistence

## Structure

```
react-native/
  App.tsx         — Main app with login, balance, send, tx history
  app.json        — Expo config with custom scheme
  babel.config.js — Expo Babel preset
  package.json
  tsconfig.json
```

## Features

- MPC wallet login via native OAuth
- STX balance display
- Send STX form
- Transaction history list
- AsyncStorage-based session persistence

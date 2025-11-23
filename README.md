# Shogun Starter

A TypeScript starter template for building decentralized applications with the Shogun ecosystem. This template includes authentication, GunDB integration, and all the essential Shogun packages pre-configured.

## Features

- **TypeScript** - Full TypeScript support with strict type checking
- **React 18** - Modern React with hooks and functional components
- **Shogun Authentication** - Multiple auth methods (WebAuthn, Web3, Nostr, ZK-Proof)
- **GunDB Integration** - Decentralized peer-to-peer database
- **Shogun Theme** - Consistent styling with Tailwind CSS and DaisyUI
- **Shogun Relays** - Automatic relay discovery and connection
- **Shogun Onion** - Webring widget integration
- **Vite** - Fast development server and optimized builds

## Quick Start

### Prerequisites

- Node.js ≥ 18.0.0
- npm or yarn package manager

### Installation

```bash
# Clone or copy this template
cd shogun-starter

# Install dependencies
yarn install
# or
npm install

# Start development server
yarn dev
# or
npm run dev
```

The app will be available at `http://localhost:8080`

### Production Build

```bash
# Build for production
yarn build
# or
npm run build

# Preview production build
yarn preview
# or
npm run preview
```

## Project Structure

```
shogun-starter/
├── src/
│   ├── components/
│   │   ├── ui/
│   │   │   └── ThemeToggle.tsx    # Theme switcher component
│   │   └── ExampleContent.tsx     # Example content (replace with your app)
│   ├── App.tsx                    # Main application component
│   ├── main.tsx                   # Application entry point
│   ├── polyfills.ts               # Node.js polyfills for browser
│   └── index.css                  # Global styles and theme imports
├── public/
│   └── logo.svg                   # App logo
├── index.html                     # HTML template
├── vite.config.ts                 # Vite configuration
├── tsconfig.json                  # TypeScript configuration
└── package.json                   # Dependencies and scripts
```

## Customization

### Replace Example Content

The `ExampleContent` component in `src/components/ExampleContent.tsx` is a placeholder. Replace it with your own application logic:

```tsx
import { useShogun } from 'shogun-button-react';

const MyApp = () => {
  const { isLoggedIn, userPub, username, sdk } = useShogun();
  
  // Your app logic here
  return <div>Your App</div>;
};
```

### Using the Shogun SDK

Access the Shogun SDK through the `useShogun` hook:

```tsx
import { useShogun } from 'shogun-button-react';

const MyComponent = () => {
  const { isLoggedIn, userPub, username, sdk, logout } = useShogun();
  
  // Access GunDB
  if (sdk?.gun) {
    const user = sdk.gun.user();
    // Use GunDB...
  }
  
  // Access authentication
  if (sdk?.auth) {
    // Use auth methods...
  }
  
  return <div>...</div>;
};
```

### Configuration

Edit `src/App.tsx` to customize Shogun initialization:

```tsx
const { core: shogunCore } = await shogunConnector({
  appName: "Your App Name",
  gunInstance: gun,
  web3: { enabled: true },
  webauthn: { enabled: true, rpName: "Your App" },
  nostr: { enabled: true },
  zkproof: { enabled: true },
  // ... more options
});
```

### Styling

Customize the theme in `src/index.css` or modify `tailwind.config.js` to extend the Shogun theme.

## Available Scripts

- `yarn dev` / `npm run dev` - Start development server
- `yarn build` / `npm run build` - Build for production
- `yarn preview` / `npm run preview` - Preview production build
- `yarn lint` / `npm run lint` - Run ESLint

## Integrated Packages

This starter includes:

- **shogun-core** - Core SDK for authentication and data management
- **shogun-button-react** - React authentication components
- **shogun-theme** - Shared theme configuration
- **shogun-relays** - Relay discovery and management
- **shogun-onion** - Webring widget
- **gun** - Decentralized database
- **react** + **react-router-dom** - UI framework
- **tailwindcss** + **daisyui** - Styling

## TypeScript

This project uses TypeScript with strict type checking. All components and utilities are fully typed. The `tsconfig.json` is configured for modern React development.

## Browser Support

- Chrome ≥ 60
- Firefox ≥ 60
- Safari ≥ 12
- Edge ≥ 79

## License

MIT

## Resources

- [Shogun Documentation](https://shogun-eco.xyz)
- [Shogun Core](https://github.com/scobru/shogun-core)
- [GunDB Documentation](https://gun.eco)

---

Built with ❤️ by the Shogun community


/// <reference types="vite/client" />

declare module '*.svg' {
  const content: string;
  export default content;
}

declare module 'shogun-onion/sitesData.js' {
  const sitesData: Array<{ url: string; [key: string]: any }>;
  export default sitesData;
}


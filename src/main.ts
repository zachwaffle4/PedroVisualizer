import "./app.css";
import { mount } from "svelte";
import App from "./App.svelte";
import { isDesktop } from "./utils/platform";

const app = mount(App, { target: document.body });

// Register the service worker only in production web builds. It uses cache-first
// for the JS/CSS bundle, which breaks hot-reload and can serve stale (un-optimized)
// modules during development. The desktop build already has every asset embedded
// in the binary, so caching there buys nothing and risks serving the previous
// version's bundle after an app update.
if (import.meta.env.PROD && !isDesktop() && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch((error) => {
    console.error(`Service worker registration failed: ${error}`);
  });
}

export default app;

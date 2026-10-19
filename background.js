import { registerAutoClose } from './src/autoclose.js';

// Listeners must be registered synchronously at start-up so Chrome can wake
// the service worker for them.
registerAutoClose(chrome);

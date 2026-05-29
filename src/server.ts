import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createTokenStorage } from "./storage.js";

const config = loadConfig();
const storage = createTokenStorage(config);
const app = createApp(config, storage);

app.listen(config.port, () => {
  console.log(`Performance Review Bot listening on ${config.port}`);
});

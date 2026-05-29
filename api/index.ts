import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createTokenStorage } from "../src/storage.js";

const config = loadConfig();
const storage = createTokenStorage(config);

export default createApp(config, storage);

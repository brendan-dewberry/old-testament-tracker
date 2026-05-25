import assert from "node:assert/strict";
import { once } from "node:events";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createStaticServer } from "../../server.mjs";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("serves the app shell and browser assets over HTTP", async () => {
  const server = createStaticServer({ root: PROJECT_ROOT });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;

    const [htmlResponse, cssResponse, appResponse, configResponse, schemaResponse] =
      await Promise.all([
        fetch(`${baseUrl}/`),
        fetch(`${baseUrl}/styles.css`),
        fetch(`${baseUrl}/src/app.js`),
        fetch(`${baseUrl}/src/supabase-config.js`),
        fetch(`${baseUrl}/supabase/schema.sql`),
      ]);

    assert.equal(htmlResponse.status, 200);
    assert.equal(cssResponse.status, 200);
    assert.equal(appResponse.status, 200);
    assert.equal(configResponse.status, 200);
    assert.equal(schemaResponse.status, 200);

    const [html, css, app, schema] = await Promise.all([
      htmlResponse.text(),
      cssResponse.text(),
      appResponse.text(),
      schemaResponse.text(),
    ]);

    assert.match(html, /<main id="app"/);
    assert.match(html, /type="module" src="\.\/src\/app\.js"/);
    assert.match(css, /\.progress-bar/);
    assert.match(app, /createCloudProgressStore/);
    assert.match(schema, /enable row level security/);
  } finally {
    server.close();
    await once(server, "close");
  }
});

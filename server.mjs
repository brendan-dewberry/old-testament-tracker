import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_ROOT = dirname(fileURLToPath(import.meta.url));

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
};

export function createStaticServer({ root = DEFAULT_ROOT } = {}) {
  const safeRoot = resolve(root);

  return createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://localhost");
      const filePath = await resolveRequestPath({
        pathname: requestUrl.pathname,
        root: safeRoot,
      });
      const contents = await readFile(filePath);

      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream",
      });
      response.end(contents);
    } catch (error) {
      const statusCode = error.statusCode ?? 500;
      response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(statusCode === 404 ? "Not found" : "Server error");
    }
  });
}

async function resolveRequestPath({ pathname, root }) {
  const decodedPath = decodeURIComponent(pathname);
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.slice(1);
  let filePath = resolve(root, relativePath);

  if (!isInsideRoot({ filePath, root })) {
    const error = new Error("Request path is outside the app root.");
    error.statusCode = 403;
    throw error;
  }

  const fileStat = await stat(filePath).catch(() => null);

  if (!fileStat) {
    const error = new Error("Requested file does not exist.");
    error.statusCode = 404;
    throw error;
  }

  if (fileStat.isDirectory()) {
    filePath = join(filePath, "index.html");
  }

  return filePath;
}

function isInsideRoot({ filePath, root }) {
  return filePath === root || filePath.startsWith(`${root}${sep}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 4173);
  const host = process.env.HOST ?? "127.0.0.1";
  const server = createStaticServer();

  server.listen(port, host, () => {
    console.log(`Old Testament Tracker running at http://${host}:${port}`);
  });
}

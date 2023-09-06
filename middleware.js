// @ts-check
import { next, rewrite } from "@vercel/edge";
import { sign, verify, decode } from "@tsndr/cloudflare-worker-jwt";

// ideally this should be stored as a secret
// but this is an example so we don't believe
// in secret hygiene
const SECRET = "666_oh_yeah_666";

/**
 * I wanted to remove the need for a header, for a shorter JWT,
 * because we will always have the same header on every JWT.
 *
 * We can actually leave this and have one more hop, that will install
 * a cookie on the client and then replace the signed token with a hostname
 * to make it shorter. I don't think it's necessary for now.
 */
const getHeader = () => sign({}, SECRET).then((x) => x.split(".")[0]);

/**
 * @param {Request} req
 * @returns {Promise<Response>}
 */
export default async function middleware(req) {
  if (process.env.VERCEL_ENV === "production") {
    return handleProductionRewrite(req);
  }

  // if we are in a preview deployment, but rewritten already, we don't
  // need to redirect.
  if (req.headers.get("x-rewrited") === "1") {
    return next();
  }

  return handlePreviewRewrite(req);
}

/**
 * Take a request for a preview URL and redirect it to the production
 * deployment, while keeping the original hostname in the pathname as a
 * signed JWT
 *
 * For example,
 * https://hello-world-preview-abc.vercel.app/api/hello?foo=bar
 * will be redirected to
 * https://path-based-stuff.vercel.app/-/jwt-containing-hostname:hello-world-preview-abc/api/hello?foo=bar
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
async function handlePreviewRewrite(req) {
  const url = new URL(req.url);
  const signedHostname = await sign(
    { hostname: url.hostname, exp: Date.now() + 1000 * 60 * 60 },
    SECRET
  );
  url.pathname = `/-/${signedHostname.split(".").slice(1).join(".")}/${
    url.pathname
  }`;
  url.hostname = `path-based-stuff.vercel.app`;

  return Response.redirect(url);
}

/**
 * Take a request for a production URL and rewrite it to the preview
 * deployment.
 *
 * This will only work if the pathname starts with `/-/` (can be changed obviously)
 * and if the JWT is valid.
 *
 * Having a signed JWT helps us by not rewriting into any URL, but only
 * URLs generated from our own application. Somewhat protects us from SSRF.
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
async function handleProductionRewrite(req) {
  const { pathname } = new URL(req.url);
  if (!pathname.startsWith("/-/")) {
    return next();
  }

  const [, , partiallySignedData, ...rest] = pathname.split("/");

  const signedData = `${await getHeader()}.${partiallySignedData}`;

  if (!partiallySignedData || !(await verify(signedData, SECRET))) {
    return next();
  }

  const {
    payload: { hostname },
  } = decode(signedData);

  const newUrl = new URL(`/${rest.join("/")}`, req.url);
  newUrl.hostname = hostname;

  const headers = new Headers(req.headers);
  headers.set("x-original-url", req.url);
  headers.set("x-rewrited", "1");
  headers.set("host", newUrl.hostname);
  headers.set("x-forwarded-host", newUrl.hostname);

  console.log({
    headers: Object.fromEntries(headers),
    url: newUrl.toString(),
  });

  return rewrite(newUrl, {
    request: { headers },
  });
}

// @ts-check

/** @type {import('@vercel/node').VercelApiHandler} */
export default (req, res) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html");
  res.write(`<h1>Welcome to my site =)))))</h1>`);
  const fullUrl = `https://${req.headers.host}${req.url}`;
  res.write(`<p>You are visiting ${fullUrl}</p>`);
  res.write(
    `<p><pre>${JSON.stringify(
      {
        headers: req.headers,
        method: req.method,
      },
      null,
      2
    )}</pre></p>`
  );
  res.end();
};

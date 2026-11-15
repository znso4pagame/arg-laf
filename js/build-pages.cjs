// GitHub Pages 打包：源码仍可双击打开；线上资源以内容指纹命名。
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const hash = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 12);

function buildSite(destination = path.join(root, "_site")) {
  const out = path.resolve(destination);
  if (
    out === root ||
    [
      path.join(root, "html"),
      path.join(root, "css"),
      path.join(root, "js"),
    ].includes(out)
  )
    throw new Error("不能把构建输出写入源码目录");
  fs.rmSync(out, { recursive: true, force: true });
  for (const dir of ["html", "css", "js", "assets"])
    fs.mkdirSync(path.join(out, dir), { recursive: true });
  const assets = [
    ...fs
      .readdirSync(path.join(root, "css"))
      .filter((x) => x.endsWith(".css"))
      .map((x) => `css/${x}`),
    "js/app.js",
    "js/data.js",
    "js/clue-matcher.js",
    "js/journey-store.js",
    "js/danny.js",
    "js/timeline.js",
    "js/journey-guide.js",
    "js/motion.js",
    "js/search-index.js",
  ];
  const manifest = {};
  for (const file of assets) {
    const contents = fs.readFileSync(path.join(root, file));
    const extension = path.extname(file);
    const fingerprinted =
      file.slice(0, -extension.length) + "." + hash(contents) + extension;
    fs.writeFileSync(path.join(out, fingerprinted), contents);
    // 兼容仍缓存着上个版本 HTML 的旧地址。
    fs.writeFileSync(path.join(out, file), contents);
    manifest[file] = fingerprinted;
  }
  const images = fs
    .readdirSync(path.join(root, "assets"))
    .filter((x) => x.endsWith(".svg"))
    .sort();
  for (const image of images)
    fs.copyFileSync(
      path.join(root, "assets", image),
      path.join(out, "assets", image),
    );
  const revision = hash(
    JSON.stringify(manifest) +
      fs
        .readdirSync(path.join(root, "html"))
        .sort()
        .map((x) => fs.readFileSync(path.join(root, "html", x)))
        .join("") +
      images.map((x) => fs.readFileSync(path.join(root, "assets", x))).join(""),
  );
  for (const file of fs
    .readdirSync(path.join(root, "html"))
    .filter((x) => x.endsWith(".html"))) {
    const html = fs
      .readFileSync(path.join(root, "html", file), "utf8")
      .replace(
        /\b(href|src)="\.\.\/(css|js)\/([^"?#]+)"/g,
        (match, attr, dir, name) => {
          const asset = manifest[`${dir}/${name}`];
          if (!asset) throw new Error("未打包的资源：" + match);
          return `${attr}="../${asset}"`;
        },
      );
    const versioned = html
      .replace(
        "</head>",
        `  <meta name="site-revision" content="${revision}">\n</head>`,
      )
      .replace(/href="guide\.html"/g, `href="guide.html?rev=${revision}"`)
      .replace(
        /href="index\.html#search"/g,
        `href="index.html?rev=${revision}#search"`,
      );
    fs.writeFileSync(path.join(out, "html", file), versioned);
  }
  const entry = fs
    .readFileSync(path.join(root, "index.html"), "utf8")
    .replace(/html\/index\.html/g, `html/index.html?rev=${revision}`);
  fs.writeFileSync(path.join(out, "index.html"), entry);
  fs.writeFileSync(path.join(out, ".nojekyll"), "");
  return manifest;
}
if (require.main === module) {
  const manifest = buildSite();
  console.log(
    `静态页面已打包到 _site；${Object.keys(manifest).length} 个资源已添加内容指纹。`,
  );
}
module.exports = { buildSite };

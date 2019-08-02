const fs = require("fs");
const path = require("path");
const requestImageSize = require("request-image-size");
const Jimp = require("jimp");

const IMAGE_URL_REGEX = /\.gif|\.jpg|\.jpeg|\.png/i;
const SCRIPT_URL_REGEX = /\.js/i;
const PLACEHOLDER_IMAGE_URL = path.resolve(__dirname, "./placeholder.png");
const PLACEHOLDER_IMAGE_URL_BUFFER = fs.readFileSync(PLACEHOLDER_IMAGE_URL);
const HEADERS = {};

module.exports = async function(page, scenario) {
  const intercept = async (request, targetUrl) => {
    let scenarioUrl = clearUrl(scenario.url);
    let scenarioreferenceUrl = clearUrl(scenario.referenceUrl);
    let url = clearUrl(request.url());

    if (
      scenarioUrl !== url &&
      scenarioreferenceUrl !== url &&
      request._resourceType === "document"
    ) {
      await request.respond({
        body: "",
        headers: HEADERS,
        status: 200
      });
      return;
    }
    if (SCRIPT_URL_REGEX.test(request.url())) {
      await request.respond({
        body: "",
        headers: HEADERS,
        status: 200
      });
      return;
    }
    if (
      IMAGE_URL_REGEX.test(request.url()) ||
      request.url().startsWith("data:image/")
    ) {
      await request.respond({
        body: await getResizedImageSize(request.url()),
        headers: HEADERS,
        status: 200
      });
      return;
    }
    request.continue();
  };
  await page.setRequestInterception(true);
  page.on("request", intercept);
};

function clearUrl(url) {
  return url
    .replace(/\/\s*$/, "")
    .split("#")[0]
    .replace(/^http:\/\//i, "https://");
}

async function getResizedImageSize(url) {
  const imageSize = await requestImageSize(url);
  const placeholder = await Jimp.read(PLACEHOLDER_IMAGE_URL_BUFFER);
  var test = placeholder
    .cover(imageSize.width, imageSize.height)
    .quality(50)
    .getBufferAsync(Jimp.AUTO);

  return test;
}

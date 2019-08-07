const fs = require("fs");
const path = require("path");
const requestImageSize = require("request-image-size");
const Jimp = require("jimp");
const sizeOf = require("image-size");
const axios = require("axios");

const IMAGE_URL_REGEX = /\.gif|\.jpg|\.jpeg|\.png/i;
const SCRIPT_URL_REGEX = /\.js/i;
const PLACEHOLDER_IMAGE_URL = path.resolve(__dirname, "./placeholder.png");
const PLACEHOLDER_IMAGE_URL_BUFFER = fs.readFileSync(PLACEHOLDER_IMAGE_URL);
const HEADERS = {};

module.exports = async function(page, scenario) {
  const intercept = async (request, targetUrl) => {
    if (typeof scenario.imagePlaceholder === "undefined") {
      scenario.imagePlaceholder = {};
    }

    let scenarioUrl = clearUrl(scenario.url);
    let scenarioreferenceUrl = clearUrl(scenario.referenceUrl);
    let url = clearUrl(request.url());

    let type = "";
    try {
      const contentHead = await axios.head(request.url(), {
        timeout: 1000
      });
      if (
        typeof contentHead.headers !== "undefined" &&
        typeof contentHead.headers["content-type"] !== "undefined"
      )
        type = contentHead.headers["content-type"].split("/")[0];
    } catch (error) {}

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
    /*
    if (SCRIPT_URL_REGEX.test(request.url())) {
      await request.respond({
        body: "",
        headers: HEADERS,
        status: 200
      });
      return;
    }*/
    if (
      IMAGE_URL_REGEX.test(request.url()) ||
      request.url().startsWith("data:image/") ||
      type === "image"
    ) {
      await request.respond({
        body: await getResizedImageSize(request.url(), scenario),
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

async function getResizedImageSize(url, scenario) {
  let imageSize;
  if (url.startsWith("data:image/")) {
    var img = Buffer.from(url.split(",")[1], "base64");
    imageSize = sizeOf(img);
  } else {
    imageSize = await requestImageSize(url);
  }
  if (
    typeof scenario.imagePlaceholder[
      imageSize.width + "x" + imageSize.height
    ] !== "undefined"
  ) {
    return scenario.imagePlaceholder[imageSize.width + "x" + imageSize.height];
  } else {
    const placeholder = await Jimp.read(PLACEHOLDER_IMAGE_URL_BUFFER);
    var placeholderImage = placeholder
      .cover(imageSize.width, imageSize.height)
      .quality(20)
      .getBufferAsync(Jimp.AUTO);

    scenario.imagePlaceholder[
      imageSize.width + "x" + imageSize.height
    ] = placeholderImage;

    return placeholderImage;
  }
}

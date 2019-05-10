"use strict";

module.exports = {
    "browser": "chrome",
    "engine": "puppeteer",
    "scriptsFolder": "puppeteer_scripts",
    "engineOptions": {
        "backstopKey": "engineOptions",
        "options": {
            "waitTimeout": 20000,
            "ignoreHTTPSErrors": true,
            "args": [
                // "--no-sandbox",
                // "--disable-setuid-sandbox",
                // "--no-zygote",
                "--disable-dev-shm-usage",
                "--lang=en-GB,en-US",
                "--headless",
                "--disable-gpu",
                "--ignore-certificate-errors",
                "--force-device-scale-factor=1",
                "--disable-infobars=true",
                "--process-per-site",
                "--disable-accelerated-2d-canvas",
                "--disable-accelerated-jpeg-decoding",
                "--disable-accelerated-mjpeg-decode",
                "--disable-accelerated-video-decode",
                "--disable-gpu-rasterization",
                "--disable-zero-copy",
                "--disable-extensions",
                "--disable-notifications",
                "--disable-sync",
                "--mute-audio"
            ]
        }
    }
};

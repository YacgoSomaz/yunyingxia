"use strict";

const crypto = require("node:crypto");

const LOCAL_API_TOKEN_ENV = "WANSHAN_LOCAL_API_TOKEN";
const LOCAL_API_TOKEN_HEADER = "x-wanshan-local-token";

function issueLocalApiToken() {
    return crypto.randomBytes(32).toString("base64url");
}

function isLocalApiTokenAccepted(expected, received) {
    if (typeof expected !== "string" || typeof received !== "string" || !expected || !received) {
        return false;
    }
    const expectedBytes = Buffer.from(expected, "utf8");
    const receivedBytes = Buffer.from(received, "utf8");
    return expectedBytes.length === receivedBytes.length && crypto.timingSafeEqual(expectedBytes, receivedBytes);
}

function isLocalApiRequestAllowed(expected, received, operationEntitled, method) {
    if (!isLocalApiTokenAccepted(expected, received)) {
        return false;
    }
    const normalizedMethod = String(method || "").toUpperCase();
    if (["GET", "HEAD", "OPTIONS"].includes(normalizedMethod)) {
        return true;
    }
    return operationEntitled === true || operationEntitled === "1";
}

module.exports = {
    LOCAL_API_TOKEN_ENV,
    LOCAL_API_TOKEN_HEADER,
    issueLocalApiToken,
    isLocalApiRequestAllowed,
    isLocalApiTokenAccepted,
};

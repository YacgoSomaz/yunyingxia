"use strict";

function isReadOnlyMethod(method) {
    return ["GET", "HEAD", "OPTIONS"].includes(String(method || "").toUpperCase());
}

async function verifyPaidOperationAccess(verifyAccess, method) {
    if (isReadOnlyMethod(method) || typeof verifyAccess !== "function") {
        return isReadOnlyMethod(method);
    }
    try {
        return (await verifyAccess()) === true;
    }
    catch (_error) {
        return false;
    }
}

module.exports = {
    isReadOnlyMethod,
    verifyPaidOperationAccess,
};
